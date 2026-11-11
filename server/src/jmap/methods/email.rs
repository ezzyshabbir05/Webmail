use crate::db::MailRepository;
use crate::event_bus::{EventBus, MailboxEvent, MailboxEventType};
use serde_json::{json, Value};
use uuid::Uuid;

pub async fn handle_email_get(
    repo: &MailRepository,
    account_id: Uuid,
    args: Value,
) -> Result<Value, String> {
    let ids_opt = args.get("ids").and_then(|v| v.as_array());

    let messages = if let Some(ids_array) = ids_opt {
        let mut uuids = Vec::new();
        for id_val in ids_array {
            if let Some(id_str) = id_val.as_str() {
                if let Ok(u) = Uuid::parse_str(id_str) {
                    uuids.push(u);
                }
            }
        }
        sqlx::query_as::<_, crate::db::Message>(
            "SELECT * FROM messages WHERE account_id = $1 AND id = ANY($2)",
        )
        .bind(account_id)
        .bind(&uuids)
        .fetch_all(repo.pool())
        .await
        .map_err(|e| format!("Query error: {}", e))?
    } else {
        Vec::new()
    };

    let mut list = Vec::new();
    for msg in messages {
        let mut mailbox_ids = serde_json::Map::new();
        mailbox_ids.insert(msg.mailbox_id.to_string(), json!(true));

        let mut keywords = serde_json::Map::new();
        if !msg.is_unread {
            keywords.insert("$seen".to_string(), json!(true));
        }
        if msg.is_flagged {
            keywords.insert("$flagged".to_string(), json!(true));
        }
        if msg.is_draft {
            keywords.insert("$draft".to_string(), json!(true));
        }
        if msg.is_answered {
            keywords.insert("$answered".to_string(), json!(true));
        }
        for kw in msg.keywords {
            keywords.insert(kw, json!(true));
        }

        list.push(json!({
            "id": msg.id.to_string(),
            "blobId": msg.blob_id,
            "threadId": msg.thread_id.to_string(),
            "mailboxIds": mailbox_ids,
            "keywords": keywords,
            "size": msg.size_bytes,
            "receivedAt": msg.date.to_rfc3339(),
            "subject": msg.subject,
            "from": [{ "name": "", "email": msg.from_address }],
            "to": [{ "name": "", "email": msg.to_addresses }],
            "preview": msg.snippet,
            "hasAttachment": false,
            "bodyValues": {
                "1": {
                    "value": msg.snippet,
                    "isTruncated": false
                }
            },
            "textBody": [{
                "partId": "1",
                "type": "text/plain",
                "size": msg.size_bytes
            }]
        }));
    }

    Ok(json!({
        "accountId": account_id.to_string(),
        "state": "1",
        "list": list
    }))
}

pub async fn handle_email_query(
    repo: &MailRepository,
    account_id: Uuid,
    args: Value,
) -> Result<Value, String> {
    let limit = args.get("limit").and_then(|v| v.as_i64()).unwrap_or(50);
    let position = args.get("position").and_then(|v| v.as_i64()).unwrap_or(0);

    let filter = args.get("filter");
    let in_mailbox = filter
        .and_then(|f| f.get("inMailbox"))
        .and_then(|v| v.as_str())
        .and_then(|s| Uuid::parse_str(s).ok());

    let text_query = filter
        .and_then(|f| f.get("text"))
        .and_then(|v| v.as_str());

    let messages = if let Some(query) = text_query {
        repo.search_messages(account_id, query, limit)
            .await
            .map_err(|e| format!("Search error: {}", e))?
    } else if let Some(mb_id) = in_mailbox {
        repo.list_messages(mb_id, limit, position)
            .await
            .map_err(|e| format!("List error: {}", e))?
    } else {
        // Query inbox by default
        let inbox = repo
            .get_mailbox_by_role(account_id, "inbox")
            .await
            .map_err(|e| format!("Inbox error: {}", e))?;

        if let Some(mb) = inbox {
            repo.list_messages(mb.id, limit, position)
                .await
                .map_err(|e| format!("List error: {}", e))?
        } else {
            Vec::new()
        }
    };

    let ids: Vec<String> = messages.into_iter().map(|m| m.id.to_string()).collect();
    let total = ids.len() as i64;

    Ok(json!({
        "accountId": account_id.to_string(),
        "queryState": "1",
        "canCalculateChanges": false,
        "position": position,
        "total": total,
        "ids": ids
    }))
}

