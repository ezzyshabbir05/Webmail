mod auth;
mod config;
mod db;
mod event_bus;
mod jmap;
mod smtp;
mod storage;

use config::PostarcConfig;
use db::MailRepository;
use event_bus::EventBus;
use tracing::{error, info, warn, Level};
use tracing_subscriber::FmtSubscriber;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing / structured logging
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .with_target(false)
        .finish();
    tracing::subscriber::set_global_default(subscriber)
        .expect("Failed to initialize tracing subscriber");

    // Load runtime configuration
    let config = PostarcConfig::from_env();

    print_banner(&config);

    info!("Starting Postarc Mailserver daemon...");
    info!("Domain: {}", config.mail_domain);
    info!("Hostname: {}", config.hostname);
    info!("SMTP Port: {}", config.smtp_bind_addr);
    info!("Submission Port: {}", config.submission_bind_addr);
    info!("IMAPS Port: {}", config.imaps_bind_addr);
    info!("JMAP API Port: {}", config.jmap_bind_addr);
    info!("Storage Mode: {:?}", config.storage_backend);

    // Initialize In-Process Event Bus
    let event_bus = EventBus::new(2048);
    info!("In-process event bus initialized (tokio::broadcast, 2048 slot ring).");

    // Initialize Content-Addressed Blob Storage
    let storage = storage::init_storage(&config).await;
    info!("Blob storage subsystem ready.");

    // Initialize Database
    let repo_opt = match db::init_pool(&config.database_url).await {
        Ok(pool) => {
            info!("Connected to PostgreSQL successfully.");
            let repo = MailRepository::new(pool);
            if let Err(e) = repo.run_migrations().await {
                error!("Failed to execute database migrations: {}", e);
                return Err(Box::new(e) as Box<dyn std::error::Error>);
            }
            info!("PostgreSQL schema migrations verified/applied.");

            match repo.seed_default_account(&config.mail_domain, "admin123").await {
                Ok(acc) => info!("Default admin mailbox ready: {}", acc.email),
                Err(e) => error!("Failed to seed admin account: {}", e),
            }

            // Spawn background soft-delete cleaner
            storage::spawn_blob_gc_worker(repo.clone(), storage.clone());
            info!("Background soft-delete garbage collection worker spawned.");

            // Spawn outbound delivery queue worker
            smtp::spawn_outbound_queue_worker(repo.clone(), storage.clone(), event_bus.clone());
            info!("Outbound delivery queue worker active.");

            Some(repo)
        }
        Err(e) => {
            warn!("PostgreSQL connection unavailable: {}. (Run 'docker compose up -d' for full stack)", e);
            None
        }
    };

    if let Some(repo) = repo_opt {
        info!("Core database subsystem active and ready.");

        // Start JMAP & HTTP server
        let app_state = jmap::AppState {
            repo: repo.clone(),
            storage: storage.clone(),
            event_bus: event_bus.clone(),
            default_domain: config.mail_domain.clone(),
        };

        let jmap_bind_addr = config.jmap_bind_addr;
        tokio::spawn(async move {
            if let Err(e) = jmap::run_jmap_server(jmap_bind_addr, app_state).await {
                error!("JMAP server terminated with error: {}", e);
            }
        });

        // Start SMTP Inbound MTA (Port 25)
        let smtp_addr = config.smtp_bind_addr;
        let smtp_repo = repo.clone();
        let smtp_storage = storage.clone();
        let smtp_bus = event_bus.clone();
        let smtp_hostname = config.hostname.clone();
        tokio::spawn(async move {
            if let Err(e) = smtp::run_smtp_listener(
                smtp_addr,
                false,
                smtp_repo,
                smtp_storage,
                smtp_bus,
                smtp_hostname,
            )
            .await
            {
                error!("SMTP Port 25 listener terminated with error: {}", e);
            }
        });

        // Start SMTP Submission (Port 587)
        let sub_addr = config.submission_bind_addr;
        let sub_repo = repo.clone();
        let sub_storage = storage.clone();
        let sub_bus = event_bus.clone();
        let sub_hostname = config.hostname.clone();
        tokio::spawn(async move {
            if let Err(e) = smtp::run_smtp_listener(
                sub_addr,
                true,
                sub_repo,
                sub_storage,
                sub_bus,
                sub_hostname,
            )
            .await
            {
                error!("SMTP Submission Port 587 listener terminated with error: {}", e);
            }
        });
    }

    info!("Postarc daemon core initialized. Awaiting shutdown signal...");

    tokio::select! {
        _ = tokio::signal::ctrl_c() => {
            info!("Received shutdown signal. Gracefully shutting down Postarc Mailserver...");
        }
    }

    info!("Postarc Mailserver terminated cleanly.");
    Ok(())
}

fn print_banner(config: &PostarcConfig) {
    println!(r#"
  ██████╗  ██████╗ ███████╗████████╗ █████╗ ██████╗  ██████╗
  ██╔══██╗██╔═══██╗██╔════╝╚══██╔══╝██╔══██╗██╔══██╗██╔════╝
  ██████╔╝██║   ██║███████╗   ██║   ███████║██████╔╝██║     
  ██╔═══╝ ██║   ██║╚════██║   ██║   ██╔══██║██╔══██╗██║     
  ██║     ╚██████╔╝███████║   ██║   ██║  ██║██║  ██║╚██████╗
  ╚═╝      ╚═════╝ ╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝
  Postarc Mailserver v0.1.0 - Unified Single-Daemon Rust Engine
  Domain: {} | Storage: {:?}
"#, config.mail_domain, config.storage_backend);
}
