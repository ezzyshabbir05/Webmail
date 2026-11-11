use crate::db::{MailRepository, NewMessage};
use crate::event_bus::{EventBus, MailboxEvent, MailboxEventType};
use crate::storage::BlobStorage;
use mail_parser::MessageParser;
use sha2::{Digest, Sha256};
use std::sync::Arc;
use tracing::info;
use uuid::Uuid;

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
    let account = repo
        .get_account_by_email(recipient_email)
        .await
        .map_err(|e| format!("DB error: {}", e))?
        .ok_or_else(|| format!("User not found: {}", recipient_email))?;

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

    // 5. Insert Message record in PostgreSQL
    let new_msg = NewMessage {
        account_id: account.id,
        mailbox_id: inbox.id,
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
        keywords: Vec::new(),
        snippet,
    };

    let inserted = repo
        .insert_message(new_msg)
        .await
        .map_err(|e| format!("Failed to insert message: {}", e))?;

    // 6. Broadcast event to IMAP IDLE and JMAP SSE listeners
    event_bus.publish(MailboxEvent {
        account_id: account.id,
        mailbox_id: inbox.id,
        event_type: MailboxEventType::Created,
        uid: inserted.uid,
        modseq: inserted.modseq,
    });

    info!(
        "Inbound email delivered to {} [{}] (Subject: '{}')",
        recipient_email, inserted.id, subject
    );

    Ok(inserted.id)
}
