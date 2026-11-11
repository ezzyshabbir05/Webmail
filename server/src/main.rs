mod auth;
mod cli;
mod config;
mod db;
mod event_bus;
mod imap;
mod jmap;
mod security;
mod smtp;
mod storage;
mod tls;

use clap::Parser;
use cli::{Cli, Commands};
use config::PostarcConfig;
use db::MailRepository;
use event_bus::EventBus;
use security::SecurityManager;
use tls::TlsManager;
use tracing::{error, info, warn, Level};
use tracing_subscriber::FmtSubscriber;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Install Rustls cryptographic provider (Ring)
    let _ = tokio_rustls::rustls::crypto::ring::default_provider().install_default();

    // Parse CLI arguments
    let cli = Cli::parse();

    // If a subcommand was specified (setup, doctor, domain, user, alias, dkim), dispatch to it
    if let Some(cmd) = cli.command {
        match cmd {
            Commands::Setup => return cli::setup::run_setup_wizard().await,
            Commands::Doctor { domain } => return cli::doctor::run_doctor(domain).await,
            Commands::Domain { cmd } => return cli::domain::handle_domain_command(cmd).await,
            Commands::User { cmd } => return cli::user::handle_user_command(cmd).await,
            Commands::Alias { cmd } => return cli::alias::handle_alias_command(cmd).await,
            Commands::Dkim { cmd } => return cli::dkim::handle_dkim_command(cmd).await,
            Commands::Run => {
                // Proceed to daemon execution
            }
        }
    }

    // Default execution: Start the unified mail daemon
    run_daemon().await
}

