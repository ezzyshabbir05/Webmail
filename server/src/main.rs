mod auth;
mod config;
mod db;

use config::PostarcConfig;
use db::MailRepository;
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

    // Initialize Database
    let repo = match db::init_pool(&config.database_url).await {
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

            Some(repo)
        }
        Err(e) => {
            warn!("PostgreSQL connection unavailable: {}. (Run 'docker compose up -d' for full stack)", e);
            None
        }
    };

    if repo.is_some() {
        info!("Core database subsystem active and ready.");
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
