use super::session::{handle_smtp_session, SmtpState};
use crate::db::MailRepository;
use crate::event_bus::EventBus;
use crate::storage::BlobStorage;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;
use tracing::{error, info};

pub async fn run_smtp_listener(
    bind_addr: SocketAddr,
    is_submission: bool,
    repo: MailRepository,
    storage: Arc<dyn BlobStorage>,
    event_bus: EventBus,
    hostname: String,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let listener = TcpListener::bind(bind_addr).await?;
    let mode = if is_submission { "Submission" } else { "Inbound MTA" };
    info!("SMTP {} listener active on {}", mode, bind_addr);

    let state = Arc::new(SmtpState {
        repo,
        storage,
        event_bus,
        hostname,
        is_submission,
    });

    loop {
        let (socket, remote_addr) = listener.accept().await?;
        let session_state = state.clone();

        tokio::spawn(async move {
            if let Err(e) = handle_smtp_session(socket, session_state).await {
                error!("SMTP session error with {}: {}", remote_addr, e);
            }
        });
    }
}
