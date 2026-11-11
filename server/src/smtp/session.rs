use super::inbound::process_inbound_mail;
use crate::auth::argon::verify_password;
use crate::db::{Account, MailRepository, NewMessage};
use crate::event_bus::EventBus;
use crate::storage::BlobStorage;
use mail_parser::MessageParser;
use sha2::{Digest, Sha256};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tracing::{debug, error, info};
use uuid::Uuid;

pub struct SmtpState {
    pub repo: MailRepository,
    pub storage: Arc<dyn BlobStorage>,
    pub event_bus: EventBus,
    pub hostname: String,
    pub is_submission: bool,
}

pub async fn handle_smtp_session(
    stream: TcpStream,
    state: Arc<SmtpState>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let (reader, mut writer) = stream.into_split();
    let mut lines = BufReader::new(reader).lines();

    // 1. Initial Greeting
    writer
        .write_all(format!("220 {} ESMTP Postarc Mailserver\r\n", state.hostname).as_bytes())
        .await?;

    let mut mail_from: Option<String> = None;
    let mut rcpt_to: Vec<String> = Vec::new();
    let mut is_authenticated = !state.is_submission; // Port 25 doesn't require client auth
    let mut auth_account: Option<Account> = None;

    while let Some(line) = lines.next_line().await? {
        let trimmed = line.trim();
        debug!("SMTP RECV: {}", trimmed);

        let upper = trimmed.to_uppercase();

        if upper.starts_with("EHLO") || upper.starts_with("HELO") {
            let mut response = format!(
                "250-{} Hello\r\n250-8BITMIME\r\n250-SMTPUTF8\r\n250-SIZE 52428800\r\n",
                state.hostname
            );
            if state.is_submission && !is_authenticated {
                response.push_str("250-AUTH PLAIN LOGIN\r\n");
            }
            response.push_str("250 HELP\r\n");
            writer.write_all(response.as_bytes()).await?;
        } else if upper.starts_with("AUTH PLAIN") {
            let parts: Vec<&str> = trimmed.split_whitespace().collect();
            let auth_str = if parts.len() > 2 {
                parts[2].to_string()
            } else {
                writer.write_all(b"334 \r\n").await?;
                lines.next_line().await?.unwrap_or_default()
            };

            if let Ok(decoded) = base64_decode(auth_str.trim()) {
                // SASL PLAIN format: \0username\0password
                let tokens: Vec<&[u8]> = decoded.split(|&b| b == 0).collect();
                if tokens.len() >= 3 {
                    let user = String::from_utf8_lossy(tokens[1]);
                    let pass = String::from_utf8_lossy(tokens[2]);

                    if let Ok(Some(acc)) = state.repo.get_account_by_email(&user).await {
                        if verify_password(&pass, &acc.password_hash) {
                            is_authenticated = true;
                            auth_account = Some(acc);
                            writer.write_all(b"235 2.7.0 Authentication successful\r\n").await?;
                            continue;
                        }
                    }
                }
            }
            writer.write_all(b"535 5.7.8 Authentication credentials invalid\r\n").await?;
        } else if upper.starts_with("AUTH LOGIN") {
            // Send base64 prompt for "Username:"
            writer.write_all(b"334 VXNlcm5hbWU6\r\n").await?;
            let user_b64 = lines.next_line().await?.unwrap_or_default();
            // Send base64 prompt for "Password:"
            writer.write_all(b"334 UGFzc3dvcmQ6\r\n").await?;
            let pass_b64 = lines.next_line().await?.unwrap_or_default();

            if let (Ok(user_bytes), Ok(pass_bytes)) = (base64_decode(user_b64.trim()), base64_decode(pass_b64.trim())) {
                let user = String::from_utf8_lossy(&user_bytes);
                let pass = String::from_utf8_lossy(&pass_bytes);

                if let Ok(Some(acc)) = state.repo.get_account_by_email(&user).await {
                    if verify_password(&pass, &acc.password_hash) {
                        is_authenticated = true;
                        auth_account = Some(acc);
                        writer.write_all(b"235 2.7.0 Authentication successful\r\n").await?;
                        continue;
                    }
                }
            }
            writer.write_all(b"535 5.7.8 Authentication credentials invalid\r\n").await?;
        } else if upper.starts_with("MAIL FROM:") {
            let addr = parse_address(trimmed);
            mail_from = Some(addr);
            writer.write_all(b"250 2.1.0 Sender OK\r\n").await?;
        } else if upper.starts_with("RCPT TO:") {
            if state.is_submission && !is_authenticated {
                writer.write_all(b"530 5.7.0 Authentication required\r\n").await?;
                continue;
            }
            let addr = parse_address(trimmed);
            rcpt_to.push(addr);
            writer.write_all(b"250 2.1.5 Recipient OK\r\n").await?;
        } else if upper == "DATA" {
            if mail_from.is_none() || rcpt_to.is_empty() {
                writer.write_all(b"503 5.5.1 Error: need MAIL and RCPT commands\r\n").await?;
                continue;
            }

            writer.write_all(b"354 Start mail input; end with <CRLF>.<CRLF>\r\n").await?;

            let mut message_bytes = Vec::new();
            while let Some(data_line) = lines.next_line().await? {
                if data_line == "." {
                    break;
                }
                // Handle dot-unstuffing
                let line_to_write = if data_line.starts_with("..") {
                    &data_line[1..]
                } else {
                    &data_line
                };
                message_bytes.extend_from_slice(line_to_write.as_bytes());
                message_bytes.extend_from_slice(b"\r\n");
            }

            let mut delivered_id = None;
            let mut relay_rejected = false;

            for recipient in &rcpt_to {
                let clean_rcpt = recipient
                    .trim()
                    .trim_start_matches('<')
                    .trim_end_matches('>')
                    .to_lowercase();

                // 1. Check if recipient is local
                if let Ok(Some(_)) = state.repo.get_account_by_email(&clean_rcpt).await {
                    match process_inbound_mail(
                        &state.repo,
                        &state.storage,
                        &state.event_bus,
                        &clean_rcpt,
                        &message_bytes,
                    )
                    .await
                    {
                        Ok(id) => delivered_id = Some(id),
                        Err(e) => {
                            error!("Failed to deliver locally to {}: {}", clean_rcpt, e);
                        }
                    }
                } else if is_authenticated {
                    // 2. Outbound relay from authenticated submission client
                    let sender_acc = if let Some(ref acc) = auth_account {
                        acc.clone()
                    } else if let Some(ref from_addr) = mail_from {
                        state
                            .repo
                            .get_account_by_email(from_addr)
                            .await
                            .ok()
                            .flatten()
                            .unwrap_or_else(|| Account {
                                id: Uuid::nil(),
                                email: from_addr.clone(),
                                username: from_addr.clone(),
                                password_hash: String::new(),
                                is_active: true,
                                quota_bytes: 10737418240,
                                created_at: chrono::Utc::now(),
                            })
                    } else {
                        continue;
                    };

                    let mut hasher = Sha256::new();
                    hasher.update(&message_bytes);
                    let blob_id = hex::encode(hasher.finalize());

                    let _ = state.storage.put_blob(&blob_id, &message_bytes).await;
                    let _ = state.repo.reserve_blob(&blob_id, message_bytes.len() as i64).await;

                    let parsed = MessageParser::default().parse(&message_bytes);
                    let subject = parsed
                        .as_ref()
                        .and_then(|p| p.subject())
                        .unwrap_or("(No Subject)")
                        .to_string();
                    let snippet = parsed
                        .as_ref()
                        .and_then(|p| p.body_text(0))
                        .map(|s| s.chars().take(150).collect::<String>())
                        .unwrap_or_default();

                    let sent_mb = state.repo.get_mailbox_by_role(sender_acc.id, "sent").await.ok().flatten();
                    let mb_id = sent_mb.map(|m| m.id).unwrap_or(sender_acc.id);

                    let sender_addr = mail_from.clone().unwrap_or_else(|| sender_acc.email.clone());
                    let new_msg = NewMessage {
                        account_id: sender_acc.id,
                        mailbox_id: mb_id,
                        blob_id: blob_id.clone(),
                        thread_id: None,
                        subject,
                        from_address: sender_addr.clone(),
                        to_addresses: clean_rcpt.clone(),
                        cc_addresses: None,
                        bcc_addresses: None,
                        reply_to: None,
                        date: chrono::Utc::now(),
                        size_bytes: message_bytes.len() as i64,
                        is_unread: false,
                        is_flagged: false,
                        is_draft: false,
                        keywords: vec!["$seen".to_string()],
                        snippet,
                    };

                    if let Ok(inserted) = state.repo.insert_message(new_msg).await {
                        let submission_id = Uuid::new_v4();
                        let _ = sqlx::query(
                            r#"
                            INSERT INTO outbound_queue (id, account_id, message_id, sender, recipient, status)
                            VALUES ($1, $2, $3, $4, $5, 'queued')
                            "#,
                        )
                        .bind(submission_id)
                        .bind(sender_acc.id)
                        .bind(inserted.id)
                        .bind(&sender_addr)
                        .bind(&clean_rcpt)
                        .execute(state.repo.pool())
                        .await;

                        delivered_id = Some(inserted.id);
                        info!("Enqueued outbound email [{}] to {}", submission_id, clean_rcpt);
                    }
                } else {
                    // Unauthenticated external attempt to send to non-local address
                    relay_rejected = true;
                }
            }

            if let Some(id) = delivered_id {
                writer
                    .write_all(format!("250 2.0.0 Ok: queued as {}\r\n", id).as_bytes())
                    .await?;
            } else if relay_rejected {
                writer.write_all(b"550 5.7.1 Relay access denied\r\n").await?;
            } else {
                writer.write_all(b"550 5.1.1 Recipient user not found\r\n").await?;
            }

            // Reset state after DATA
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
