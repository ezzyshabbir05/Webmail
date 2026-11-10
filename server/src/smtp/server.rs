use crate::config::Config;
use crate::db::{Database, MessageRecord};
use crate::storage::Storage;
use chrono::Utc;
use mail_parser::MessageParser;
use rustls::pki_types::{CertificateDer, PrivateKeyDer};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};
use tokio_rustls::TlsAcceptor;
use tracing::{error, info, warn};
use uuid::Uuid;

pub struct SmtpServer {
    config: Arc<Config>,
    db: Arc<Database>,
    storage: Arc<Storage>,
    tls_acceptor: Option<TlsAcceptor>,
}

impl SmtpServer {
    pub fn new(
        config: Arc<Config>,
        db: Arc<Database>,
        storage: Arc<Storage>,
        tls_acceptor: Option<TlsAcceptor>,
    ) -> Self {
        Self {
            config,
            db,
            storage,
            tls_acceptor,
        }
    }

    pub async fn run(self: Arc<Self>, port: u16) -> Result<(), Box<dyn std::error::Error>> {
        let addr = format!("0.0.0.0:{}", port);
        let listener = TcpListener::bind(&addr).await?;
        info!("SMTP Inbound Server listening on {}", addr);

        loop {
            match listener.accept().await {
                Ok((stream, remote_addr)) => {
                    let server = Arc::clone(&self);
                    tokio::spawn(async move {
                        if let Err(e) = server.handle_connection(stream).await {
                            warn!("Connection from {} closed with error: {}", remote_addr, e);
                        }
                    });
                }
                Err(e) => {
                    error!("Error accepting SMTP connection: {}", e);
                }
            }
        }
    }

