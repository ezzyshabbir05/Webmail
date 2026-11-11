use super::{BlobStorage, StorageError};
use aws_sdk_s3::config::{Credentials, Region};
use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::Client;

#[derive(Clone)]
pub struct S3BlobStorage {
    client: Client,
    bucket: String,
}

impl S3BlobStorage {
    pub async fn new(bucket: &str, endpoint: &str, access_key: &str, secret_key: &str) -> Self {
        let credentials = Credentials::new(access_key, secret_key, None, None, "postarc-static");
        let mut builder = aws_sdk_s3::Config::builder()
            .behavior_version(aws_sdk_s3::config::BehaviorVersion::latest())
            .credentials_provider(credentials)
            .region(Region::new("auto"))
            .force_path_style(true);

        if !endpoint.is_empty() {
            builder = builder.endpoint_url(endpoint);
        }

        let config = builder.build();
        let client = Client::from_conf(config);

        Self {
            client,
            bucket: bucket.to_string(),
        }
    }

    fn object_key(&self, sha256: &str) -> String {
        let prefix = if sha256.len() >= 2 { &sha256[..2] } else { "00" };
        format!("blobs/{}/{}", prefix, sha256)
    }
}

impl BlobStorage for S3BlobStorage {
    fn put_blob<'a>(
        &'a self,
        sha256: &'a str,
        data: &'a [u8],
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), StorageError>> + Send + 'a>> {
        Box::pin(async move {
            let key = self.object_key(sha256);
            let body = ByteStream::from(data.to_vec());

            self.client
                .put_object()
                .bucket(&self.bucket)
                .key(key)
                .body(body)
                .send()
                .await
                .map_err(|e| StorageError::S3(e.to_string()))?;

            Ok(())
        })
    }

    fn get_blob<'a>(
        &'a self,
        sha256: &'a str,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<Vec<u8>, StorageError>> + Send + 'a>> {
        Box::pin(async move {
            let key = self.object_key(sha256);

            let res = self
                .client
                .get_object()
                .bucket(&self.bucket)
                .key(key)
                .send()
                .await
                .map_err(|e| StorageError::S3(e.to_string()))?;

            let bytes = res
                .body
                .collect()
                .await
                .map_err(|e| StorageError::S3(e.to_string()))?
                .into_bytes();

            Ok(bytes.to_vec())
        })
    }

    fn has_blob<'a>(
        &'a self,
        sha256: &'a str,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<bool, StorageError>> + Send + 'a>> {
        Box::pin(async move {
            let key = self.object_key(sha256);

            match self
                .client
                .head_object()
                .bucket(&self.bucket)
                .key(key)
                .send()
                .await
            {
                Ok(_) => Ok(true),
                Err(aws_sdk_s3::error::SdkError::ServiceError(err)) if err.err().is_not_found() => Ok(false),
                Err(e) => Err(StorageError::S3(e.to_string())),
            }
        })
    }

    fn delete_blob<'a>(
        &'a self,
        sha256: &'a str,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), StorageError>> + Send + 'a>> {
        Box::pin(async move {
            let key = self.object_key(sha256);

            self.client
                .delete_object()
                .bucket(&self.bucket)
                .key(key)
                .send()
                .await
                .map_err(|e| StorageError::S3(e.to_string()))?;

            Ok(())
        })
    }
}
