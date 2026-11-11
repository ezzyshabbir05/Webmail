use crate::db::{EnrichedMessage, FlagUpdates, MailRepository, NewIncomingMessage};
use crate::event_bus::{EventBus, MailboxEvent, MailboxEventType};
use crate::storage::BlobStorage;
use mail_parser::MessageParser;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use uuid::Uuid;

pub async fn handle_email_get(
    repo: &MailRepository,
    storage: &Arc<dyn BlobStorage>,
    account_id: Uuid,
    args: Value,
) -> Result<Value, String> {
    let ids_opt = args.get("ids").and_then(|v| v.as_array());

    let messages: Vec<EnrichedMessage> = if let Some(ids_array) = ids_opt {
        let mut uuids = Vec::new();
        for id_val in ids_array {
            if let Some(id_str) = id_val.as_str() {
                if let Ok(u) = Uuid::parse_str(id_str) {
                    uuids.push(u);
                }
            }
        }
        sqlx::query_as::<_, EnrichedMessage>(
            r#"
            SELECT 
                m.id, m.account_id, mm.mailbox_id, m.blob_id, m.thread_id,
                mm.uid, mm.modseq, m.rfc822_message_id, m.in_reply_to,
                m.subject, m.from_address, m.from_name, m.to_addresses,
                m.cc_addresses, m.bcc_addresses, m.reply_to, m.date,
                m.size_bytes, m.snippet, m.has_attachments,
                mm.is_unread, mm.is_flagged, mm.is_draft, mm.is_answered,
                mm.is_deleted, mm.keywords, m.created_at
            FROM messages m
            JOIN message_mailboxes mm ON mm.message_id = m.id
            WHERE m.account_id = $1 AND m.id = ANY($2) AND mm.is_deleted = false
            "#,
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

        let (body_val, is_html) = if let Ok(blob_bytes) = storage.get_blob(&msg.blob_id).await {
            if let Some(parsed) = MessageParser::default().parse(&blob_bytes) {
                if let Some(html) = parsed.body_html(0) {
                    (html.to_string(), true)
                } else if let Some(text) = parsed.body_text(0) {
                    (text.to_string(), false)
                } else {
                    (msg.snippet.clone(), false)
                }
            } else {
                (String::from_utf8_lossy(&blob_bytes).to_string(), false)
            }
        } else {
            (msg.snippet.clone(), false)
        };

        list.push(json!({
            "id": msg.id.to_string(),
            "blobId": msg.blob_id,
            "threadId": msg.thread_id.to_string(),
            "mailboxIds": mailbox_ids,
            "keywords": keywords,
            "size": msg.size_bytes,
            "receivedAt": msg.date.to_rfc3339(),
            "subject": msg.subject,
            "from": [{ "name": msg.from_name, "email": msg.from_address }],
            "to": [{ "name": "", "email": msg.to_addresses }],
            "preview": msg.snippet,
            "hasAttachment": msg.has_attachments,
            "bodyValues": {
                "1": {
                    "value": body_val,
                    "isTruncated": false
                }
            },
            "textBody": [{
                "partId": "1",
                "type": if is_html { "text/html" } else { "text/plain" },
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
    let in_mailbox = if let Some(s) = filter.and_then(|f| f.get("inMailbox")).and_then(|v| v.as_str()) {
        if let Ok(u) = Uuid::parse_str(s) {
            Some(u)
        } else {
            repo.get_mailbox_by_role(account_id, s).await.ok().flatten().map(|m| m.id)
        }
    } else {
        None
    };

    let text_query = filter
        .and_then(|f| f.get("text"))
        .and_then(|v| v.as_str());

    let messages: Vec<EnrichedMessage> = if let Some(query) = text_query {
        repo.search_messages(account_id, query, limit)
            .await
            .map_err(|e| format!("Search error: {}", e))?
    } else if let Some(mb_id) = in_mailbox {
        repo.list_messages_in_mailbox(mb_id, limit, position)
            .await
            .map_err(|e| format!("List error: {}", e))?
    } else {
        sqlx::query_as::<_, EnrichedMessage>(
            r#"
            SELECT 
                m.id, m.account_id, mm.mailbox_id, m.blob_id, m.thread_id,
                mm.uid, mm.modseq, m.rfc822_message_id, m.in_reply_to,
                m.subject, m.from_address, m.from_name, m.to_addresses,
                m.cc_addresses, m.bcc_addresses, m.reply_to, m.date,
                m.size_bytes, m.snippet, m.has_attachments,
                mm.is_unread, mm.is_flagged, mm.is_draft, mm.is_answered,
                mm.is_deleted, mm.keywords, m.created_at
            FROM messages m
            JOIN message_mailboxes mm ON mm.message_id = m.id
            WHERE m.account_id = $1 AND mm.is_deleted = false
            ORDER BY m.date DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(account_id)
        .bind(limit)
        .bind(position)
        .fetch_all(repo.pool())
        .await
        .map_err(|e| format!("List error: {}", e))?
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
    storage: &Arc<dyn BlobStorage>,
    event_bus: &EventBus,
    account_id: Uuid,
    args: Value,
) -> Result<Value, String> {
    let mut created = serde_json::Map::new();
    let mut updated = serde_json::Map::new();
    let mut destroyed = Vec::new();

    if let Some(create_map) = args.get("create").and_then(|v| v.as_object()) {
        for (temp_id, val) in create_map {
            let mut target_mb_id = None;
            if let Some(mb_ids) = val.get("mailboxIds").and_then(|m| m.as_object()) {
                for key in mb_ids.keys() {
                    if let Ok(u) = Uuid::parse_str(key) {
                        target_mb_id = Some(u);
                        break;
                    }
                }
            }

            if target_mb_id.is_none() {
                if let Ok(Some(mb)) = repo.get_mailbox_by_role(account_id, "sent").await {
                    target_mb_id = Some(mb.id);
                } else if let Ok(Some(mb)) = repo.get_mailbox_by_role(account_id, "inbox").await {
                    target_mb_id = Some(mb.id);
                }
            }

            let mailbox_id = match target_mb_id {
                Some(id) => id,
                None => continue,
            };

            let subject = val
                .get("subject")
                .and_then(|v| v.as_str())
                .unwrap_or("(No Subject)")
                .to_string();

            let from_addr = val
                .get("from")
                .and_then(|v| v.as_array())
                .and_then(|arr| arr.first())
                .and_then(|f| f.get("email"))
                .and_then(|v| v.as_str())
                .unwrap_or("user@localhost")
                .to_string();

            let to_addr = val
                .get("to")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|t| t.get("email").and_then(|e| e.as_str()))
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .unwrap_or_default();

            let text_val = val
                .get("bodyValues")
                .and_then(|bv| bv.as_object())
                .and_then(|obj| obj.values().next())
                .and_then(|b| b.get("value"))
                .and_then(|v| v.as_str())
                .unwrap_or("");

            let snippet = text_val.chars().take(150).collect::<String>();

            let raw_mime = format!(
                "From: {}\r\nTo: {}\r\nSubject: {}\r\nDate: {}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n{}",
                from_addr,
                to_addr,
                subject,
                chrono::Utc::now().to_rfc2822(),
                text_val
            );
            let payload = raw_mime.as_bytes();

            let mut hasher = Sha256::new();
            hasher.update(payload);
            let blob_id = hex::encode(hasher.finalize());

            let _ = storage.put_blob(&blob_id, payload).await;
            let _ = repo.reserve_blob(&blob_id, payload.len() as i64, payload.len() as i64, "zstd").await;

            let incoming = NewIncomingMessage {
                account_id,
                mailbox_id,
                blob_id: blob_id.clone(),
                rfc822_message_id: format!("<{}@postarc>", Uuid::new_v4()),
                in_reply_to: String::new(),
                references: Vec::new(),
                subject: subject.clone(),
                from_address: from_addr,
                from_name: String::new(),
                to_addresses: to_addr,
                cc_addresses: None,
                bcc_addresses: None,
                reply_to: None,
                date: chrono::Utc::now(),
                size_bytes: payload.len() as i64,
                snippet,
                has_attachments: false,
                is_unread: false,
                is_flagged: false,
                is_draft: false,
                keywords: vec!["$seen".to_string()],
            };

            if let Ok((inserted_msg, junction)) = repo.insert_message_with_junction(incoming).await {
                event_bus.publish(MailboxEvent {
                    account_id,
                    mailbox_id,
                    event_type: MailboxEventType::Created,
                    uid: junction.uid,
                    modseq: junction.modseq,
                });

                created.insert(
                    temp_id.clone(),
                    json!({
                        "id": inserted_msg.id.to_string(),
                        "blobId": blob_id,
                        "threadId": inserted_msg.thread_id.to_string(),
                        "size": payload.len()
                    }),
                );
            }
        }
    }

    if let Some(update_map) = args.get("update").and_then(|v| v.as_object()) {
        for (id_str, patch) in update_map {
            if let Ok(msg_id) = Uuid::parse_str(id_str) {
                // Find mailbox_id and uid for this message
                let junc_opt = sqlx::query_as::<_, (Uuid, i32)>(
                    "SELECT mailbox_id, uid FROM message_mailboxes WHERE message_id = $1 LIMIT 1",
                )
                .bind(msg_id)
                .fetch_optional(repo.pool())
                .await
                .unwrap_or(None);

                if let Some((current_mb_id, current_uid)) = junc_opt {
                    let mut flags = FlagUpdates::default();

                    if let Some(keywords) = patch.get("keywords").and_then(|k| k.as_object()) {
                        if let Some(seen) = keywords.get("$seen").and_then(|v| v.as_bool()) {
                            flags.is_unread = Some(!seen);
                        }
                        if let Some(flagged) = keywords.get("$flagged").and_then(|v| v.as_bool()) {
                            flags.is_flagged = Some(flagged);
                        }
                    }

                    // Handle move to different mailbox
                    if let Some(mb_ids) = patch.get("mailboxIds").and_then(|m| m.as_object()) {
                        if let Some(new_mb_id_str) = mb_ids.keys().next() {
                            if let Ok(new_mb_id) = Uuid::parse_str(new_mb_id_str) {
                                if new_mb_id != current_mb_id {
                                    let _ = repo.copy_or_move_message(current_mb_id, new_mb_id, current_uid, true).await;
                                }
                            }
                        }
                    }

                    if let Ok(Some(updated_junc)) = repo.update_message_flags(current_mb_id, current_uid, flags).await {
                        event_bus.publish(MailboxEvent {
                            account_id,
                            mailbox_id: current_mb_id,
                            event_type: MailboxEventType::Updated,
                            uid: updated_junc.uid,
                            modseq: updated_junc.modseq,
                        });
                        updated.insert(id_str.clone(), json!({}));
                    }
                }
            }
        }
    }

    if let Some(destroy_list) = args.get("destroy").and_then(|v| v.as_array()) {
        for id_val in destroy_list {
            if let Some(id_str) = id_val.as_str() {
                if let Ok(msg_id) = Uuid::parse_str(id_str) {
                    let junc_opt = sqlx::query_as::<_, (Uuid, i32, String)>(
                        r#"
                        SELECT mm.mailbox_id, mm.uid, m.blob_id
                        FROM message_mailboxes mm
                        JOIN messages m ON m.id = mm.message_id
                        WHERE mm.message_id = $1 AND m.account_id = $2
                        "#,
                    )
                    .bind(msg_id)
                    .bind(account_id)
                    .fetch_optional(repo.pool())
                    .await
                    .unwrap_or(None);

                    if let Some((mb_id, uid, blob_id)) = junc_opt {
                        let _ = sqlx::query("DELETE FROM message_mailboxes WHERE message_id = $1")
                            .bind(msg_id)
                            .execute(repo.pool())
                            .await;

                        let _ = sqlx::query("DELETE FROM messages WHERE id = $1")
                            .bind(msg_id)
                            .execute(repo.pool())
                            .await;

                        let _ = repo.release_blob(&blob_id).await;

                        event_bus.publish(MailboxEvent {
                            account_id,
                            mailbox_id: mb_id,
                            event_type: MailboxEventType::Expunged,
                            uid,
                            modseq: 1,
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
        "created": created,
        "updated": updated,
        "destroyed": destroyed
    }))
}
