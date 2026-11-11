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

    let primary_name = if !account.display_name.is_empty() {
        account.display_name.clone()
    } else {
        account.username.clone()
    };

    let mut list = vec![json!({
        "id": account.id.to_string(),
        "name": primary_name,
        "email": account.email,
        "replyTo": [{ "name": primary_name, "email": account.email }],
        "bcc": [],
        "textSignature": "-- \nSent via Postarc Webmail",
        "htmlSignature": "<div>-- <br>Sent via Postarc Webmail</div>",
        "mayDelete": false
    })];

    // Also include any aliases for this account as selectable sending identities
    if let Ok(aliases) = repo.list_aliases_for_account(account_id).await {
        for al in aliases {
            if !al.source_address.starts_with('@') && al.source_address != account.email {
                list.push(json!({
                    "id": al.id.to_string(),
                    "name": primary_name,
                    "email": al.source_address,
                    "replyTo": [{ "name": primary_name, "email": al.source_address }],
                    "bcc": [],
                    "textSignature": "-- \nSent via Postarc Webmail",
                    "htmlSignature": "<div>-- <br>Sent via Postarc Webmail</div>",
                    "mayDelete": false
                }));
            }
        }
    }

    Ok(json!({
        "accountId": account_id.to_string(),
        "state": "1",
        "list": list
    }))
}
