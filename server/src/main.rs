mod api;
mod config;
mod db;
mod dkim;
mod smtp;
mod storage;

use api::ApiState;
use config::Config;
use db::Database;
use dkim::DkimManager;
use smtp::{server::create_tls_acceptor, SmtpClient, SmtpServer};
use storage::Storage;
use std::sync::Arc;
use tokio::net::TcpListener;
use tracing::{error, info};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "postarc_server=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("Starting Postarc Mail Server...");

    let config = Arc::new(Config::from_env());
    info!("Hostname: {}", config.hostname);
    info!("Domain: {}", config.domain);
    info!("Database Path: {}", config.database_path);

    // 1. Initialize SQLite Database
    let db = Arc::new(Database::new(&config.database_path)?);

    // 2. Initialize Blob Storage (Local + Cloudflare R2)
    let storage = Arc::new(Storage::new(
        &config.storage_path,
        config.r2_bucket_name.clone(),
    ));

    // 3. Initialize DKIM Keypair & Manager
    let dkim = Arc::new(DkimManager::new(&config.domain, "postarc"));
    info!("=== DKIM Configuration ===");
    info!("Record Name:  {}", dkim.dns_record_name());
    info!("Record Value: {}", dkim.dns_record_value());

    // 4. Auto-provision Administrator Account
    if let Some(ref pass) = config.admin_password {
        let admin_email = format!("{}@{}", config.admin_user, config.domain);
        if !db.user_exists(&admin_email) {
            match db.create_user(&admin_email, pass) {
                Ok(uid) => info!("Created initial administrator: {} (id: {})", admin_email, uid),
                Err(e) => error!("Failed to create administrator {}: {}", admin_email, e),
            }
        } else {
            info!("Administrator account {} is ready", admin_email);
        }
    }

    // 5. Setup TLS Acceptor (Self-Signed / Modern TLS)
    let tls_acceptor = create_tls_acceptor(&config.hostname);

    // 6. Initialize Outbound SMTP Client
    let smtp_client = Arc::new(SmtpClient::new(config.clone(), dkim.clone()));

    // 7. Start Inbound SMTP Server (Port 25)
    let smtp_server = Arc::new(SmtpServer::new(
        config.clone(),
        db.clone(),
        storage.clone(),
        tls_acceptor.clone(),
    ));

    let smtp_port = config.smtp_port;
    let smtp_server_task = smtp_server.clone();
    tokio::spawn(async move {
        if let Err(e) = smtp_server_task.run(smtp_port).await {
            error!("SMTP Server on port {} exited: {}", smtp_port, e);
        }
    });

    // Also listen on Submission port 587 if different
    if config.submission_port != config.smtp_port {
        let sub_port = config.submission_port;
        let sub_server_task = smtp_server.clone();
        tokio::spawn(async move {
            if let Err(e) = sub_server_task.run(sub_port).await {
                error!("Submission Server on port {} exited: {}", sub_port, e);
            }
        });
    }

    // 8. Start HTTP / JMAP API Server (Port 8080)
    let api_state = Arc::new(ApiState {
        config: config.clone(),
        db: db.clone(),
        storage: storage.clone(),
        smtp_client: smtp_client.clone(),
    });

    let app = api::router(api_state);
    let http_addr = format!("0.0.0.0:{}", config.http_port);
    let http_listener = TcpListener::bind(&http_addr).await?;
    info!("HTTP & JMAP API listening on http://{}", http_addr);

    axum::serve(http_listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    info!("Postarc Mail Server shut down successfully.");
    Ok(())
}

async fn shutdown_signal() {
    tokio::signal::ctrl_c()
        .await
        .expect("failed to install CTRL+C signal handler");
    info!("Shutting down Postarc Mail Server...");
}
