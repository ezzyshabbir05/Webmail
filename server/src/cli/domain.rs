use console::style;
use crate::cli::DomainCommands;
use crate::config::PostarcConfig;
use crate::db::MailRepository;

pub async fn handle_domain_command(cmd: DomainCommands) -> Result<(), Box<dyn std::error::Error>> {
    let config = PostarcConfig::from_env();
    let repo = MailRepository::connect(&config.database_url).await?;

    match cmd {
        DomainCommands::Add { domain } => {
            let created = repo.ensure_domain(&domain).await?;
            println!(
                "{} Domain '{}' (ID: {}) successfully registered.",
                style("[OK]").green().bold(),
                domain,
                created.id
            );
        }
        DomainCommands::List => {
            let domains = repo.list_domains().await?;
            println!("\n{:<38} {:<25} {:<10}", "DOMAIN ID", "DOMAIN NAME", "STATUS");
            println!("{}", "-".repeat(75));
            for d in domains {
                let status = if d.is_active { style("active").green() } else { style("inactive").red() };
                println!("{:<38} {:<25} {:<10}", d.id, d.name, status);
            }
            println!();
        }
        DomainCommands::Remove { domain } => {
            let success = repo.delete_domain_by_name(&domain).await?;
            if success {
                println!("{} Domain '{}' successfully deleted.", style("[OK]").green().bold(), domain);
            } else {
                println!("{} Domain '{}' not found.", style("[WARN]").yellow().bold(), domain);
            }
        }
    }

    Ok(())
}
