use super::dkim::DkimManager;
use crate::db::MailRepository;
use crate::event_bus::EventBus;
use crate::smtp::inbound::process_inbound_mail;
use crate::storage::BlobStorage;
use hickory_resolver::config::{ResolverConfig, ResolverOpts};
use hickory_resolver::TokioAsyncResolver;
use rustls_pki_types::ServerName;
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tokio::time::timeout;
use tracing::{error, info, warn};
use uuid::Uuid;

pub fn spawn_outbound_queue_worker(
    repo: MailRepository,
    storage: Arc<dyn BlobStorage>,
    event_bus: EventBus,
    hostname: String,
    mail_domain: String,
) {
    tokio::spawn(async move {
        let resolver = TokioAsyncResolver::tokio(ResolverConfig::google(), ResolverOpts::default());
        let default_dkim_manager = Arc::new(DkimManager::new(mail_domain.clone(), "mail".to_string()));
        let mut interval = tokio::time::interval(Duration::from_secs(5));

        loop {
            interval.tick().await;

            let queued_items: Result<Vec<(Uuid, Uuid, String, String, i32)>, sqlx::Error> =
                sqlx::query_as(
                    r#"
                    SELECT id, message_id, sender, recipient, attempts
                    FROM outbound_queue
                    WHERE status = 'queued' AND next_retry_at <= NOW()
                    ORDER BY created_at ASC
                    LIMIT 10
                    "#,
                )
                .fetch_all(repo.pool())
                .await;

            if let Ok(items) = queued_items {
                for (queue_id, message_id, sender, recipient, attempts) in items {
                    info!(
                        "Processing outbound delivery [{}]: {} -> {} (attempt {})",
                        queue_id, sender, recipient, attempts + 1
                    );

                    // Mark as in-flight
                    let _ = sqlx::query(
                        "UPDATE outbound_queue SET status = 'delivering' WHERE id = $1",
                    )
                    .bind(queue_id)
                    .execute(repo.pool())
                    .await;

                    // 1. Fetch message and blob
                    let msg_opt = sqlx::query_as::<_, crate::db::Message>(
                        "SELECT * FROM messages WHERE id = $1",
                    )
                    .bind(message_id)
                    .fetch_optional(repo.pool())
                    .await
                    .unwrap_or(None);

                    let (payload, subject) = if let Some(ref msg) = msg_opt {
                        let bytes = match storage.get_blob(&msg.blob_id).await {
                            Ok(b) => b,
                            Err(_) => {
                                format!(
                                    "From: {}\r\nTo: {}\r\nSubject: {}\r\nDate: {}\r\nMessage-ID: <{}@{}>\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n{}",
                                    msg.from_address,
                                    msg.to_addresses,
                                    msg.subject,
                                    msg.date.to_rfc2822(),
                                    msg.id,
                                    hostname,
                                    msg.snippet
                                )
                                .into_bytes()
                            }
                        };
                        (bytes, msg.subject.clone())
                    } else {
                        let _ = sqlx::query(
                            "UPDATE outbound_queue SET status = 'failed', last_error = 'Message metadata missing' WHERE id = $1",
                        )
                        .bind(queue_id)
                        .execute(repo.pool())
                        .await;
                        continue;
                    };

                    let clean_rcpt = recipient
                        .trim()
                        .trim_start_matches('<')
                        .trim_end_matches('>')
                        .to_lowercase();

                    // 2. Local delivery fast path if recipient is on this mailserver
                    if let Ok(Some(_)) = repo.resolve_recipient(&clean_rcpt).await {
                        info!("Delivering locally to {}", clean_rcpt);
                        match process_inbound_mail(
                            &repo,
                            &storage,
                            &event_bus,
                            &clean_rcpt,
                            &sender,
                            None,
                            &hostname,
                            &payload,
                            true,
                        )
                        .await
                        {
                            Ok(_) => {
                                let _ = sqlx::query(
                                    "UPDATE outbound_queue SET status = 'delivered', last_error = NULL WHERE id = $1",
                                )
                                .bind(queue_id)
                                .execute(repo.pool())
                                .await;
                                info!("Local delivery succeeded for [{}] -> {}", queue_id, clean_rcpt);
                                continue;
                            }
                            Err(e) => {
                                warn!("Local delivery failed for [{}]: {}", queue_id, e);
                            }
                        }
                    }

                    // 3. Resolve destination domain MX records
                    let dest_domain = match clean_rcpt.split('@').nth(1) {
                        Some(d) => d,
                        None => {
                            let _ = sqlx::query(
                                "UPDATE outbound_queue SET status = 'failed', last_error = 'Invalid recipient domain' WHERE id = $1",
                            )
                            .bind(queue_id)
                            .execute(repo.pool())
                            .await;
                            continue;
                        }
                    };

                    let mut mx_hosts: Vec<String> = Vec::new();
                    if let Ok(mx_response) = resolver.mx_lookup(dest_domain).await {
                        let mut records: Vec<_> = mx_response.into_iter().collect();
                        records.sort_by_key(|r| r.preference());
                        for r in records {
                            mx_hosts.push(r.exchange().to_utf8().trim_end_matches('.').to_string());
                        }
                    }

                    if mx_hosts.is_empty() {
                        mx_hosts.push(dest_domain.to_string());
                    }

                    // 4. DKIM Signing (use database stored key if available, else default)
                    let sender_domain = sender.split('@').nth(1).unwrap_or(&mail_domain);
                    let signed_payload = if let Ok(Some(dkim_key)) = repo.get_dkim_key(sender_domain, "mail").await {
                        // DB-backed key found
                        let dkim_mgr = DkimManager::from_pem(
                            sender_domain.to_string(),
                            dkim_key.selector,
                            dkim_key.private_key_pem.as_bytes(),
                        );
                        dkim_mgr.sign_message(&payload)
                    } else {
                        default_dkim_manager.sign_message(&payload)
                    };

                    // 5. Attempt SMTP delivery to MX hosts
                    let mut delivery_success = false;
                    let mut last_error_msg = String::from("No MX servers reachable");

                    for mx in &mx_hosts {
                        let target_addr = format!("{}:25", mx);
                        info!("Attempting outbound delivery to {} [{}]", mx, target_addr);

                        match timeout(
                            Duration::from_secs(20),
                            deliver_via_smtp(&target_addr, mx, &hostname, &sender, &clean_rcpt, &signed_payload),
                        )
                        .await
                        {
                            Ok(Ok(())) => {
                                delivery_success = true;
                                info!("Outbound delivery [{}] succeeded via {}", queue_id, mx);
                                break;
                            }
                            Ok(Err(e)) => {
                                last_error_msg = format!("SMTP error via {}: {}", mx, e);
                                warn!("Failed SMTP delivery to {}: {}", mx, e);
                            }
                            Err(_) => {
                                last_error_msg = format!("Timeout connecting to {}:25", mx);
                                warn!("Connection timed out to {}:25", mx);
                            }
                        }
                    }

                    // 6. Handle Delivery Outcome
                    if delivery_success {
                        let _ = sqlx::query(
                            "UPDATE outbound_queue SET status = 'delivered', last_error = NULL WHERE id = $1",
                        )
                        .bind(queue_id)
                        .execute(repo.pool())
                        .await;
                    } else if attempts >= 6 {
                        // Max retries exceeded: Permanent Failure
                        error!("Outbound delivery [{}] permanently failed: {}", queue_id, last_error_msg);
                        let _ = sqlx::query(
                            "UPDATE outbound_queue SET status = 'failed', last_error = $1 WHERE id = $2",
                        )
                        .bind(&last_error_msg)
                        .bind(queue_id)
                        .execute(repo.pool())
                        .await;

                        // Generate RFC 3464 Non-Delivery Report (DSN Bounce) to local sender
                        let bounce_body = format!(
                            "From: MAILER-DAEMON <MAILER-DAEMON@{}>\r\nTo: <{}>\r\nSubject: Undelivered Mail Returned to Sender: {}\r\nAuto-Submitted: auto-replied\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nThis is the mail system at host {}.\r\n\r\nI'm sorry to have to inform you that your message could not\r\nbe delivered to one or more recipients. It's attached below.\r\n\r\n<recipient>: <{}>\r\nReason: {}\r\n",
                            mail_domain, sender, subject, hostname, clean_rcpt, last_error_msg
                        );

                        let _ = process_inbound_mail(
                            &repo,
                            &storage,
                            &event_bus,
                            &sender,
                            &format!("MAILER-DAEMON@{}", mail_domain),
                            None,
                            &hostname,
                            bounce_body.as_bytes(),
                            true,
                        )
                        .await;
                        info!("Generated and delivered RFC 3464 DSN Bounce to local sender {}", sender);
                    } else {
                        // Exponential backoff
                        let retry_delays = [2, 5, 15, 30, 60, 120, 240];
                        let delay_minutes = retry_delays.get(attempts as usize).copied().unwrap_or(240);

                        warn!(
                            "Outbound delivery [{}] retry #{} scheduled in {} minutes: {}",
                            queue_id, attempts + 1, delay_minutes, last_error_msg
                        );

                        let _ = sqlx::query(
                            r#"
                            UPDATE outbound_queue
                            SET status = 'queued',
                                attempts = attempts + 1,
                                next_retry_at = NOW() + ($1 || ' minutes')::interval,
                                last_error = $2
                            WHERE id = $3
                            "#,
                        )
                        .bind(delay_minutes.to_string())
                        .bind(&last_error_msg)
                        .bind(queue_id)
                        .execute(repo.pool())
                        .await;
                    }
                }
            }
        }
    });
}

