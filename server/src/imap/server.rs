use super::session::{handle_imap_session, ImapState};
use crate::db::MailRepository;
use crate::event_bus::EventBus;
use crate::storage::BlobStorage;
use crate::tls::TlsManager;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;
use tracing::{error, info};

pub async fn run_imap_listener(
    bind_addr: SocketAddr,
    is_implicit_tls: bool,
    repo: MailRepository,
    storage: Arc<dyn BlobStorage>,
    event_bus: EventBus,
    tls_manager: TlsManager,
    hostname: String,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let listener = TcpListener::bind(bind_addr).await?;
    let mode = if is_implicit_tls { "IMAPS (Port 993 Implicit TLS)" } else { "IMAP (Port 143 STARTTLS)" };
    info!("{} active on {}", mode, bind_addr);

    let state = Arc::new(ImapState {
        repo,
        storage,
        event_bus,
        tls_manager: tls_manager.clone(),
        hostname,
    });

    loop {
        let (socket, remote_addr) = listener.accept().await?;
        let session_state = state.clone();
        let tls_mgr = tls_manager.clone();

        tokio::spawn(async move {
            if is_implicit_tls {
                let acceptor_opt = tls_mgr.get_acceptor().await;
                if let Some(acceptor) = acceptor_opt {
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
                    error!("IMAPS listener connection received but TLS acceptor is unconfigured!");
                }
            } else {
                if let Err(e) = handle_imap_session(socket, session_state).await {
                    error!("IMAP session error with {}: {}", remote_addr, e);
                }
            }
        });
    }
}
