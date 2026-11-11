use std::env;
use std::net::SocketAddr;

#[derive(Clone, Debug)]
#[allow(dead_code)]
pub struct PostarcConfig {
    pub mail_domain: String,
    pub hostname: String,
    pub admin_email: String,
    pub admin_password: String,
    pub database_url: String,

    // Bind Addresses
    pub smtp_bind_addr: SocketAddr,
    pub submission_bind_addr: SocketAddr,
    pub imaps_bind_addr: SocketAddr,
    pub jmap_bind_addr: SocketAddr,

    // Storage Options
    pub storage_backend: StorageBackend,
    pub storage_fs_path: String,
    pub r2_bucket: Option<String>,
    pub r2_endpoint: Option<String>,
    pub r2_access_key_id: Option<String>,
    pub r2_secret_access_key: Option<String>,

    // TLS & Auth
    pub tls_cert_path: Option<String>,
    pub tls_key_path: Option<String>,
    pub jwt_secret: String,

    // External Services
    pub rspamd_url: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum StorageBackend {
    S3,
    Filesystem,
}

impl PostarcConfig {
    pub fn from_env() -> Self {
        dotenvy::dotenv().ok();

        let mail_domain = env::var("MAIL_DOMAIN").unwrap_or_else(|_| "localhost".to_string());
        let hostname = env::var("MAIL_HOSTNAME").unwrap_or_else(|_| format!("mail.{}", mail_domain));
        let admin_email = env::var("ADMIN_EMAIL").unwrap_or_else(|_| format!("admin@{}", mail_domain));
        let admin_password = env::var("ADMIN_PASSWORD").unwrap_or_else(|_| "admin123".to_string());
        let database_url = env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://postarc:secret@localhost:5432/postarc".to_string());

        let smtp_bind_addr = env::var("SMTP_BIND_ADDR")
            .unwrap_or_else(|_| "0.0.0.0:25".to_string())
            .parse()
            .unwrap_or_else(|_| "0.0.0.0:25".parse().unwrap());

        let submission_bind_addr = env::var("SUBMISSION_BIND_ADDR")
            .unwrap_or_else(|_| "0.0.0.0:587".to_string())
            .parse()
            .unwrap_or_else(|_| "0.0.0.0:587".parse().unwrap());

        let imaps_bind_addr = env::var("IMAPS_BIND_ADDR")
            .unwrap_or_else(|_| "0.0.0.0:993".to_string())
            .parse()
            .unwrap_or_else(|_| "0.0.0.0:993".parse().unwrap());

        let jmap_bind_addr = env::var("JMAP_BIND_ADDR")
            .unwrap_or_else(|_| "0.0.0.0:8080".to_string())
            .parse()
            .unwrap_or_else(|_| "0.0.0.0:8080".parse().unwrap());

        let r2_bucket = env::var("R2_BUCKET").ok();
        let r2_endpoint = env::var("R2_ENDPOINT").ok();
        let r2_access_key_id = env::var("R2_ACCESS_KEY_ID").ok();
        let r2_secret_access_key = env::var("R2_SECRET_ACCESS_KEY").ok();

        let storage_backend = match env::var("STORAGE_BACKEND").as_deref() {
            Ok("s3") | Ok("r2") => StorageBackend::S3,
            _ => {
                if r2_bucket.is_some() && r2_endpoint.is_some() {
                    StorageBackend::S3
                } else {
                    StorageBackend::Filesystem
                }
            }
        };

        let storage_fs_path = env::var("STORAGE_FS_PATH").unwrap_or_else(|_| "data/blobs".to_string());

        let tls_cert_path = env::var("TLS_CERT_PATH").ok();
        let tls_key_path = env::var("TLS_KEY_PATH").ok();
        let jwt_secret = env::var("JWT_SECRET").unwrap_or_else(|_| "postarc-secure-secret-key-32chars-min!!".to_string());

        let rspamd_url = env::var("RSPAMD_URL").ok();

        Self {
            mail_domain,
            hostname,
            admin_email,
            admin_password,
            database_url,
            smtp_bind_addr,
            submission_bind_addr,
            imaps_bind_addr,
            jmap_bind_addr,
            storage_backend,
            storage_fs_path,
            r2_bucket,
            r2_endpoint,
            r2_access_key_id,
            r2_secret_access_key,
            tls_cert_path,
            tls_key_path,
            jwt_secret,
            rspamd_url,
        }
    }
}