async fn deliver_via_smtp(
    addr: &str,
    mx_host: &str,
    hostname: &str,
    sender: &str,
    recipient: &str,
    payload: &[u8],
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let stream = TcpStream::connect(addr).await?;
    let mut reader = BufReader::new(stream);

    // 1. Expect 220 banner
    let mut greeting = String::new();
    reader.read_line(&mut greeting).await?;
    if !greeting.starts_with("220") {
        return Err(format!("Bad greeting from server: {}", greeting).into());
    }

    // 2. Send EHLO
    reader.get_mut().write_all(format!("EHLO {}\r\n", hostname).as_bytes()).await?;
    let mut supports_starttls = false;
    loop {
        let mut line = String::new();
        reader.read_line(&mut line).await?;
        if line.to_uppercase().contains("STARTTLS") {
            supports_starttls = true;
        }
        if line.starts_with("250 ") {
            break;
        } else if !line.starts_with("250-") {
            return Err(format!("EHLO failed: {}", line).into());
        }
    }

    // 3. Attempt opportunistic STARTTLS upgrade if supported
    if supports_starttls {
        reader.get_mut().write_all(b"STARTTLS\r\n").await?;
        let mut starttls_resp = String::new();
        reader.read_line(&mut starttls_resp).await?;

        if starttls_resp.starts_with("220") {
            let stream = reader.into_inner();
            let connector = crate::tls::build_outbound_tls_connector();
            let dns_name = ServerName::try_from(mx_host.to_string())
                .map_err(|e| format!("Invalid MX hostname {}: {}", mx_host, e))?;

            let tls_stream = connector.connect(dns_name.to_owned(), stream).await
                .map_err(|e| format!("STARTTLS handshake failed with {}: {}", mx_host, e))?;

            info!("Upgraded outbound SMTP connection to {} via STARTTLS (TLS active)", mx_host);
            let (r, mut w) = tokio::io::split(tls_stream);
            let mut tls_reader = BufReader::new(r);

            // Re-send EHLO after TLS handshake per RFC 3207
            w.write_all(format!("EHLO {}\r\n", hostname).as_bytes()).await?;
            loop {
                let mut line = String::new();
                tls_reader.read_line(&mut line).await?;
                if line.starts_with("250 ") {
                    break;
                } else if !line.starts_with("250-") {
                    return Err(format!("EHLO over TLS failed: {}", line).into());
                }
            }

            return finish_smtp_dialogue(&mut tls_reader, &mut w, sender, recipient, payload).await;
        }
    }

    // Fallback: Continue over plaintext if remote server does not advertise or accept STARTTLS
    let stream = reader.into_inner();
    let (r, mut w) = tokio::io::split(stream);
    let mut plain_reader = BufReader::new(r);
    finish_smtp_dialogue(&mut plain_reader, &mut w, sender, recipient, payload).await
}

