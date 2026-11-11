use console::style;
use dialoguer::{theme::ColorfulTheme, Password};
use crate::auth::argon::hash_password;
use crate::cli::UserCommands;
use crate::config::PostarcConfig;
use crate::db::MailRepository;

pub async fn handle_user_command(cmd: UserCommands) -> Result<(), Box<dyn std::error::Error>> {
    let config = PostarcConfig::from_env();
    let repo = MailRepository::connect(&config.database_url).await?;

    match cmd {
        UserCommands::Add { email, password, quota_gb } => {
            let domain_name = match email.split('@').nth(1) {
                Some(d) => d,
                None => {
                    eprintln!("{} Invalid email address: '{}'", style("Error:").red(), email);
                    return Ok(());
                }
            };

            let domain = repo.ensure_domain(domain_name).await?;
            let pass = match password {
                Some(p) => p,
                None => {
                    Password::with_theme(&ColorfulTheme::default())
                        .with_prompt(format!("Enter password for {}", email))
                        .with_confirmation("Confirm password", "Passwords do not match!")
                        .interact()?
                }
            };

            let password_hash = hash_password(&pass)
                .map_err(|e| format!("Password hashing failed: {}", e))?;
            let username = email.split('@').next().unwrap_or(&email);
            let quota_bytes = quota_gb * 1024 * 1024 * 1024;

            let account = repo
                .create_account(domain.id, &email, username, &password_hash, username, quota_bytes)
                .await?;

            println!(
                "{} Account '{}' successfully created (ID: {}, Quota: {} GB).",
                style("[OK]").green().bold(),
                account.email,
                account.id,
                quota_gb
            );
        }
        UserCommands::List => {
            let accounts: Vec<(uuid::Uuid, String, String, bool, i64)> = sqlx::query_as(
                "SELECT id, email, username, is_active, quota_bytes FROM accounts ORDER BY email ASC",
            )
            .fetch_all(repo.pool())
            .await?;

            println!("\n{:<38} {:<30} {:<15} {:<10} {:<10}", "ACCOUNT ID", "EMAIL", "USERNAME", "STATUS", "QUOTA (GB)");
            println!("{}", "-".repeat(110));
            for (id, email, username, is_active, quota) in accounts {
                let status = if is_active { style("active").green() } else { style("inactive").red() };
                let quota_gb = quota / (1024 * 1024 * 1024);
                println!("{:<38} {:<30} {:<15} {:<10} {:<10}", id, email, username, status, quota_gb);
            }
            println!();
        }
        UserCommands::Password { email } => {
            let new_pass = Password::with_theme(&ColorfulTheme::default())
                .with_prompt(format!("New password for {}", email))
                .with_confirmation("Confirm password", "Passwords do not match!")
                .interact()?;

            let password_hash = hash_password(&new_pass)
                .map_err(|e| format!("Password hashing failed: {}", e))?;
            let updated = sqlx::query("UPDATE accounts SET password_hash = $1, updated_at = NOW() WHERE email = $2")
                .bind(password_hash)
                .bind(&email)
                .execute(repo.pool())
                .await?;

            if updated.rows_affected() > 0 {
                println!("{} Password successfully updated for '{}'.", style("[OK]").green().bold(), email);
            } else {
                println!("{} User '{}' not found.", style("[WARN]").yellow().bold(), email);
            }
        }
        UserCommands::Delete { email } => {
            let deleted = sqlx::query("DELETE FROM accounts WHERE email = $1")
                .bind(&email)
                .execute(repo.pool())
                .await?;

            if deleted.rows_affected() > 0 {
                println!("{} Account '{}' successfully deleted.", style("[OK]").green().bold(), email);
            } else {
                println!("{} User '{}' not found.", style("[WARN]").yellow().bold(), email);
            }
        }
    }

    Ok(())
}
