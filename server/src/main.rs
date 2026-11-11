mod config;

use config::PostarcConfig;
use tracing::{info, Level};
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

    // Placeholder until protocol listeners are attached in upcoming phases
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
