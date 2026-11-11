use crate::db::MailRepository;
use serde_json::{json, Value};
use uuid::Uuid;

pub async fn handle_submission_set(
    repo: &MailRepository,
    account_id: Uuid,
    args: Value,
) -> Result<Value, String> {
    let mut created = serde_json::Map::new();

    if let Some(create_map) = args.get("create").and_then(|v| v.as_object()) {
        for (temp_id, val) in create_map {
            if let Some(email_id_str) = val.get("emailId").and_then(|v| v.as_str()) {
                if let Ok(email_id) = Uuid::parse_str(email_id_str) {
                    let msg_opt = sqlx::query_as::<_, crate::db::Message>(
                        "SELECT * FROM messages WHERE id = $1 AND account_id = $2",
                    )
                    .bind(email_id)
                    .bind(account_id)
                    .fetch_optional(repo.pool())
                    .await
                    .unwrap_or(None);

                    if let Some(msg) = msg_opt {
                        let mut recipients = Vec::new();
                        for r in msg.to_addresses.split(',') {
                            let trimmed = r.trim().trim_start_matches('<').trim_end_matches('>').trim();
                            if !trimmed.is_empty() && !recipients.contains(&trimmed.to_string()) {
                                recipients.push(trimmed.to_string());
                            }
                        }
                        if let Some(ref cc) = msg.cc_addresses {
                            for r in cc.split(',') {
                                let trimmed = r.trim().trim_start_matches('<').trim_end_matches('>').trim();
                                if !trimmed.is_empty() && !recipients.contains(&trimmed.to_string()) {
                                    recipients.push(trimmed.to_string());
                                }
                            }
                        }
                        if let Some(ref bcc) = msg.bcc_addresses {
                            for r in bcc.split(',') {
                                let trimmed = r.trim().trim_start_matches('<').trim_end_matches('>').trim();
                                if !trimmed.is_empty() && !recipients.contains(&trimmed.to_string()) {
                                    recipients.push(trimmed.to_string());
                                }
                            }
                        }

                        let mut first_submission_id = None;
                        for rcpt in &recipients {
                            let submission_id = Uuid::new_v4();
                            if first_submission_id.is_none() {
                                first_submission_id = Some(submission_id);
                            }
                            let _ = sqlx::query(
                                r#"
                                INSERT INTO outbound_queue (id, account_id, message_id, sender, recipient, status)
                                VALUES ($1, $2, $3, $4, $5, 'queued')
                                "#,
                            )
                            .bind(submission_id)
                            .bind(account_id)
                            .bind(msg.id)
                            .bind(&msg.from_address)
                            .bind(rcpt)
                            .execute(repo.pool())
                            .await;
                        }

                        let sid = first_submission_id.unwrap_or_else(Uuid::new_v4);
                        created.insert(
                            temp_id.clone(),
                            json!({
                                "id": sid.to_string(),
                                "sendAt": chrono::Utc::now().to_rfc3339()
                            }),
                        );
                    }
                }
            }
        }
    }

    Ok(json!({
        "accountId": account_id.to_string(),
        "created": created,
        "notCreated": {}
    }))
}
