use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub hostname: String,
    pub domain: String,
    pub database_path: String,
    pub storage_path: String,
    pub admin_user: String,
    pub admin_password: Option<String>,
    pub smtp_port: u16,
    pub submission_port: u16,
    pub http_port: u16,
    pub r2_account_id: Option<String>,
    pub r2_access_key: Option<String>,
    pub r2_secret_key: Option<String>,
    pub r2_bucket_name: Option<String>,
}

impl Config {
    pub fn from_env() -> Self {
        let hostname = env::var("POSTARC_HOSTNAME")
            .or_else(|_| env::var("STALWART_HOSTNAME"))
            .unwrap_or_else(|_| "mail.example.com".to_string());

        let domain = env::var("POSTARC_DOMAIN")
            .unwrap_or_else(|_| {
                // Infer domain from hostname (e.g. mail.agilique.com -> agilique.com)
                if let Some(idx) = hostname.find('.') {
                    hostname[idx + 1..].to_string()
                } else {
                    "example.com".to_string()
                }
            });

        let database_path = env::var("POSTARC_DATABASE_PATH")
            .unwrap_or_else(|_| "/var/lib/postarc/postarc.db".to_string());

        let storage_path = env::var("POSTARC_STORAGE_PATH")
            .unwrap_or_else(|_| "/var/lib/postarc/blobs".to_string());

        let admin_user = env::var("ADMIN_USER").unwrap_or_else(|_| "admin".to_string());
        let admin_password = env::var("ADMIN_PASSWORD").ok();

        let smtp_port = env::var("SMTP_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(25);

        let submission_port = env::var("SUBMISSION_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(587);

        let http_port = env::var("HTTP_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(8080);

        let r2_account_id = env::var("CLOUDFLARE_R2_ACCOUNT_ID").ok();
        let r2_access_key = env::var("CLOUDFLARE_R2_ACCESS_KEY_ID").ok();
        let r2_secret_key = env::var("CLOUDFLARE_R2_SECRET_ACCESS_KEY").ok();
        let r2_bucket_name = env::var("CLOUDFLARE_R2_BUCKET_NAME").ok();

        Self {
            hostname,
            domain,
            database_path,
            storage_path,
            admin_user,
            admin_password,
            smtp_port,
            submission_port,
            http_port,
            r2_account_id,
            r2_access_key,
            r2_secret_key,
            r2_bucket_name,
        }
    }
}
