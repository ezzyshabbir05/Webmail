use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Clone)]
pub struct Storage {
    local_dir: PathBuf,
    r2_bucket: Option<String>,
}

impl Storage {
    pub fn new(local_path: &str, r2_bucket: Option<String>) -> Self {
        let local_dir = PathBuf::from(local_path);
        fs::create_dir_all(&local_dir).ok();

        Self {
            local_dir,
            r2_bucket,
        }
    }

    pub async fn save_blob(&self, data: &[u8]) -> Result<String, std::io::Error> {
        let blob_id = Uuid::new_v4().to_string();
        let file_path = self.local_dir.join(&blob_id);
        tokio::fs::write(&file_path, data).await?;
        Ok(blob_id)
    }

    pub async fn get_blob(&self, blob_id: &str) -> Option<Vec<u8>> {
        let file_path = self.local_dir.join(blob_id);
        tokio::fs::read(&file_path).await.ok()
    }

    pub async fn delete_blob(&self, blob_id: &str) {
        let file_path = self.local_dir.join(blob_id);
        tokio::fs::remove_file(&file_path).await.ok();
    }
}