async fn finish_smtp_dialogue<R, W>(
    reader: &mut BufReader<R>,
    writer: &mut W,
    sender: &str,
    recipient: &str,
    payload: &[u8],
) -> Result<(), Box<dyn std::error::Error + Send + Sync>>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
{
    // 1. Send MAIL FROM
    let clean_sender = sender.trim().trim_start_matches('<').trim_end_matches('>');
    writer.write_all(format!("MAIL FROM:<{}>\r\n", clean_sender).as_bytes()).await?;
    let mut resp = String::new();
    reader.read_line(&mut resp).await?;
    if !resp.starts_with("250") {
        return Err(format!("MAIL FROM rejected: {}", resp).into());
    }

    // 2. Send RCPT TO
    let clean_rcpt = recipient.trim().trim_start_matches('<').trim_end_matches('>');
    writer.write_all(format!("RCPT TO:<{}>\r\n", clean_rcpt).as_bytes()).await?;
    let mut resp = String::new();
    reader.read_line(&mut resp).await?;
    if !resp.starts_with("250") {
        return Err(format!("RCPT TO rejected: {}", resp).into());
    }

    // 3. Send DATA
    writer.write_all(b"DATA\r\n").await?;
    let mut resp = String::new();
    reader.read_line(&mut resp).await?;
    if !resp.starts_with("354") {
        return Err(format!("DATA initiation rejected: {}", resp).into());
    }

    // 4. Transmit Payload + <CRLF>.<CRLF>
    writer.write_all(payload).await?;
    if !payload.ends_with(b"\r\n") {
        writer.write_all(b"\r\n").await?;
    }
    writer.write_all(b".\r\n").await?;

    let mut resp = String::new();
    reader.read_line(&mut resp).await?;
    if !resp.starts_with("250") {
        return Err(format!("DATA delivery rejected: {}", resp).into());
    }

    // 5. QUIT
    let _ = writer.write_all(b"QUIT\r\n").await;
    Ok(())
}
