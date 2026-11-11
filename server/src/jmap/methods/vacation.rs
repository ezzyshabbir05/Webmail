use crate::db::MailRepository;
use serde_json::{json, Value};
use uuid::Uuid;

pub async fn handle_vacation_response_get(
    repo: &MailRepository,
    account_id: Uuid,
    _args: Value,
) -> Result<Value, String> {
    let vacation = repo
        .get_vacation_response(account_id)
        .await
        .map_err(|e| format!("Database error: {}", e))?;

    let list = match vacation {
        Some(v) => vec![json!({
            "id": "singleton",
            "isEnabled": v.is_enabled,
            "subject": v.subject,
            "textBody": v.text_body,
        })],
        None => vec![json!({
            "id": "singleton",
            "isEnabled": false,
            "subject": "Out of Office Auto-reply",
            "textBody": "I am currently away with limited access to email. I will respond to your message upon my return.",
        })],
    };

    Ok(json!({
        "accountId": account_id.to_string(),
        "state": "1",
        "list": list
    }))
}

pub async fn handle_vacation_response_set(
    repo: &MailRepository,
    account_id: Uuid,
    args: Value,
) -> Result<Value, String> {
    let mut updated = serde_json::Map::new();

    if let Some(update_map) = args.get("update").and_then(|v| v.as_object()) {
        for (id, val) in update_map {
            if id == "singleton" {
                let is_enabled = val.get("isEnabled").and_then(|v| v.as_bool()).unwrap_or(false);
                let subject = val.get("subject").and_then(|v| v.as_str()).unwrap_or("Out of office");
                let text_body = val.get("textBody").and_then(|v| v.as_str()).unwrap_or("");

                repo.set_vacation_response(account_id, is_enabled, subject, text_body)
                    .await
                    .map_err(|e| format!("Failed to save vacation response: {}", e))?;

                updated.insert(id.clone(), json!({}));
            }
        }
    }

    Ok(json!({
        "accountId": account_id.to_string(),
        "updated": updated
    }))
}