pub async fn handle_email_set(
    repo: &MailRepository,
    event_bus: &EventBus,
    account_id: Uuid,
    args: Value,
) -> Result<Value, String> {
    let mut updated = serde_json::Map::new();
    let mut destroyed = Vec::new();

    if let Some(update_map) = args.get("update").and_then(|v| v.as_object()) {
        for (id_str, patch) in update_map {
            if let Ok(msg_id) = Uuid::parse_str(id_str) {
                let mut is_unread = None;
                let mut is_flagged = None;

                if let Some(keywords) = patch.get("keywords").and_then(|k| k.as_object()) {
                    if let Some(seen) = keywords.get("$seen").and_then(|v| v.as_bool()) {
                        is_unread = Some(!seen);
                    }
                    if let Some(flagged) = keywords.get("$flagged").and_then(|v| v.as_bool()) {
                        is_flagged = Some(flagged);
                    }
                }

                // Handle move to different mailbox
                if let Some(mb_ids) = patch.get("mailboxIds").and_then(|m| m.as_object()) {
                    if let Some(new_mb_id_str) = mb_ids.keys().next() {
                        if let Ok(new_mb_id) = Uuid::parse_str(new_mb_id_str) {
                            let _ = sqlx::query(
                                "UPDATE messages SET mailbox_id = $1 WHERE id = $2 AND account_id = $3",
                            )
                            .bind(new_mb_id)
                            .bind(msg_id)
                            .bind(account_id)
                            .execute(repo.pool())
                            .await;
                        }
                    }
                }

                if let Ok(Some(msg)) = repo.update_message_flags(msg_id, is_unread, is_flagged).await {
                    event_bus.publish(MailboxEvent {
                        account_id,
                        mailbox_id: msg.mailbox_id,
                        event_type: MailboxEventType::Updated,
                        uid: msg.uid,
                        modseq: msg.modseq,
                    });
                    updated.insert(id_str.clone(), json!({}));
                }
            }
        }
    }

    if let Some(destroy_list) = args.get("destroy").and_then(|v| v.as_array()) {
        for id_val in destroy_list {
            if let Some(id_str) = id_val.as_str() {
                if let Ok(msg_id) = Uuid::parse_str(id_str) {
                    let msg_opt = sqlx::query_as::<_, crate::db::Message>(
                        "SELECT * FROM messages WHERE id = $1 AND account_id = $2",
                    )
                    .bind(msg_id)
                    .bind(account_id)
                    .fetch_optional(repo.pool())
                    .await
                    .unwrap_or(None);

                    if let Some(msg) = msg_opt {
                        let _ = sqlx::query("DELETE FROM messages WHERE id = $1")
                            .bind(msg.id)
                            .execute(repo.pool())
                            .await;

                        let _ = repo.release_blob(&msg.blob_id).await;

                        event_bus.publish(MailboxEvent {
                            account_id,
                            mailbox_id: msg.mailbox_id,
                            event_type: MailboxEventType::Expunged,
                            uid: msg.uid,
                            modseq: msg.modseq + 1,
                        });
                        destroyed.push(json!(id_str));
                    }
                }
            }
        }
    }

    Ok(json!({
        "accountId": account_id.to_string(),
        "oldState": "1",
        "newState": "2",
        "updated": updated,
        "destroyed": destroyed
    }))
}
