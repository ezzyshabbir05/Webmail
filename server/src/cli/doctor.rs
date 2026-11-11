use console::style;
use crate::config::PostarcConfig;
use crate::db::MailRepository;
use hickory_resolver::config::{ResolverConfig, ResolverOpts};
use hickory_resolver::TokioAsyncResolver;
use std::net::TcpListener;

pub async fn run_doctor(target_domain: Option<String>) -> Result<(), Box<dyn std::error::Error>> {
    println!("\n{}", style("======================================================").cyan().bold());
    println!("{}", style("           POSTARC SYSTEM HEALTH DIAGNOSTICS          ").cyan().bold());
    println!("{}\n", style("======================================================").cyan().bold());

    let config = PostarcConfig::from_env();
    let check_domain = target_domain.unwrap_or_else(|| config.mail_domain.clone());
    let resolver = TokioAsyncResolver::tokio(ResolverConfig::google(), ResolverOpts::default());

    // 1. Database Connectivity Check
    print!("{:<40}", "Checking PostgreSQL Database Connection...");
    match MailRepository::connect(&config.database_url).await {
        Ok(_) => println!("{}", style("[PASS]").green().bold()),
        Err(e) => {
            println!("{}", style("[FAIL]").red().bold());
            println!("   {} Could not connect to PostgreSQL: {}", style("Error:").red(), e);
        }
    }

    // 2. Storage Directory Check
    print!("{:<40}", "Checking Blob Storage Accessibility...");
    if std::fs::create_dir_all(&config.storage_fs_path).is_ok() {
        let test_file = std::path::Path::new(&config.storage_fs_path).join(".write_test");
        if std::fs::write(&test_file, b"test").is_ok() {
            let _ = std::fs::remove_file(&test_file);
            println!("{}", style("[PASS]").green().bold());
        } else {
            println!("{}", style("[WARN]").yellow().bold());
            println!("   {} Storage directory exists but is not writable.", style("Warning:").yellow());
        }
    } else {
        println!("{}", style("[FAIL]").red().bold());
    }

    // 3. Port Bind Checks
    println!("\nChecking Port Availability:");
    let ports = [
        (25, "SMTP Inbound (Port 25)"),
        (465, "SMTPS Implicit TLS (Port 465)"),
        (587, "SMTP Submission (Port 587)"),
        (143, "IMAP STARTTLS (Port 143)"),
        (993, "IMAPS Implicit TLS (Port 993)"),
        (8080, "JMAP HTTP API (Port 8080)"),
    ];

    for (port, desc) in ports {
        print!("   {:<37}", format!("{}...", desc));
        match TcpListener::bind(format!("0.0.0.0:{}", port)) {
            Ok(_) => println!("{}", style("[AVAILABLE]").green().bold()),
            Err(_) => println!("{}", style("[IN USE / BOUND]").yellow().bold()),
        }
    }

    // 4. Live DNS Diagnostics
    println!("\nChecking Live DNS Configurations for '{}':", check_domain);

    // MX Check
    print!("{:<40}", "   Checking MX Record...");
    match resolver.mx_lookup(&check_domain).await {
        Ok(mx) => {
            let records: Vec<_> = mx.into_iter().collect();
            if records.is_empty() {
                println!("{}", style("[FAIL - Empty]").red().bold());
            } else {
                let targets = records
                    .iter()
                    .map(|r| r.exchange().to_utf8().trim_end_matches('.').to_string())
                    .collect::<Vec<_>>()
                    .join(", ");
                println!("{} ({})", style("[PASS]").green().bold(), targets);
            }
        }
        Err(_) => println!("{}", style("[FAIL - No MX Found]").red().bold()),
    }

    // Hostname A Record Check
    print!("{:<40}", "   Checking Mail Hostname A Record...");
    match resolver.lookup_ip(&config.hostname).await {
        Ok(ips) => {
            let ip_list = ips.into_iter().map(|ip| ip.to_string()).collect::<Vec<_>>().join(", ");
            println!("{} ({})", style("[PASS]").green().bold(), ip_list);
        }
        Err(_) => println!("{}", style("[FAIL - Hostname Unresolvable]").red().bold()),
    }

    // SPF Record Check
    print!("{:<40}", "   Checking SPF (TXT) Record...");
    match resolver.txt_lookup(&check_domain).await {
        Ok(txts) => {
            let found_spf = txts
                .iter()
                .any(|t| t.to_string().to_lowercase().contains("v=spf1"));
            if found_spf {
                println!("{}", style("[PASS]").green().bold());
            } else {
                println!("{}", style("[WARN - No v=spf1 TXT found]").yellow().bold());
            }
        }
        Err(_) => println!("{}", style("[FAIL]").red().bold()),
    }

    // DKIM Selector Check
    let dkim_domain = format!("mail._domainkey.{}", check_domain);
    print!("{:<40}", "   Checking DKIM (mail._domainkey)...");
    match resolver.txt_lookup(&dkim_domain).await {
        Ok(txts) => {
            let found_dkim = txts
                .iter()
                .any(|t| t.to_string().to_lowercase().contains("v=dkim1"));
            if found_dkim {
                println!("{}", style("[PASS]").green().bold());
            } else {
                println!("{}", style("[WARN - No v=DKIM1 TXT found]").yellow().bold());
            }
        }
        Err(_) => println!("{}", style("[FAIL - Missing DKIM TXT]").red().bold()),
    }

    // DMARC Check
    let dmarc_domain = format!("_dmarc.{}", check_domain);
    print!("{:<40}", "   Checking DMARC (_dmarc)...");
    match resolver.txt_lookup(&dmarc_domain).await {
        Ok(txts) => {
            let found_dmarc = txts
                .iter()
                .any(|t| t.to_string().to_lowercase().contains("v=dmarc1"));
            if found_dmarc {
                println!("{}", style("[PASS]").green().bold());
            } else {
                println!("{}", style("[WARN - No v=DMARC1 TXT found]").yellow().bold());
            }
        }
        Err(_) => println!("{}", style("[FAIL - Missing DMARC TXT]").red().bold()),
    }

    println!("\n{}", style("Diagnostics completed.").cyan().bold());
    Ok(())
}
