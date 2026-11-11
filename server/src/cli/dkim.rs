use argon2::password_hash::rand_core::OsRng;
use console::style;
use rsa::pkcs8::{DecodePrivateKey, EncodePrivateKey, EncodePublicKey, LineEnding};
use rsa::RsaPrivateKey;
use crate::cli::DkimCommands;
use crate::config::PostarcConfig;
use crate::db::MailRepository;
use std::fs;
use std::path::Path;

pub async fn handle_dkim_command(cmd: DkimCommands) -> Result<(), Box<dyn std::error::Error>> {
    let config = PostarcConfig::from_env();
    let repo = MailRepository::connect(&config.database_url).await?;

    match cmd {
        DkimCommands::Generate { domain, selector, force } => {
            let dom = repo.ensure_domain(&domain).await?;

            // If a DKIM key already exists and --force was not passed, preserve it!
            if !force {
                if let Ok(Some(existing_key)) = repo.get_dkim_key(&domain, &selector).await {
                    if let Ok(priv_key) = RsaPrivateKey::from_pkcs8_pem(&existing_key.private_key_pem) {
                        if let Ok(public_der) = priv_key.to_public_key().to_public_key_der() {
                            let public_b64 = base64_encode(public_der.as_bytes());
                            println!(
                                "\n{} Existing DKIM key found for '{}.{}'. Preserving existing key.",
                                style("[INFO]").cyan().bold(),
                                selector,
                                domain
                            );
                            println!("(To force generate a new key, run: postarc dkim generate {} --selector {} --force)\n", domain, selector);
                            println!("DNS TXT Record for '{}' (Selector: '{}'):", domain, selector);
                            println!("   Host / Name:  {}", style(format!("{}._domainkey.{}", selector, domain)).cyan().bold());
                            println!("   Record Type:  TXT");
                            println!("   Value:        {}\n", style(format!("v=DKIM1; k=rsa; p={}", public_b64)).green());
                            return Ok(());
                        }
                    }
                }
            }

            println!("Generating new 2048-bit RSA DKIM key for '{}.{}'...", selector, domain);
            let mut rng = OsRng;
            let priv_key = RsaPrivateKey::new(&mut rng, 2048)?;
            let private_pem = priv_key.to_pkcs8_pem(LineEnding::LF)?.to_string();

            let dkim_dir = Path::new("data/dkim");
            fs::create_dir_all(dkim_dir)?;
            let key_file = dkim_dir.join(format!("{}_{}.private", domain, selector));
            fs::write(&key_file, &private_pem)?;

            // Store in database
            repo.store_dkim_key(dom.id, &selector, &private_pem, "rsa2048").await?;

            let public_der = priv_key.to_public_key().to_public_key_der()?;
            let public_b64 = base64_encode(public_der.as_bytes());

            println!("\n{}", style("DKIM Key successfully generated and stored!").green().bold());
            println!("Private Key saved to: {:?}", key_file);
            println!("\nConfigure this DNS TXT record at your DNS provider:");
            println!("   Host / Name:  {}", style(format!("{}._domainkey.{}", selector, domain)).cyan().bold());
            println!("   Record Type:  TXT");
            println!("   Value:        {}\n", style(format!("v=DKIM1; k=rsa; p={}", public_b64)).green());
        }
        DkimCommands::Export { domain, selector } => {
            let dkim_key = repo.get_dkim_key(&domain, &selector).await?;
            if let Some(key) = dkim_key {
                let priv_key = RsaPrivateKey::from_pkcs8_pem(&key.private_key_pem)?;
                let public_der = priv_key.to_public_key().to_public_key_der()?;
                let public_b64 = base64_encode(public_der.as_bytes());

                println!("\nDNS TXT Record for '{}' (Selector: '{}'):", domain, selector);
                println!("   Host / Name:  {}", style(format!("{}._domainkey.{}", selector, domain)).cyan().bold());
                println!("   Record Type:  TXT");
                println!("   Value:        {}\n", style(format!("v=DKIM1; k=rsa; p={}", public_b64)).green());
            } else {
                println!("{} No active DKIM key found for '{}.{}'", style("[WARN]").yellow().bold(), selector, domain);
            }
        }
    }

    Ok(())
}

fn base64_encode(data: &[u8]) -> String {
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    let mut i = 0;
    while i < data.len() {
        let b0 = data[i] as usize;
        let b1 = if i + 1 < data.len() { data[i + 1] as usize } else { 0 };
        let b2 = if i + 2 < data.len() { data[i + 2] as usize } else { 0 };

        let triple = (b0 << 16) | (b1 << 8) | b2;

        result.push(CHARSET[(triple >> 18) & 0x3F] as char);
        result.push(CHARSET[(triple >> 12) & 0x3F] as char);
        if i + 1 < data.len() {
            result.push(CHARSET[(triple >> 6) & 0x3F] as char);
        } else {
            result.push('=');
        }
        if i + 2 < data.len() {
            result.push(CHARSET[triple & 0x3F] as char);
        } else {
            result.push('=');
        }
        i += 3;
    }
    result
}