    async fn handle_connection(
        &self,
        stream: TcpStream,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let (reader, writer) = stream.into_split();
        let mut reader = BufReader::new(reader);
        let mut writer = writer;

        // Send 220 banner
        writer
            .write_all(format!("220 {} Postarc ESMTP ready\r\n", self.config.hostname).as_bytes())
            .await?;
        writer.flush().await?;

        let mut mail_from: Option<String> = None;
        let mut rcpt_to: Vec<String> = Vec::new();
        let mut is_tls = false;

        loop {
            let mut line = String::new();
            let bytes_read = reader.read_line(&mut line).await?;
            if bytes_read == 0 {
                break;
            }

            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            let upper = trimmed.to_uppercase();

            if upper.starts_with("EHLO") || upper.starts_with("HELO") {
                let mut response = format!(
                    "250-{} at your service\r\n250-SIZE 33554432\r\n250-8BITMIME\r\n250-ENHANCEDSTATUSCODES\r\n",
                    self.config.hostname
                );
                if self.tls_acceptor.is_some() && !is_tls {
                    response.push_str("250-STARTTLS\r\n");
                }
                response.push_str("250 OK\r\n");
                writer.write_all(response.as_bytes()).await?;
                writer.flush().await?;
            } else if upper == "STARTTLS" {
                if is_tls || self.tls_acceptor.is_none() {
                    writer
                        .write_all(b"503 5.5.1 TLS already active or unavailable\r\n")
                        .await?;
                    writer.flush().await?;
                    continue;
                }

                writer
                    .write_all(b"220 2.0.0 Ready to start TLS\r\n")
                    .await?;
                writer.flush().await?;

                let acceptor = self.tls_acceptor.as_ref().unwrap().clone();
                let reunified = reader.into_inner().reunite(writer)?;
                let tls_stream = acceptor.accept(reunified).await?;
                let (tls_reader, tls_writer) = tokio::io::split(tls_stream);

                reader = BufReader::new(tls_reader);
                writer = tls_writer;
                is_tls = true;
            } else if upper.starts_with("MAIL FROM:") {
                let raw_from = extract_email(&trimmed[10..]);
                mail_from = Some(raw_from);
                rcpt_to.clear();
                writer.write_all(b"250 2.1.0 Ok\r\n").await?;
                writer.flush().await?;
            } else if upper.starts_with("RCPT TO:") {
                let raw_to = extract_email(&trimmed[8..]);
                if raw_to.is_empty() {
                    writer.write_all(b"501 5.5.2 Syntax error in address\r\n").await?;
                    writer.flush().await?;
                    continue;
                }

                if self.db.user_exists(&raw_to) {
                    rcpt_to.push(raw_to);
                    writer.write_all(b"250 2.1.5 Ok\r\n").await?;
                } else {
                    writer
                        .write_all(b"550 5.1.1 User unknown in Postarc\r\n")
                        .await?;
                }
                writer.flush().await?;
            } else if upper == "DATA" {
                if mail_from.is_none() || rcpt_to.is_empty() {
                    writer
                        .write_all(b"503 5.5.1 Need MAIL and RCPT commands first\r\n")
                        .await?;
                    writer.flush().await?;
                    continue;
                }

                writer
                    .write_all(b"354 Start mail input; end with <CRLF>.<CRLF>\r\n")
                    .await?;
                writer.flush().await?;

                // Read message body until single dot
                let mut message_bytes = Vec::new();
                loop {
                    let mut data_line = Vec::new();
                    let n = reader.read_until(b'\n', &mut data_line).await?;
                    if n == 0 {
                        break;
                    }

                    if data_line == b".\r\n" || data_line == b".\n" {
                        break;
                    }

                    // Dot unstuffing (RFC 5321)
                    if data_line.starts_with(b"..") {
                        message_bytes.extend_from_slice(&data_line[1..]);
                    } else {
                        message_bytes.extend_from_slice(&data_line);
                    }
                }

                let blob_id = self
                    .storage
                    .save_blob(&message_bytes)
                    .await
                    .unwrap_or_else(|_| Uuid::new_v4().to_string());

                let parsed = MessageParser::default().parse(&message_bytes);
                let subject = parsed
                    .as_ref()
                    .and_then(|p| p.subject())
                    .unwrap_or("(No Subject)")
                    .to_string();

                let sender_name = parsed
                    .as_ref()
                    .and_then(|p| p.from())
                    .and_then(|f| f.first())
                    .and_then(|a| a.name())
                    .unwrap_or("")
                    .to_string();

                let sender_addr = mail_from.clone().unwrap_or_else(|| "unknown@domain.com".to_string());
                let text_body = parsed
                    .as_ref()
                    .and_then(|p| p.body_text(0))
                    .unwrap_or("")
                    .to_string();

                let html_body = parsed
                    .as_ref()
                    .and_then(|p| p.body_html(0))
                    .unwrap_or("")
                    .to_string();

                let snippet = if !text_body.is_empty() {
                    text_body.chars().take(100).collect::<String>().replace('\n', " ")
                } else {
                    subject.clone()
                };

                let now = Utc::now().to_rfc3339();

                // Save message into each recipient's Inbox
                for recipient in &rcpt_to {
                    if let Some(user) = self.db.get_user_by_email(recipient) {
                        if let Some(inbox) = self.db.get_mailbox_by_role(&user.id, "inbox") {
                            let msg = MessageRecord {
                                id: Uuid::new_v4().to_string(),
                                user_id: user.id,
                                mailbox_id: inbox.id,
                                sender_name: if !sender_name.is_empty() {
                                    sender_name.clone()
                                } else {
                                    sender_addr.split('@').next().unwrap_or("Sender").to_string()
                                },
                                sender_email: sender_addr.clone(),
                                recipient_email: recipient.clone(),
                                subject: subject.clone(),
                                snippet: snippet.clone(),
                                body_text: text_body.clone(),
                                body_html: html_body.clone(),
                                blob_id: blob_id.clone(),
                                size: message_bytes.len() as i64,
                                is_unread: true,
                                is_starred: false,
                                received_at: now.clone(),
                            };

                            if let Err(e) = self.db.insert_message(&msg) {
                                error!("Failed to insert message into Inbox for {}: {}", recipient, e);
                            } else {
                                info!("Delivered email to {}: {}", recipient, subject);
                            }
                        }
                    }
                }

                writer
                    .write_all(format!("250 2.0.0 Ok: queued as {}\r\n", blob_id).as_bytes())
                    .await?;
                writer.flush().await?;

                mail_from = None;
                rcpt_to.clear();
            } else if upper == "RSET" {
                mail_from = None;
                rcpt_to.clear();
                writer.write_all(b"250 2.0.0 Ok\r\n").await?;
                writer.flush().await?;
            } else if upper == "NOOP" {
                writer.write_all(b"250 2.0.0 Ok\r\n").await?;
                writer.flush().await?;
            } else if upper == "QUIT" {
                writer.write_all(b"221 2.0.0 Bye\r\n").await?;
                writer.flush().await?;
                break;
            } else {
                writer
                    .write_all(b"500 5.5.1 Unrecognized command\r\n")
                    .await?;
                writer.flush().await?;
            }
        }

        Ok(())
    }
}

fn extract_email(input: &str) -> String {
    let s = input.trim();
    if let (Some(start), Some(end)) = (s.find('<'), s.rfind('>')) {
        if start < end {
            return s[start + 1..end].trim().to_lowercase();
        }
    }
    s.trim().to_lowercase()
}

pub fn create_tls_acceptor(hostname: &str) -> Option<TlsAcceptor> {
    let mut params = rcgen::CertificateParams::new(vec![hostname.to_string(), "localhost".to_string()]).ok()?;
    let key = rcgen::KeyPair::generate().ok()?;
    let cert = params.self_signed(&key).ok()?;

    let cert_der = cert.der().to_vec();
    let key_der = key.serialize_der();

    let certs = vec![CertificateDer::from(cert_der)];
    let key = PrivateKeyDer::Pkcs8(key_der.into());

    let server_config = rustls::ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(certs, key)
        .ok()?;

    Some(TlsAcceptor::from(Arc::new(server_config)))
}
