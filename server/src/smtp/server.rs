use super::session::{handle_smtp_session, MaybeTlsStream, SmtpState};
use crate::db::MailRepository;
use crate::event_bus::EventBus;
use crate::security::SecurityManager;
use crate::storage::BlobStorage;
use crate::tls::TlsManager;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;
use tracing::{error, info};

pub async fn run_smtp_listener(
    bind_addr: SocketAddr,
    is_submission: bool,
    is_implicit_tls: bool,
    repo: MailRepository,
    storage: Arc<dyn BlobStorage>,
    event_bus: EventBus,
    tls_manager: TlsManager,
    security: SecurityManager,
    hostname: String,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let listener = TcpListener::bind(bind_addr).await?;
    let mode = if is_implicit_tls {
        "SMTPS (Implicit TLS)"
    } else if is_submission {
        "Submission (STARTTLS)"
    } else {
        "Inbound MTA"
    };
    info!("SMTP {} listener active on {}", mode, bind_addr);

    let state = Arc::new(SmtpState {
        repo,
        storage,
        event_bus,
        tls_manager: tls_manager.clone(),
        security,
        hostname,
        is_submission,
    });

    loop {
        let (socket, remote_addr) = listener.accept().await?;
        let session_state = state.clone();
        let tls_mgr = tls_manager.clone();

        tokio::spawn(async move {
            let initial_stream = if is_implicit_tls {
                let acceptor = tls_mgr.get_acceptor().await;
                match acceptor {
                    Some(acc) => match acc.accept(socket).await {
                        Ok(tls_socket) => MaybeTlsStream::Tls(tls_socket),
                        Err(e) => {
                            error!("SMTPS TLS handshake failed from {}: {}", remote_addr, e);
                            return;
                        }
                    },
                    None => {
                        error!("SMTPS listener received connection but TLS acceptor is unconfigured!");
                        return;
                    }
                }
            } else {
                MaybeTlsStream::Plain(socket)
            };

            if let Err(e) = handle_smtp_session(initial_stream, remote_addr, session_state).await {
                error!("SMTP session error with {}: {}", remote_addr, e);
            }
        });
    }
}
