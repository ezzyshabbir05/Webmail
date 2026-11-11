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
        let dkim_manager = Arc::new(DkimManager::new(mail_domain, "mail".to_string()));
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
                        "Processing outbound delivery [{}]: {} -> {}",
                        queue_id, sender, recipient
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

                    let payload = if let Some(ref msg) = msg_opt {
                        match storage.get_blob(&msg.blob_id).await {
                            Ok(bytes) => bytes,
                            Err(_) => {
                                // Synthesize MIME message from metadata
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
                        }
                    } else {
                        // Message no longer exists
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

                    // 2. Check if recipient is a local account on this Postarc instance
                    if let Ok(Some(_)) = repo.get_account_by_email(&clean_rcpt).await {
                        info!("Delivering locally to {}", clean_rcpt);
                        match process_inbound_mail(&repo, &storage, &event_bus, &clean_rcpt, &payload).await {
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
                    let domain = match clean_rcpt.split('@').nth(1) {
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
                    if let Ok(mx_response) = resolver.mx_lookup(domain).await {
                        let mut records: Vec<_> = mx_response.into_iter().collect();
                        records.sort_by_key(|r| r.preference());
                        for r in records {
                            mx_hosts.push(r.exchange().to_utf8().trim_end_matches('.').to_string());
                        }
                    }

                    // Fallback to A record if no MX records
                    if mx_hosts.is_empty() {
                        mx_hosts.push(domain.to_string());
                    }

                    // 4. Attempt SMTP delivery to candidate MX hosts with DKIM signing
                    let dkim_signed_payload = dkim_manager.sign_message(&payload);
                    let mut delivery_success = false;
                    let mut last_error_msg = String::from("No MX servers reachable");

                    for mx in &mx_hosts {
                        let target_addr = format!("{}:25", mx);
                        info!("Attempting outbound delivery to {} [{}]", mx, target_addr);

                        match timeout(
                            Duration::from_secs(20),
                            deliver_via_smtp(&target_addr, mx, &hostname, &sender, &clean_rcpt, &dkim_signed_payload),
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

                    // 5. Update queue status
                    if delivery_success {
                        let _ = sqlx::query(
                            "UPDATE outbound_queue SET status = 'delivered', last_error = NULL WHERE id = $1",
                        )
                        .bind(queue_id)
                        .execute(repo.pool())
                        .await;
                    } else if attempts >= 4 {
                        error!("Outbound delivery [{}] permanently failed: {}", queue_id, last_error_msg);
                        let _ = sqlx::query(
                            "UPDATE outbound_queue SET status = 'failed', last_error = $1 WHERE id = $2",
                        )
                        .bind(&last_error_msg)
                        .bind(queue_id)
                        .execute(repo.pool())
                        .await;
                    } else {
                        warn!("Outbound delivery [{}] retry scheduled: {}", queue_id, last_error_msg);
                        let _ = sqlx::query(
                            r#"
                            UPDATE outbound_queue
                            SET status = 'queued',
                                attempts = attempts + 1,
                                next_retry_at = NOW() + INTERVAL '3 minutes',
                                last_error = $1
                            WHERE id = $2
                            "#,
                        )
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
            if let Ok(dns_name) = ServerName::try_from(mx_host.to_string()) {
                match connector.connect(dns_name.to_owned(), stream).await {
                    Ok(tls_stream) => {
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
                    Err(e) => {
                        warn!("STARTTLS handshake with {} failed: {}. Aborting connection.", mx_host, e);
                        return Err(format!("TLS handshake failed: {}", e).into());
                    }
                }
            }
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