async fn run_daemon() -> Result<(), Box<dyn std::error::Error>> {
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
    info!("SMTPS Port: {}", config.smtps_bind_addr);
    info!("Submission Port: {}", config.submission_bind_addr);
    info!("IMAP Port: {}", config.imap_bind_addr);
    info!("IMAPS Port: {}", config.imaps_bind_addr);
    info!("JMAP API Port: {}", config.jmap_bind_addr);
    info!("Storage Mode: {:?}", config.storage_backend);

    // 1. Initialize In-Process Event Bus
    let event_bus = EventBus::new(4096);
    info!("In-process event bus initialized (tokio::broadcast, 4096 slot ring).");

    // 2. Initialize Hot-reloading TLS Manager
    let tls_manager = TlsManager::new(
        config.hostname.clone(),
        config.tls_cert_path.as_deref(),
        config.tls_key_path.as_deref(),
    );

    // 3. Initialize Security & Rate Limiting Manager
    let security_manager = SecurityManager::new();

    // 4. Initialize Content-Addressed Blob Storage (with Zstandard transparent compression)
    let storage = storage::init_storage(&config).await;
    info!("Blob storage subsystem ready (Zstandard compression active).");

    // 5. Initialize Database
    let repo_opt = match db::init_pool(&config.database_url).await {
        Ok(pool) => {
            info!("Connected to PostgreSQL successfully.");
            let repo = MailRepository::new(pool);
            if let Err(e) = repo.run_migrations().await {
                error!("Failed to execute database migrations: {}", e);
                return Err(Box::new(e) as Box<dyn std::error::Error>);
            }
            info!("PostgreSQL schema migrations verified/applied.");

            match repo.seed_default_account(&config.admin_email, &config.admin_password).await {
                Ok(acc) => info!("Admin mailbox ready: {}", acc.email),
                Err(e) => error!("Failed to seed admin account: {}", e),
            }

            // Spawn background soft-delete cleaner
            storage::spawn_blob_gc_worker(repo.clone(), storage.clone());
            info!("Background soft-delete garbage collection worker spawned.");

            // Spawn outbound delivery queue worker
            smtp::spawn_outbound_queue_worker(
                repo.clone(),
                storage.clone(),
                event_bus.clone(),
                config.hostname.clone(),
                config.mail_domain.clone(),
            );
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

        // 1. Start JMAP & HTTP server (Port 8080)
        let app_state = jmap::AppState {
            repo: repo.clone(),
            storage: storage.clone(),
            event_bus: event_bus.clone(),
            default_admin_email: config.admin_email.clone(),
            jwt_secret: config.jwt_secret.clone(),
            mail_domain: config.mail_domain.clone(),
            hostname: config.hostname.clone(),
        };

        let jmap_bind_addr = config.jmap_bind_addr;
        tokio::spawn(async move {
            if let Err(e) = jmap::run_jmap_server(jmap_bind_addr, app_state).await {
                error!("JMAP server terminated with error: {}", e);
            }
        });

        // 2. Start SMTP Inbound MTA (Port 25)
        let smtp_addr = config.smtp_bind_addr;
        let smtp_repo = repo.clone();
        let smtp_storage = storage.clone();
        let smtp_bus = event_bus.clone();
        let smtp_tls = tls_manager.clone();
        let smtp_sec = security_manager.clone();
        let smtp_hostname = config.hostname.clone();
        tokio::spawn(async move {
            if let Err(e) = smtp::run_smtp_listener(
                smtp_addr,
                false, // Inbound
                false, // STARTTLS
                smtp_repo,
                smtp_storage,
                smtp_bus,
                smtp_tls,
                smtp_sec,
                smtp_hostname,
            )
            .await
            {
                error!("SMTP Port 25 listener terminated with error: {}", e);
            }
        });

        // 3. Start SMTPS Implicit TLS Submission (Port 465)
        let smtps_addr = config.smtps_bind_addr;
        let smtps_repo = repo.clone();
        let smtps_storage = storage.clone();
        let smtps_bus = event_bus.clone();
        let smtps_tls = tls_manager.clone();
        let smtps_sec = security_manager.clone();
        let smtps_hostname = config.hostname.clone();
        tokio::spawn(async move {
            if let Err(e) = smtp::run_smtp_listener(
                smtps_addr,
                true, // Submission
                true, // Implicit TLS
                smtps_repo,
                smtps_storage,
                smtps_bus,
                smtps_tls,
                smtps_sec,
                smtps_hostname,
            )
            .await
            {
                error!("SMTPS Port 465 listener terminated with error: {}", e);
            }
        });

        // 4. Start SMTP Submission with STARTTLS (Port 587)
        let sub_addr = config.submission_bind_addr;
        let sub_repo = repo.clone();
        let sub_storage = storage.clone();
        let sub_bus = event_bus.clone();
        let sub_tls = tls_manager.clone();
        let sub_sec = security_manager.clone();
        let sub_hostname = config.hostname.clone();
        tokio::spawn(async move {
            if let Err(e) = smtp::run_smtp_listener(
                sub_addr,
                true,  // Submission
                false, // STARTTLS
                sub_repo,
                sub_storage,
                sub_bus,
                sub_tls,
                sub_sec,
                sub_hostname,
            )
            .await
            {
                error!("SMTP Submission Port 587 listener terminated with error: {}", e);
            }
        });

        // 5. Start IMAP (Port 143 STARTTLS)
        let imap_addr = config.imap_bind_addr;
        let imap_repo = repo.clone();
        let imap_storage = storage.clone();
        let imap_bus = event_bus.clone();
        let imap_tls = tls_manager.clone();
        let imap_hostname = config.hostname.clone();
        tokio::spawn(async move {
            if let Err(e) = imap::run_imap_listener(
                imap_addr,
                false, // Plain with STARTTLS
                imap_repo,
                imap_storage,
                imap_bus,
                imap_tls,
                imap_hostname,
            )
            .await
            {
                error!("IMAP Port 143 listener terminated with error: {}", e);
            }
        });

        // 6. Start IMAPS (Port 993 Implicit TLS)
        let imaps_addr = config.imaps_bind_addr;
        let imaps_repo = repo.clone();
        let imaps_storage = storage.clone();
        let imaps_bus = event_bus.clone();
        let imaps_tls = tls_manager.clone();
        let imaps_hostname = config.hostname.clone();
        tokio::spawn(async move {
            if let Err(e) = imap::run_imap_listener(
                imaps_addr,
                true, // Implicit TLS
                imaps_repo,
                imaps_storage,
                imaps_bus,
                imaps_tls,
                imaps_hostname,
            )
            .await
            {
                error!("IMAPS Port 993 listener terminated with error: {}", e);
            }
        });
    }

    info!("===============================================================");
    info!(" Postarc Mailserver daemon is fully ONLINE and serving traffic!");
    info!("   - SMTP Inbound (MTA):         Port 25  (STARTTLS)");
    info!("   - SMTPS Submission:           Port 465 (Implicit TLS)");
    info!("   - SMTP Submission:            Port 587 (STARTTLS)");
    info!("   - IMAP:                       Port 143 (STARTTLS)");
    info!("   - IMAPS:                      Port 993 (Implicit TLS)");
    info!("   - JMAP & Webmail API:         Port 8080");
    info!("===============================================================");
    info!("Awaiting client connections and messages (Press Ctrl+C to stop)...");

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
