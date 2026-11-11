use argon2::password_hash::rand_core::OsRng;
use console::style;
use dialoguer::{theme::ColorfulTheme, Input, Password, Select};
use rsa::pkcs8::{DecodePrivateKey, EncodePrivateKey, EncodePublicKey, LineEnding};
use rsa::RsaPrivateKey;
use crate::auth::argon::hash_password;
use crate::db::MailRepository;
use std::fs;
use std::path::Path;

pub async fn run_setup_wizard() -> Result<(), Box<dyn std::error::Error>> {
    println!("\n{}", style("======================================================").cyan().bold());
    println!("{}", style("    POSTARC ENTERPRISE MAIL SERVER SETUP WIZARD       ").cyan().bold());
    println!("{}\n", style("======================================================").cyan().bold());

    let theme = ColorfulTheme::default();

    // 1. Mail Domain
    let mail_domain: String = Input::with_theme(&theme)
        .with_prompt("Primary Email Domain")
        .default("example.com".to_string())
        .interact_text()?;

    // 2. Hostname
    let default_hostname = format!("mail.{}", mail_domain);
    let hostname: String = Input::with_theme(&theme)
        .with_prompt("Mail Server Hostname (FQDN)")
        .default(default_hostname)
        .interact_text()?;

    // 3. Admin Email
    let default_admin = format!("admin@{}", mail_domain);
    let admin_email: String = Input::with_theme(&theme)
        .with_prompt("Admin Account Email")
        .default(default_admin)
        .interact_text()?;

    // 4. Admin Password
    let admin_password = Password::with_theme(&theme)
        .with_prompt("Admin Account Password")
        .with_confirmation("Confirm Password", "Passwords do not match!")
        .interact()?;

    // 5. Storage Backend
    let storage_options = vec!["Local Filesystem (/data/blobs)", "Cloudflare R2 / AWS S3"];
    let storage_choice = Select::with_theme(&theme)
        .with_prompt("Storage Backend")
        .default(0)
        .items(&storage_options)
        .interact()?;

    let (storage_backend_val, r2_bucket, r2_endpoint, r2_key, r2_secret) = if storage_choice == 1 {
        let bucket: String = Input::with_theme(&theme)
            .with_prompt("S3 / R2 Bucket Name")
            .interact_text()?;
        let endpoint: String = Input::with_theme(&theme)
            .with_prompt("S3 / R2 Endpoint URL")
            .interact_text()?;
        let key: String = Input::with_theme(&theme)
            .with_prompt("Access Key ID")
            .interact_text()?;
        let secret: String = Password::with_theme(&theme)
            .with_prompt("Secret Access Key")
            .interact()?;
        ("s3", Some(bucket), Some(endpoint), Some(key), Some(secret))
    } else {
        ("filesystem", None, None, None, None)
    };

    // 6. Database URL
    let db_url: String = Input::with_theme(&theme)
        .with_prompt("PostgreSQL Database URL")
        .default("postgres://postarc:secret@localhost:5432/postarc".to_string())
        .interact_text()?;

    // 7. Generate or Preserve 2048-bit RSA DKIM Key
    let dkim_dir = Path::new("data/dkim");
    fs::create_dir_all(dkim_dir)?;
    let dkim_key_path = dkim_dir.join("mail.private");

    let (private_pem, public_b64) = if dkim_key_path.exists() {
        if let Ok(existing_pem) = fs::read_to_string(&dkim_key_path) {
            if let Ok(priv_key) = RsaPrivateKey::from_pkcs8_pem(&existing_pem) {
                if let Ok(public_der) = priv_key.to_public_key().to_public_key_der() {
                    let b64 = base64_encode(public_der.as_bytes());
                    println!("\nFound existing DKIM keypair at {:?}. Preserving existing key.", dkim_key_path);
                    (existing_pem, b64)
                } else {
                    println!("\nGenerating 2048-bit RSA DKIM Keypair...");
                    let mut rng = OsRng;
                    let priv_key = RsaPrivateKey::new(&mut rng, 2048)?;
                    let pem = priv_key.to_pkcs8_pem(LineEnding::LF)?.to_string();
                    fs::write(&dkim_key_path, &pem)?;
                    let der = priv_key.to_public_key().to_public_key_der()?;
                    (pem, base64_encode(der.as_bytes()))
                }
            } else {
                println!("\nGenerating 2048-bit RSA DKIM Keypair...");
                let mut rng = OsRng;
                let priv_key = RsaPrivateKey::new(&mut rng, 2048)?;
                let pem = priv_key.to_pkcs8_pem(LineEnding::LF)?.to_string();
                fs::write(&dkim_key_path, &pem)?;
                let der = priv_key.to_public_key().to_public_key_der()?;
                (pem, base64_encode(der.as_bytes()))
            }
        } else {
            println!("\nGenerating 2048-bit RSA DKIM Keypair...");
            let mut rng = OsRng;
            let priv_key = RsaPrivateKey::new(&mut rng, 2048)?;
            let pem = priv_key.to_pkcs8_pem(LineEnding::LF)?.to_string();
            fs::write(&dkim_key_path, &pem)?;
            let der = priv_key.to_public_key().to_public_key_der()?;
            (pem, base64_encode(der.as_bytes()))
        }
    } else {
        println!("\nGenerating 2048-bit RSA DKIM Keypair...");
        let mut rng = OsRng;
        let priv_key = RsaPrivateKey::new(&mut rng, 2048)?;
        let pem = priv_key.to_pkcs8_pem(LineEnding::LF)?.to_string();
        fs::write(&dkim_key_path, &pem)?;
        let der = priv_key.to_public_key().to_public_key_der()?;
        (pem, base64_encode(der.as_bytes()))
    };

    // 8. Generate .env file
    let mut env_content = format!(
        r#"# Postarc Mailserver Configuration
MAIL_DOMAIN={}
MAIL_HOSTNAME={}
ADMIN_EMAIL={}
ADMIN_PASSWORD={}
DATABASE_URL={}
STORAGE_BACKEND={}
STORAGE_FS_PATH=data/blobs
JWT_SECRET={}
"#,
        mail_domain,
        hostname,
        admin_email,
        admin_password,
        db_url,
        storage_backend_val,
        uuid::Uuid::new_v4()
    );

    if let (Some(b), Some(e), Some(k), Some(s)) = (r2_bucket, r2_endpoint, r2_key, r2_secret) {
        env_content.push_str(&format!(
            "R2_BUCKET={}\nR2_ENDPOINT={}\nR2_ACCESS_KEY_ID={}\nR2_SECRET_ACCESS_KEY={}\n",
            b, e, k, s
        ));
    }

    fs::write(".env", env_content)?;
    println!("{}", style("Configuration successfully saved to .env").green().bold());

    // 9. Initialize Database Schema & Seed Admin User
    println!("Connecting to database and running schema migrations...");
    let repo = MailRepository::connect(&db_url).await?;
    let domain = repo.ensure_domain(&mail_domain).await?;
    let password_hash = hash_password(&admin_password)
        .map_err(|e| format!("Password hashing failed: {}", e))?;
    let username = admin_email.split('@').next().unwrap_or("admin");

    let _account = repo
        .create_account(domain.id, &admin_email, username, &password_hash, "Administrator", 107374182400)
        .await?;

    // Store DKIM key in database
    let _ = repo.store_dkim_key(domain.id, "mail", &private_pem, "rsa2048").await;

    println!("{}", style("Database schema migrated and admin account created!").green().bold());

    // 10. Display Production DNS Records Checklist
    println!("\n{}", style("======================================================").yellow().bold());
    println!("{}", style("      CRITICAL: CONFIGURE THESE DNS RECORDS NOW       ").yellow().bold());
    println!("{}\n", style("======================================================").yellow().bold());

    println!("Add the following DNS records at your DNS provider (Cloudflare, Route53, Namecheap, etc.):\n");

    println!("1. MX Record (Inbound routing):");
    println!("   {}  IN  MX  10  {}.\n", style(&mail_domain).cyan(), style(&hostname).white().bold());

    println!("2. A Record (Server IP):");
    println!("   {}  IN  A  <YOUR_VPS_PUBLIC_IP>\n", style(&hostname).cyan());

    println!("3. SPF Record (Authorized senders):");
    println!("   {}  IN  TXT  \"v=spf1 mx ~all\"\n", style(&mail_domain).cyan());

    println!("4. DKIM Record (Cryptographic signature verification):");
    println!("   {}  IN  TXT  \"v=DKIM1; k=rsa; p={}\"\n",
        style(format!("mail._domainkey.{}", mail_domain)).cyan(),
        style(&public_b64).green()
    );

    println!("5. DMARC Policy (Domain enforcement & reporting):");
    println!("   {}  IN  TXT  \"v=DMARC1; p=quarantine; rua=mailto:dmarc@{}; ruf=mailto:dmarc@{}; sp=quarantine; pct=100\"\n",
        style(format!("_dmarc.{}", mail_domain)).cyan(),
        mail_domain,
        mail_domain
    );

    println!("6. MTA-STS Policy (Enforce encrypted delivery):");
    println!("   {}  IN  TXT  \"v=STSv1; id=2026111101\"\n", style(format!("_mta-sts.{}", mail_domain)).cyan());

    println!("{}", style("Setup completed! Start your mail server with:").green().bold());
    println!("   {}\n", style("postarc run").yellow().bold());

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
