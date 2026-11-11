use crate::db::MailRepository;
use serde_json::{json, Value};
use uuid::Uuid;

pub async fn handle_quota_get(
    repo: &MailRepository,
    account_id: Uuid,
    _args: Value,
) -> Result<Value, String> {
    let account = repo
        .get_account_by_id(account_id)
        .await
        .map_err(|e| format!("DB error: {}", e))?
        .ok_or_else(|| "Account not found".to_string())?;

    let row: Result<(Option<i64>,), sqlx::Error> = sqlx::query_as(
        "SELECT SUM(size_bytes)::bigint FROM messages WHERE account_id = $1",
    )
    .bind(account_id)
    .fetch_one(repo.pool())
    .await;

    let used_bytes = row.ok().and_then(|r| r.0).unwrap_or(0);

    let list = vec![json!({
        "id": "quota_root",
        "name": "Account Storage",
        "resourceType": "octets",
        "used": used_bytes,
        "limit": account.quota_bytes,
        "scope": "account"
    })];

    Ok(json!({
        "accountId": account_id.to_string(),
        "state": "1",
        "list": list
    }))
}
