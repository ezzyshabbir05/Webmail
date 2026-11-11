use crate::db::MailRepository;
use serde_json::{json, Value};
use uuid::Uuid;

pub async fn handle_identity_get(
    repo: &MailRepository,
    account_id: Uuid,
    _args: Value,
) -> Result<Value, String> {
    let account = repo
        .get_account_by_id(account_id)
        .await
        .map_err(|e| format!("Database error: {}", e))?
        .ok_or_else(|| "Account not found".to_string())?;

    let list = vec![json!({
        "id": account.id.to_string(),
        "name": account.username,
        "email": account.email,
        "replyTo": [{ "name": account.username, "email": account.email }],
        "bcc": [],
        "textSignature": "-- \nSent via Postarc Webmail",
        "htmlSignature": "<div>-- <br>Sent via Postarc Webmail</div>",
        "mayDelete": false
    })];

    Ok(json!({
        "accountId": account_id.to_string(),
        "state": "1",
        "list": list
    }))
}
