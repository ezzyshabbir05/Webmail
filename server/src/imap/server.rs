use super::session::{handle_imap_session, ImapState};
use crate::db::MailRepository;
use crate::event_bus::EventBus;
use crate::storage::BlobStorage;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;
use tracing::{error, info};

pub async fn run_imap_listener(
    bind_addr: SocketAddr,
    repo: MailRepository,
    storage: Arc<dyn BlobStorage>,
    event_bus: EventBus,
    hostname: String,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let listener = TcpListener::bind(bind_addr).await?;
    info!("IMAP4rev2 listener active on {}", bind_addr);

    let state = Arc::new(ImapState {
        repo,
        storage,
        event_bus,
        hostname,
    });

    loop {
        let (socket, remote_addr) = listener.accept().await?;
        let session_state = state.clone();

        tokio::spawn(async move {
            if let Err(e) = handle_imap_session(socket, session_state).await {
                error!("IMAP session error with {}: {}", remote_addr, e);
            }
        });
    }
}
