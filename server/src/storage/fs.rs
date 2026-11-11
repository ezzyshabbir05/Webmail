use super::{BlobStorage, StorageError};
use std::path::{Path, PathBuf};
use tokio::fs;

#[derive(Clone)]
pub struct FsBlobStorage {
    base_path: PathBuf,
}

impl FsBlobStorage {
    pub fn new(base_path: impl AsRef<Path>) -> Self {
        Self {
            base_path: base_path.as_ref().to_path_buf(),
        }
    }

    fn blob_path(&self, sha256: &str) -> PathBuf {
        let prefix = if sha256.len() >= 2 { &sha256[..2] } else { "00" };
        self.base_path.join(prefix).join(sha256)
    }
}

impl BlobStorage for FsBlobStorage {
    fn put_blob<'a>(
        &'a self,
        sha256: &'a str,
        data: &'a [u8],
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), StorageError>> + Send + 'a>> {
        Box::pin(async move {
            let path = self.blob_path(sha256);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).await?;
            }
            fs::write(path, data).await?;
            Ok(())
        })
    }

    fn get_blob<'a>(
        &'a self,
        sha256: &'a str,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<Vec<u8>, StorageError>> + Send + 'a>> {
        Box::pin(async move {
            let path = self.blob_path(sha256);
            if !path.exists() {
                return Err(StorageError::NotFound(sha256.to_string()));
            }
            let bytes = fs::read(path).await?;
            Ok(bytes)
        })
    }

    fn has_blob<'a>(
        &'a self,
        sha256: &'a str,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<bool, StorageError>> + Send + 'a>> {
        Box::pin(async move {
            let path = self.blob_path(sha256);
            Ok(path.exists())
        })
    }

    fn delete_blob<'a>(
        &'a self,
        sha256: &'a str,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), StorageError>> + Send + 'a>> {
        Box::pin(async move {
            let path = self.blob_path(sha256);
            if path.exists() {
                fs::remove_file(path).await?;
            }
            Ok(())
        })
    }
}
