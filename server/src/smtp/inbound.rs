use crate::db::{MailRepository, NewIncomingMessage};
use crate::event_bus::{EventBus, MailboxEvent, MailboxEventType};
use crate::storage::BlobStorage;
use mail_parser::MessageParser;
use sha2::{Digest, Sha256};
use std::net::IpAddr;
use std::sync::Arc;
use tracing::info;
use uuid::Uuid;

/// Production Inbound Delivery Engine:
/// Resolves virtual aliases, executes native anti-spam scoring, applies authentication results,
/// maintains JWZ conversation threading, and triggers vacation autoresponders.
pub async fn process_inbound_mail(
    repo: &MailRepository,
    storage: &Arc<dyn BlobStorage>,
    event_bus: &EventBus,
    recipient_email: &str,
    sender_envelope: &str,
    client_ip: Option<IpAddr>,
    hostname: &str,
    payload: &[u8],
) -> Result<Uuid, String> {
    let clean_rcpt = recipient_email
        .trim()
        .trim_start_matches('<')
        .trim_end_matches('>')
        .to_lowercase();

    // 1. Resolve recipient via virtual aliases & catch-all
    let account = match repo.resolve_recipient(&clean_rcpt).await {
        Ok(Some(acc)) => acc,
        Ok(None) => return Err(format!("550 5.1.1 Recipient user unknown: {}", clean_rcpt)),
        Err(e) => return Err(format!("451 4.3.0 Internal database error: {}", e)),
    };

    let inbox = repo
        .get_mailbox_by_role(account.id, "inbox")
        .await
        .map_err(|e| format!("DB error: {}", e))?
        .ok_or_else(|| format!("Account {} has no Inbox mailbox", account.email))?;

    let account_id = account.id;
    let target_mailbox_id = inbox.id;

    // 2. Parse MIME structure
    let parsed = MessageParser::default().parse(payload);
    let subject = parsed
        .as_ref()
        .and_then(|p| p.subject())
        .unwrap_or("(No Subject)")
        .to_string();

    let from_addr = parsed
        .as_ref()
        .and_then(|p| p.from())
        .and_then(|f| f.first())
        .and_then(|a| a.address())
        .unwrap_or(sender_envelope)
        .to_string();

    let from_name = parsed
        .as_ref()
        .and_then(|p| p.from())
        .and_then(|f| f.first())
        .and_then(|a| a.name())
        .map(|s| s.to_string());

    let rfc822_id = parsed
        .as_ref()
        .and_then(|p| p.message_id())
        .unwrap_or_else(|| "")
        .to_string();

    let in_reply_to = parsed
        .as_ref()
        .map(|p| match p.in_reply_to() {
            mail_parser::HeaderValue::Text(t) => t.to_string(),
            mail_parser::HeaderValue::TextList(list) => list.first().map(|s| s.to_string()).unwrap_or_default(),
            _ => String::new(),
        })
        .unwrap_or_default();

    let mut references = Vec::new();
    if let Some(ref p) = parsed {
        match p.references() {
            mail_parser::HeaderValue::Text(t) => references.push(t.to_string()),
            mail_parser::HeaderValue::TextList(list) => {
                for r in list {
                    references.push(r.to_string());
                }
            }
            _ => {}
        }
    }

    let snippet = parsed
        .as_ref()
        .and_then(|p| p.body_text(0))
        .map(|s| s.chars().take(150).collect::<String>())
        .unwrap_or_default();

    let has_attachments = parsed
        .as_ref()
        .map(|p| p.attachment_count() > 0)
        .unwrap_or(false);

    // 3. Inbound Spam & Phishing Defense (Native DNSBL + SPF + DMARC)
    let spam_detector = crate::security::SpamDetector::new();
    let spam_report = spam_detector.evaluate(client_ip, sender_envelope, &from_addr).await;

    let is_spam = spam_report.is_spam;
    let total_score = spam_report.score;

    // 4. Determine final destination mailbox (Inbox vs Spam)
    let final_mailbox_id = if is_spam {
        if let Ok(Some(spam_mb)) = repo.get_mailbox_by_role(account_id, "spam").await {
            spam_mb.id
        } else {
            target_mailbox_id
        }
    } else {
        target_mailbox_id
    };

    // 5. Prepend Standard RFC Compliance Headers (X-Spam-Status, Authentication-Results)
    let header_bytes = spam_report.generate_headers(hostname, total_score, is_spam);
    let mut enriched_payload = header_bytes;
    enriched_payload.extend_from_slice(payload);

    // 6. Content-Addressed Storage
    let mut hasher = Sha256::new();
    hasher.update(&enriched_payload);
    let blob_id = hex::encode(hasher.finalize());

    storage
        .put_blob(&blob_id, &enriched_payload)
        .await
        .map_err(|e| format!("Storage error: {}", e))?;

    let _ = repo
        .reserve_blob(&blob_id, enriched_payload.len() as i64, enriched_payload.len() as i64, "zstd")
        .await;

    // 7. Insert message with junction table
    let mut keywords = Vec::new();
    if is_spam {
        keywords.push("$junk".to_string());
    }

    let incoming = NewIncomingMessage {
        account_id,
        mailbox_id: final_mailbox_id,
        blob_id: blob_id.clone(),
        rfc822_message_id: if rfc822_id.is_empty() {
            format!("<{}@{}>", Uuid::new_v4(), hostname)
        } else {
            rfc822_id
        },
        in_reply_to,
        references,
        subject: subject.clone(),
        from_address: from_addr.clone(),
        from_name: from_name.unwrap_or_default(),
        to_addresses: clean_rcpt.clone(),
        cc_addresses: None,
        bcc_addresses: None,
        reply_to: None,
        date: chrono::Utc::now(),
        size_bytes: enriched_payload.len() as i64,
        snippet,
        has_attachments,
        is_unread: true,
        is_flagged: false,
        is_draft: false,
        keywords,
    };

    let (inserted_msg, junction) = repo
        .insert_message_with_junction(incoming)
        .await
        .map_err(|e| format!("Database error inserting message: {}", e))?;

    // 8. Trigger IMAP IDLE and JMAP SSE notifications
    event_bus.publish(MailboxEvent {
        account_id,
        mailbox_id: final_mailbox_id,
        event_type: MailboxEventType::Created,
        uid: junction.uid,
        modseq: junction.modseq,
    });

    // 9. Vacation Autoresponder Check
    if !is_spam && !from_addr.contains("mailer-daemon") && !from_addr.contains("noreply") {
        if let Ok(Some(vacation)) = repo.get_vacation_response(account_id).await {
            if vacation.is_enabled {
                let vacation_sub = if vacation.subject.is_empty() {
                    format!("Auto: Re: {}", subject)
                } else {
                    vacation.subject
                };

                let bounce_payload = format!(
                    "From: <{}>\r\nTo: <{}>\r\nSubject: {}\r\nAuto-Submitted: auto-replied\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n{}\r\n",
                    clean_rcpt, from_addr, vacation_sub, vacation.text_body
                );
                let bounce_bytes = bounce_payload.into_bytes();
                let mut b_hasher = Sha256::new();
                b_hasher.update(&bounce_bytes);
                let b_blob = hex::encode(b_hasher.finalize());
                let _ = storage.put_blob(&b_blob, &bounce_bytes).await;
                let _ = repo.reserve_blob(&b_blob, bounce_bytes.len() as i64, bounce_bytes.len() as i64, "zstd").await;

                let queue_id = Uuid::new_v4();
                let _ = sqlx::query(
                    r#"
                    INSERT INTO outbound_queue (id, account_id, message_id, sender, recipient, status)
                    VALUES ($1, $2, $3, $4, $5, 'queued')
                    "#,
                )
                .bind(queue_id)
                .bind(account_id)
                .bind(inserted_msg.id)
                .bind(&clean_rcpt)
                .bind(&from_addr)
                .execute(repo.pool())
                .await;

                info!("Enqueued vacation auto-response to {} from {}", from_addr, clean_rcpt);
            }
        }
    }

    info!(
        "Inbound delivery complete: {} -> {} [msg: {}, uid: {}]",
        from_addr, clean_rcpt, inserted_msg.id, junction.uid
    );

    Ok(inserted_msg.id)
}
