use super::inbound::process_inbound_mail;
use crate::auth::argon::verify_password;
use crate::db::{Account, MailRepository, NewIncomingMessage};
use crate::event_bus::EventBus;
use crate::security::SecurityManager;
use crate::storage::BlobStorage;
use crate::tls::TlsManager;
use mail_parser::MessageParser;
use sha2::{Digest, Sha256};
use std::net::SocketAddr;
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader, ReadBuf};
use tokio::net::TcpStream;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

pub struct SmtpState {
    pub repo: MailRepository,
    pub storage: Arc<dyn BlobStorage>,
    pub event_bus: EventBus,
    pub tls_manager: TlsManager,
    pub security: SecurityManager,
    pub hostname: String,
    pub is_submission: bool,
}

pub enum MaybeTlsStream {
    Plain(TcpStream),
    Tls(tokio_rustls::server::TlsStream<TcpStream>),
}

impl AsyncRead for MaybeTlsStream {
    fn poll_read(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        match self.get_mut() {
            MaybeTlsStream::Plain(s) => Pin::new(s).poll_read(cx, buf),
            MaybeTlsStream::Tls(s) => Pin::new(s).poll_read(cx, buf),
        }
    }
}

impl AsyncWrite for MaybeTlsStream {
    fn poll_write(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<std::io::Result<usize>> {
        match self.get_mut() {
            MaybeTlsStream::Plain(s) => Pin::new(s).poll_write(cx, buf),
            MaybeTlsStream::Tls(s) => Pin::new(s).poll_write(cx, buf),
        }
    }

    fn poll_flush(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        match self.get_mut() {
            MaybeTlsStream::Plain(s) => Pin::new(s).poll_flush(cx),
            MaybeTlsStream::Tls(s) => Pin::new(s).poll_flush(cx),
        }
    }

    fn poll_shutdown(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        match self.get_mut() {
            MaybeTlsStream::Plain(s) => Pin::new(s).poll_shutdown(cx),
            MaybeTlsStream::Tls(s) => Pin::new(s).poll_shutdown(cx),
        }
    }
}

pub async fn handle_smtp_session(
    initial_stream: MaybeTlsStream,
    remote_addr: SocketAddr,
    state: Arc<SmtpState>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // 1. IP Ban & Connection Rate Limiting
    let remote_ip = remote_addr.ip();
    if let Err(err) = state.security.check_connect(remote_ip).await {
        warn!("Rejecting connection from {}: {}", remote_addr, err);
        let mut stream = initial_stream;
        let _ = stream.write_all(b"421 4.7.0 Service not available, closing transmission channel\r\n").await;
        let _ = stream.shutdown().await;
        return Ok(());
    }

    let is_implicit_tls = matches!(initial_stream, MaybeTlsStream::Tls(_));
    let mut current_stream = initial_stream;
    let mut is_tls = is_implicit_tls;

    // Greeting
    current_stream
        .write_all(format!("220 {} ESMTP Postarc Mailserver\r\n", state.hostname).as_bytes())
        .await?;

    let (r, w) = tokio::io::split(current_stream);
    let mut reader = BufReader::new(r);
    let mut writer = w;

    let mut mail_from: Option<String> = None;
    let mut rcpt_to: Vec<String> = Vec::new();
    let mut is_authenticated = false;
    let mut auth_account: Option<Account> = None;

    loop {
        let mut raw_cmd = Vec::new();
        let bytes_read = reader.read_until(b'\n', &mut raw_cmd).await?;
        if bytes_read == 0 {
            break;
        }

        // Detect TLS ClientHello sent to plaintext port (starts with 0x16 0x03)
        if raw_cmd.starts_with(&[0x16, 0x03]) {
            warn!("Client {} sent TLS ClientHello to plaintext SMTP port; closing session", remote_addr);
            let _ = writer.write_all(b"554 5.7.0 Plaintext connection required; use STARTTLS or port 465 for SMTPS\r\n").await;
            break;
        }

        let line = String::from_utf8_lossy(&raw_cmd);
        let trimmed = line.trim();
        debug!("SMTP [{}] RECV: {}", remote_addr, trimmed);

        let upper = trimmed.to_uppercase();

        if upper.starts_with("EHLO") || upper.starts_with("HELO") {
            let mut response = format!(
                "250-{} Hello\r\n250-8BITMIME\r\n250-SMTPUTF8\r\n250-SIZE 52428800\r\n",
                state.hostname
            );

            if !is_tls {
                response.push_str("250-STARTTLS\r\n");
            }

            if is_tls && !is_authenticated {
                response.push_str("250-AUTH PLAIN LOGIN\r\n");
            }

            response.push_str("250 HELP\r\n");
            writer.write_all(response.as_bytes()).await?;
        } else if upper == "STARTTLS" {
            if is_tls {
                writer.write_all(b"503 5.5.1 TLS already active\r\n").await?;
                continue;
            }

            let acceptor_opt = state.tls_manager.get_acceptor().await;
            let Some(acceptor) = acceptor_opt else {
                writer.write_all(b"454 4.7.0 TLS not available on this server\r\n").await?;
                continue;
            };

            writer.write_all(b"220 2.0.0 Ready to start TLS\r\n").await?;
            writer.flush().await?;

            // Reconstruct stream from split halves
            let r_inner = reader.into_inner();
            let unsplit_stream = r_inner.unsplit(writer);

            let tcp = match unsplit_stream {
                MaybeTlsStream::Plain(s) => s,
                MaybeTlsStream::Tls(_) => unreachable!(),
            };

            match acceptor.accept(tcp).await {
                Ok(tls_stream) => {
                    info!("STARTTLS negotiation successful with {}", remote_addr);
                    let new_maybe = MaybeTlsStream::Tls(tls_stream);
                    let (new_r, new_w) = tokio::io::split(new_maybe);
                    reader = BufReader::new(new_r);
                    writer = new_w;
                    is_tls = true;
                    // Per RFC 3207: Reset session state upon TLS start
                    mail_from = None;
                    rcpt_to.clear();
                    is_authenticated = false;
                    auth_account = None;
                }
                Err(e) => {
                    error!("TLS handshake failed with {}: {}", remote_addr, e);
                    return Ok(());
                }
            }
        } else if upper.starts_with("AUTH PLAIN") {
            if !is_tls {
                writer.write_all(b"538 5.7.11 Encryption required for requested authentication mechanism\r\n").await?;
                continue;
            }

            let parts: Vec<&str> = trimmed.split_whitespace().collect();
            let auth_str = if parts.len() > 2 {
                parts[2].to_string()
            } else {
                writer.write_all(b"334 \r\n").await?;
                let mut buf = Vec::new();
                reader.read_until(b'\n', &mut buf).await?;
                String::from_utf8_lossy(&buf).trim().to_string()
            };

            let mut authed = false;
            if let Ok(decoded) = base64_decode(auth_str.trim()) {
                let tokens: Vec<&[u8]> = decoded.split(|&b| b == 0).collect();
                if tokens.len() >= 3 {
                    let user = String::from_utf8_lossy(tokens[1]);
                    let pass = String::from_utf8_lossy(tokens[2]);

                    if let Ok(Some(acc)) = state.repo.get_account_by_email(&user).await {
                        if verify_password(&pass, &acc.password_hash) {
                            is_authenticated = true;
                            auth_account = Some(acc);
                            authed = true;
                        }
                    }
                }
            }

            if authed {
                state.security.record_auth_success(&remote_ip).await;
                writer.write_all(b"235 2.7.0 Authentication successful\r\n").await?;
            } else {
                state.security.record_auth_failure(remote_ip).await;
                writer.write_all(b"535 5.7.8 Authentication credentials invalid\r\n").await?;
            }
        } else if upper.starts_with("AUTH LOGIN") {
            if !is_tls {
                writer.write_all(b"538 5.7.11 Encryption required for requested authentication mechanism\r\n").await?;
                continue;
            }

            writer.write_all(b"334 VXNlcm5hbWU6\r\n").await?;
            let mut user_buf = Vec::new();
            reader.read_until(b'\n', &mut user_buf).await?;
            let user_b64 = String::from_utf8_lossy(&user_buf).trim().to_string();

            writer.write_all(b"334 UGFzc3dvcmQ6\r\n").await?;
            let mut pass_buf = Vec::new();
            reader.read_until(b'\n', &mut pass_buf).await?;
            let pass_b64 = String::from_utf8_lossy(&pass_buf).trim().to_string();

            let mut authed = false;
            if let (Ok(user_bytes), Ok(pass_bytes)) = (base64_decode(user_b64.trim()), base64_decode(pass_b64.trim())) {
                let user = String::from_utf8_lossy(&user_bytes);
                let pass = String::from_utf8_lossy(&pass_bytes);

                if let Ok(Some(acc)) = state.repo.get_account_by_email(&user).await {
                    if verify_password(&pass, &acc.password_hash) {
                        is_authenticated = true;
                        auth_account = Some(acc);
                        authed = true;
                    }
                }
            }

            if authed {
                state.security.record_auth_success(&remote_ip).await;
                writer.write_all(b"235 2.7.0 Authentication successful\r\n").await?;
            } else {
                state.security.record_auth_failure(remote_ip).await;
                writer.write_all(b"535 5.7.8 Authentication credentials invalid\r\n").await?;
            }
        } else if upper.starts_with("MAIL FROM:") {
            let addr = parse_address(trimmed);
            if state.is_submission && !is_authenticated {
                writer.write_all(b"530 5.7.0 Authentication required\r\n").await?;
                continue;
            }

            // Anti-Spoofing: If connecting from untrusted external IP without authentication,
            // reject attempts to claim a local domain/address as the sender.
            if !is_authenticated && !remote_ip.is_loopback() && !crate::security::is_private_or_loopback(&remote_ip) {
                if let Ok(Some(_)) = state.repo.resolve_recipient(&addr).await {
                    warn!("Anti-Spoofing: Blocked unauthenticated sender {} claiming local domain from {}", addr, remote_addr);
                    writer.write_all(b"550 5.7.1 Authentication required to send as local domain\r\n").await?;
                    continue;
                }
            }

            mail_from = Some(addr);
            writer.write_all(b"250 2.1.0 Sender OK\r\n").await?;
        } else if upper.starts_with("RCPT TO:") {
            let addr = parse_address(trimmed).to_lowercase();

            if !is_authenticated {
                if state.is_submission {
                    writer.write_all(b"530 5.7.0 Authentication required\r\n").await?;
                    continue;
                }

                // Strict Anti-Relay Guard: Recipient MUST resolve to local domain/alias
                match state.repo.resolve_recipient(&addr).await {
                    Ok(Some(_)) => {
                        rcpt_to.push(addr);
                        writer.write_all(b"250 2.1.5 Recipient OK\r\n").await?;
                    }
                    Ok(None) => {
                        warn!("Anti-Relay: Blocked attempt from {} to send to non-local {}", remote_addr, addr);
                        writer.write_all(b"554 5.7.1 Relay access denied\r\n").await?;
                    }
                    Err(e) => {
                        error!("Database error during recipient check: {}", e);
                        writer.write_all(b"451 4.3.0 Internal lookup failure\r\n").await?;
                    }
                }
            } else {
                // Authenticated submission client: allowed to send to any address
                rcpt_to.push(addr);
                writer.write_all(b"250 2.1.5 Recipient OK\r\n").await?;
            }
        } else if upper == "DATA" {
            if mail_from.is_none() || rcpt_to.is_empty() {
                writer.write_all(b"503 5.5.1 Error: need MAIL FROM and RCPT TO commands\r\n").await?;
                continue;
            }

            writer.write_all(b"354 Start mail input; end with <CRLF>.<CRLF>\r\n").await?;

            let mut message_bytes = Vec::new();
            loop {
                let mut data_buf = Vec::new();
                let n = reader.read_until(b'\n', &mut data_buf).await?;
                if n == 0 {
                    break;
                }

                // Check end of DATA indicator <CRLF>.<CRLF> or <LF>.<LF>
                if data_buf == b".\r\n" || data_buf == b".\n" {
                    break;
                }

                // RFC 5321 Dot-unstuffing: leading '.' is removed if line starts with '..'
                let slice = if data_buf.starts_with(b"..") {
                    &data_buf[1..]
                } else {
                    &data_buf[..]
                };

                message_bytes.extend_from_slice(slice);
            }

            let mut delivery_success = false;

            if !is_authenticated {
                // Inbound delivery for local recipients
                let sender = mail_from.clone().unwrap_or_else(|| "mailer-daemon@localhost".to_string());
                for recipient in &rcpt_to {
                    match process_inbound_mail(
                        &state.repo,
                        &state.storage,
                        &state.event_bus,
                        recipient,
                        &sender,
                        Some(remote_ip),
                        &state.hostname,
                        &message_bytes,
                        false,
                    )
                    .await
                    {
                        Ok(id) => {
                            delivery_success = true;
                            info!("Delivered inbound message [{}] to {}", id, recipient);
                        }
                        Err(e) => {
                            warn!("Inbound delivery rejected for {}: {}", recipient, e);
                        }
                    }
                }
            } else {
                // Authenticated outbound submission
                let sender_acc = auth_account.clone().unwrap();
                let sender_addr = mail_from.clone().unwrap_or_else(|| sender_acc.email.clone());

                let mut hasher = Sha256::new();
                hasher.update(&message_bytes);
                let blob_id = hex::encode(hasher.finalize());

                let _ = state.storage.put_blob(&blob_id, &message_bytes).await;
                let _ = state.repo.reserve_blob(&blob_id, message_bytes.len() as i64, message_bytes.len() as i64, "zstd").await;

                let parsed = MessageParser::default().parse(&message_bytes);
                let subject = parsed.as_ref().and_then(|p| p.subject()).unwrap_or("(No Subject)").to_string();
                let snippet = parsed.as_ref().and_then(|p| p.body_text(0)).map(|s| s.chars().take(150).collect::<String>()).unwrap_or_default();
                let rfc822_id = parsed.as_ref().and_then(|p| p.message_id()).unwrap_or("").to_string();

                let sent_mb = state.repo.get_mailbox_by_role(sender_acc.id, "sent").await.ok().flatten();
                let mb_id = sent_mb.map(|m| m.id).unwrap_or(sender_acc.id);

                let incoming = NewIncomingMessage {
                    account_id: sender_acc.id,
                    mailbox_id: mb_id,
                    blob_id: blob_id.clone(),
                    rfc822_message_id: if rfc822_id.is_empty() { format!("<{}@{}>", Uuid::new_v4(), state.hostname) } else { rfc822_id },
                    in_reply_to: String::new(),
                    references: Vec::new(),
                    subject,
                    from_address: sender_addr.clone(),
                    from_name: String::new(),
                    to_addresses: rcpt_to.join(", "),
                    cc_addresses: None,
                    bcc_addresses: None,
                    reply_to: None,
                    date: chrono::Utc::now(),
                    size_bytes: message_bytes.len() as i64,
                    snippet,
                    has_attachments: false,
                    is_unread: false,
                    is_flagged: false,
                    is_draft: false,
                    keywords: vec!["$seen".to_string()],
                };

                if let Ok((inserted_msg, _)) = state.repo.insert_message_with_junction(incoming).await {
                    for recipient in &rcpt_to {
                        let submission_id = Uuid::new_v4();
                        let _ = sqlx::query(
                            r#"
                            INSERT INTO outbound_queue (id, account_id, message_id, sender, recipient, status)
                            VALUES ($1, $2, $3, $4, $5, 'queued')
                            "#,
                        )
                        .bind(submission_id)
                        .bind(sender_acc.id)
                        .bind(inserted_msg.id)
                        .bind(&sender_addr)
                        .bind(recipient)
                        .execute(state.repo.pool())
                        .await;

                        info!("Queued outbound submission [{}] to {}", submission_id, recipient);
                    }
                    delivery_success = true;
                }
            }

            if delivery_success {
                writer.write_all(b"250 2.0.0 Ok: queued for delivery\r\n").await?;
            } else {
                writer.write_all(b"550 5.1.1 Delivery failed for all recipients\r\n").await?;
            }

            mail_from = None;
            rcpt_to.clear();
        } else if upper == "RSET" {
            mail_from = None;
            rcpt_to.clear();
            writer.write_all(b"250 2.0.0 OK Reset state\r\n").await?;
        } else if upper == "NOOP" {
            writer.write_all(b"250 2.0.0 OK\r\n").await?;
        } else if upper == "QUIT" {
            writer.write_all(b"221 2.0.0 Postarc Service closing transmission channel\r\n").await?;
            break;
        } else {
            writer.write_all(b"500 5.5.2 Syntax error, command unrecognized\r\n").await?;
        }
    }

    Ok(())
}

fn parse_address(line: &str) -> String {
    if let Some(start) = line.find('<') {
        if let Some(end) = line.find('>') {
            return line[start + 1..end].trim().to_string();
        }
    }
    let parts: Vec<&str> = line.split(':').collect();
    if parts.len() > 1 {
        parts[1].trim().to_string()
    } else {
        line.trim().to_string()
    }
}

fn base64_decode(input: &str) -> Result<Vec<u8>, ()> {
    let clean = input.replace(['\r', '\n', ' '], "");
    let mut decoded = Vec::new();
    let mut buf: u32 = 0;
    let mut bits = 0;

    for &b in clean.as_bytes() {
        let val = match b {
            b'A'..=b'Z' => b - b'A',
            b'a'..=b'z' => b - b'a' + 26,
            b'0'..=b'9' => b - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            b'=' => continue,
            _ => return Err(()),
        };
        buf = (buf << 6) | (val as u32);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            decoded.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }
    Ok(decoded)
}
