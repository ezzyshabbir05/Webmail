pub mod fs;
pub mod s3;

use std::sync::Arc;
use crate::config::{PostarcConfig, StorageBackend};
use crate::db::MailRepository;
use tracing::{error, info};

#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("S3 error: {0}")]
    S3(String),
    #[error("Blob not found: {0}")]
    NotFound(String),
}

pub trait BlobStorage: Send + Sync {
    fn put_blob<'a>(
        &'a self,
        sha256: &'a str,
        data: &'a [u8],
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), StorageError>> + Send + 'a>>;

    fn get_blob<'a>(
        &'a self,
        sha256: &'a str,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<Vec<u8>, StorageError>> + Send + 'a>>;

    fn has_blob<'a>(
        &'a self,
        sha256: &'a str,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<bool, StorageError>> + Send + 'a>>;

    fn delete_blob<'a>(
        &'a self,
        sha256: &'a str,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), StorageError>> + Send + 'a>>;
}

pub async fn init_storage(config: &PostarcConfig) -> Arc<dyn BlobStorage> {
    match config.storage_backend {
        StorageBackend::S3 => {
            if let (Some(bucket), Some(endpoint), Some(key_id), Some(secret_key)) = (
                &config.r2_bucket,
                &config.r2_endpoint,
                &config.r2_access_key_id,
                &config.r2_secret_access_key,
            ) {
                info!("Initializing Cloudflare R2 / S3 Blob Storage (Bucket: {})", bucket);
                Arc::new(s3::S3BlobStorage::new(bucket, endpoint, key_id, secret_key).await)
            } else {
                info!("R2 credentials incomplete. Falling back to Filesystem Blob Storage at: {}", config.storage_fs_path);
                Arc::new(fs::FsBlobStorage::new(&config.storage_fs_path))
            }
        }
        StorageBackend::Filesystem => {
            info!("Initializing Local Filesystem Blob Storage at: {}", config.storage_fs_path);
            Arc::new(fs::FsBlobStorage::new(&config.storage_fs_path))
        }
    }
}

pub fn spawn_blob_gc_worker(repo: MailRepository, storage: Arc<dyn BlobStorage>) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(86400)); // Every 24 hours
        loop {
            interval.tick().await;
            info!("Running 24-hour blob storage garbage collection sweep...");
            let candidates: Result<Vec<(String,)>, sqlx::Error> = sqlx::query_as(
                r#"
                SELECT sha256 FROM message_blobs
                WHERE status = 'pending_purge' AND purge_after <= NOW()
                "#,
            )
            .fetch_all(repo.pool())
            .await;

            match candidates {
                Ok(rows) => {
                    let count = rows.len();
                    for row in rows {
                        let sha = row.0;
                        if let Err(e) = storage.delete_blob(&sha).await {
                            error!("Failed to delete blob {} from storage: {}", sha, e);
                        } else {
                            let _ = sqlx::query("DELETE FROM message_blobs WHERE sha256 = $1")
                                .bind(&sha)
                                .execute(repo.pool())
                                .await;
                        }
                    }
                    info!("Garbage collection sweep completed (purged {} expired blobs).", count);
                }
                Err(e) => {
                    error!("Error querying pending purge blobs: {}", e);
                }
            }
        }
    });
}
