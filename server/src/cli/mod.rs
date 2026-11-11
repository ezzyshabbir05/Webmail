pub mod alias;
pub mod dkim;
pub mod doctor;
pub mod domain;
pub mod setup;
pub mod user;

use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "postarc")]
#[command(author = "Postarc Engineering")]
#[command(version = "0.1.0")]
#[command(about = "Unified production-grade enterprise mail server & management CLI in Rust", long_about = None)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<Commands>,
}

#[derive(Subcommand)]
pub enum Commands {
    /// Start the unified mail daemon (SMTP, SMTPS, IMAP, IMAPS, JMAP)
    Run,

    /// Interactive setup wizard for initializing domain, admin, and certificates
    Setup,

    /// Run full diagnostic check on database, ports, storage, and live DNS records
    Doctor {
        /// Optional target domain to verify DNS records for (overrides MAIL_DOMAIN)
        #[arg(value_name = "DOMAIN")]
        domain: Option<String>,
    },

    /// Manage hosted email domains
    Domain {
        #[command(subcommand)]
        cmd: DomainCommands,
    },

    /// Manage email accounts and mailboxes
    User {
        #[command(subcommand)]
        cmd: UserCommands,
    },

    /// Manage virtual email aliases and catch-all routing
    Alias {
        #[command(subcommand)]
        cmd: AliasCommands,
    },

    /// Manage and export DKIM cryptographic keys and DNS records
    Dkim {
        #[command(subcommand)]
        cmd: DkimCommands,
    },
}

#[derive(Subcommand)]
pub enum DomainCommands {
    /// Add a new hosted domain
    Add {
        /// Fully qualified domain name (e.g. example.com)
        domain: String,
    },
    /// List all hosted domains
    List,
    /// Remove a hosted domain
    Remove {
        /// Domain to delete
        domain: String,
    },
}

#[derive(Subcommand)]
pub enum UserCommands {
    /// Add a new email account
    Add {
        /// Full email address (e.g. user@example.com)
        email: String,
        /// Optional password (prompted interactively if omitted)
        #[arg(short, long)]
        password: Option<String>,
        /// Storage quota in Gigabytes (default: 10GB)
        #[arg(short, long, default_value = "10")]
        quota_gb: i64,
    },
    /// List all registered accounts
    List,
    /// Reset password for an account
    Password {
        /// Account email address
        email: String,
    },
    /// Delete an email account
    Delete {
        /// Account email address
        email: String,
    },
}

#[derive(Subcommand)]
pub enum AliasCommands {
    /// Add a virtual alias or catch-all mapping (use @domain for catch-all)
    Add {
        /// Alias source address (e.g. support@example.com or @example.com)
        alias: String,
        /// Target destination email address
        target: String,
    },
    /// List all configured virtual aliases
    List,
    /// Remove a virtual alias
    Remove {
        /// Alias to delete
        alias: String,
    },
}

#[derive(Subcommand)]
pub enum DkimCommands {
    /// Generate a new 2048-bit RSA DKIM key for a domain
    Generate {
        /// Target domain
        domain: String,
        /// Selector name (default: mail)
        #[arg(short, long, default_value = "mail")]
        selector: String,
    },
    /// Export the exact DNS TXT record for Cloudflare, Route53, Namecheap, etc.
    Export {
        /// Target domain
        domain: String,
        /// Selector name (default: mail)
        #[arg(short, long, default_value = "mail")]
        selector: String,
    },
}
