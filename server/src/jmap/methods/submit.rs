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
                        let submission_id = Uuid::new_v4();
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
                        .bind(&msg.to_addresses)
                        .execute(repo.pool())
                        .await;

                        created.insert(
                            temp_id.clone(),
                            json!({
                                "id": submission_id.to_string(),
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
