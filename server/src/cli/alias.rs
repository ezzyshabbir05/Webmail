use console::style;
use crate::cli::AliasCommands;
use crate::config::PostarcConfig;
use crate::db::MailRepository;
use uuid::Uuid;

pub async fn handle_alias_command(cmd: AliasCommands) -> Result<(), Box<dyn std::error::Error>> {
    let config = PostarcConfig::from_env();
    let repo = MailRepository::connect(&config.database_url).await?;

    match cmd {
        AliasCommands::Add { alias, target } => {
            let domain_part = alias.split('@').nth(1).unwrap_or(&alias);
            let domain = repo.ensure_domain(domain_part).await?;

            let target_acc = repo
                .get_account_by_email(&target)
                .await?
                .ok_or_else(|| format!("Target account '{}' does not exist", target))?;

            let alias_id = Uuid::new_v4();
            sqlx::query(
                r#"
                INSERT INTO aliases (id, domain_id, source_address, target_account_id, is_active)
                VALUES ($1, $2, $3, $4, true)
                ON CONFLICT (source_address) DO UPDATE
                SET target_account_id = $4, is_active = true
                "#,
            )
            .bind(alias_id)
            .bind(domain.id)
            .bind(&alias)
            .bind(target_acc.id)
            .execute(repo.pool())
            .await?;

            println!(
                "{} Alias '{}' -> '{}' successfully created.",
                style("[OK]").green().bold(),
                alias,
                target
            );
        }
        AliasCommands::List => {
            let rows: Vec<(Uuid, String, String, bool)> = sqlx::query_as(
                r#"
                SELECT a.id, a.source_address, acc.email, a.is_active
                FROM aliases a
                JOIN accounts acc ON acc.id = a.target_account_id
                ORDER BY a.source_address ASC
                "#,
            )
            .fetch_all(repo.pool())
            .await?;

            println!("\n{:<38} {:<30} {:<30} {:<10}", "ALIAS ID", "SOURCE ALIAS", "DESTINATION", "STATUS");
            println!("{}", "-".repeat(110));
            for (id, source, dest, is_active) in rows {
                let status = if is_active { style("active").green() } else { style("inactive").red() };
                println!("{:<38} {:<30} {:<30} {:<10}", id, source, dest, status);
            }
            println!();
        }
        AliasCommands::Remove { alias } => {
            let deleted = sqlx::query("DELETE FROM aliases WHERE source_address = $1")
                .bind(&alias)
                .execute(repo.pool())
                .await?;

            if deleted.rows_affected() > 0 {
                println!("{} Alias '{}' successfully deleted.", style("[OK]").green().bold(), alias);
            } else {
                println!("{} Alias '{}' not found.", style("[WARN]").yellow().bold(), alias);
            }
        }
    }

    Ok(())
}
