use super::session::{handle_imap_session, ImapState};
use crate::db::MailRepository;
use crate::event_bus::EventBus;
use crate::storage::BlobStorage;
use crate::tls::build_tls_acceptor;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;
use tracing::{error, info, warn};

pub async fn run_imap_listener(
    bind_addr: SocketAddr,
    repo: MailRepository,
    storage: Arc<dyn BlobStorage>,
    event_bus: EventBus,
    hostname: String,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let listener = TcpListener::bind(bind_addr).await?;
    let tls_acceptor = build_tls_acceptor(&hostname);
    if tls_acceptor.is_some() {
        info!("IMAPS (Port 993) TLS encryption active with certificates for {}", hostname);
    } else {
        warn!("IMAPS listener running without TLS! (Certificates not found)");
    }
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
        let acceptor = tls_acceptor.clone();

        tokio::spawn(async move {
            if let Some(acceptor) = acceptor {
                match acceptor.accept(socket).await {
                    Ok(tls_stream) => {
                        if let Err(e) = handle_imap_session(tls_stream, session_state).await {
                            error!("IMAPS session error with {}: {}", remote_addr, e);
                        }
                    }
                    Err(e) => {
                        error!("IMAPS TLS handshake failed with {}: {}", remote_addr, e);
                    }
                }
            } else {
                if let Err(e) = handle_imap_session(socket, session_state).await {
                    error!("IMAP session error with {}: {}", remote_addr, e);
                }
            }
        });
    }
}
