use crate::db::{MailRepository, NewMessage};
use crate::event_bus::{EventBus, MailboxEvent, MailboxEventType};
use crate::storage::BlobStorage;
use mail_parser::MessageParser;
use sha2::{Digest, Sha256};
use std::sync::Arc;
use tracing::{info, warn};
use uuid::Uuid;

async fn check_rspamd(url: &str, from: &str, rcpt: &str, payload: &[u8]) -> Option<(String, f64)> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .ok()?;

    let endpoint = format!("{}/checkv2", url.trim_end_matches('/'));
    let res = client
        .post(&endpoint)
        .header("From", from)
        .header("Rcpt", rcpt)
        .body(payload.to_vec())
        .send()
        .await
        .ok()?;

    if res.status().is_success() {
        if let Ok(json) = res.json::<serde_json::Value>().await {
            let action = json
                .get("action")
                .and_then(|v| v.as_str())
                .unwrap_or("no action")
                .to_string();
            let score = json.get("score").and_then(|v| v.as_f64()).unwrap_or(0.0);
            return Some((action, score));
        }
    }
    None
}

pub async fn process_inbound_mail(
    repo: &MailRepository,
    storage: &Arc<dyn BlobStorage>,
    event_bus: &EventBus,
    recipient_email: &str,
    payload: &[u8],
) -> Result<Uuid, String> {
    // 1. Calculate SHA-256
    let mut hasher = Sha256::new();
    hasher.update(payload);
    let blob_id = hex::encode(hasher.finalize());

    // 2. Locate recipient account & Inbox
    let clean_email = recipient_email
        .trim()
        .trim_start_matches('<')
        .trim_end_matches('>')
        .to_lowercase();

    let account = repo
        .get_account_by_email(&clean_email)
        .await
        .map_err(|e| format!("DB error: {}", e))?
        .ok_or_else(|| format!("User not found: {}", clean_email))?;

    let inbox = repo
        .get_mailbox_by_role(account.id, "inbox")
        .await
        .map_err(|e| format!("DB error: {}", e))?
        .ok_or_else(|| "Recipient has no Inbox mailbox".to_string())?;

    // 3. Store in Blob Storage & reserve in DB
    storage
        .put_blob(&blob_id, payload)
        .await
        .map_err(|e| format!("Storage error: {}", e))?;
    let _ = repo.reserve_blob(&blob_id, payload.len() as i64).await;

    // 4. Parse MIME structure
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
        .unwrap_or("unknown@sender.invalid")
        .to_string();

    let snippet = parsed
        .as_ref()
        .and_then(|p| p.body_text(0))
        .map(|s| s.chars().take(150).collect::<String>())
        .unwrap_or_default();

    // 5. Query Rspamd for spam/antivirus scoring
    let rspamd_url = std::env::var("RSPAMD_URL").unwrap_or_else(|_| "http://rspamd:11333".to_string());
    let mut is_spam = false;

    if let Some((action, score)) = check_rspamd(&rspamd_url, &from_addr, &clean_email, payload).await {
        if action == "reject" {
            warn!("Inbound email from {} rejected by spam policy (score: {:.1})", from_addr, score);
            return Err(format!("Message rejected by spam policy (score: {:.1})", score));
        } else if action == "add header" || action == "rewrite subject" || score >= 6.0 {
            info!("Inbound email from {} marked as spam (action: {}, score: {:.1})", from_addr, action, score);
            is_spam = true;
        } else {
            info!("Inbound email from {} passed spam check (score: {:.1})", from_addr, score);
        }
    }

    let target_mailbox = if is_spam {
        if let Ok(Some(spam_mb)) = repo.get_mailbox_by_role(account.id, "spam").await {
            spam_mb
        } else {
            inbox
        }
    } else {
        inbox
    };

    let mut keywords = Vec::new();
    if is_spam {
        keywords.push("$junk".to_string());
    }

    // 6. Insert Message record in PostgreSQL
    let new_msg = NewMessage {
        account_id: account.id,
        mailbox_id: target_mailbox.id,
        blob_id,
        thread_id: None,
        subject: subject.clone(),
        from_address: from_addr.clone(),
        to_addresses: recipient_email.to_string(),
        cc_addresses: None,
        bcc_addresses: None,
        reply_to: None,
        date: chrono::Utc::now(),
        size_bytes: payload.len() as i64,
        is_unread: true,
        is_flagged: false,
        is_draft: false,
        keywords,
        snippet,
    };

    let inserted = repo
        .insert_message(new_msg)
        .await
        .map_err(|e| format!("Failed to insert message: {}", e))?;

    // 7. Broadcast event to IMAP IDLE and JMAP SSE listeners
    event_bus.publish(MailboxEvent {
        account_id: account.id,
        mailbox_id: target_mailbox.id,
        event_type: MailboxEventType::Created,
        uid: inserted.uid,
        modseq: inserted.modseq,
    });

    info!(
        "Inbound email delivered to {} [{}] in {} (Subject: '{}')",
        recipient_email, inserted.id, target_mailbox.name, subject
    );

    Ok(inserted.id)
}
