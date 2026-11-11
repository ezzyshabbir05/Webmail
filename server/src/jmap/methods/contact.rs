use crate::db::MailRepository;
use serde_json::{json, Value};
use uuid::Uuid;

pub async fn handle_contact_card_get(
    repo: &MailRepository,
    account_id: Uuid,
    _args: Value,
) -> Result<Value, String> {
    let rows: Vec<(Uuid, String, String, String, String, String, serde_json::Value)> = sqlx::query_as(
        r#"
        SELECT id, uid, name, email, phone, company, raw_data
        FROM contacts
        WHERE account_id = $1
        ORDER BY name ASC
        "#,
    )
    .bind(account_id)
    .fetch_all(repo.pool())
    .await
    .map_err(|e| format!("DB error: {}", e))?;

    let list: Vec<Value> = rows
        .into_iter()
        .map(|(id, uid, name, email, phone, _company, raw)| {
            let mut val = json!({
                "id": id.to_string(),
                "uid": uid,
                "name": { "full": name },
                "emails": { "em1": { "address": email } },
                "phones": { "ph1": { "number": phone } },
            });
            if let Some(obj) = raw.as_object() {
                if let Some(target) = val.as_object_mut() {
                    for (k, v) in obj {
                        if !target.contains_key(k) {
                            target.insert(k.clone(), v.clone());
                        }
                    }
                }
            }
            val
        })
        .collect();

    Ok(json!({
        "accountId": account_id.to_string(),
        "state": "1",
        "list": list
    }))
}

pub async fn handle_contact_card_set(
    repo: &MailRepository,
    account_id: Uuid,
    args: Value,
) -> Result<Value, String> {
    let mut created = serde_json::Map::new();
    let mut updated = serde_json::Map::new();
    let mut destroyed = Vec::new();

    if let Some(create_map) = args.get("create").and_then(|v| v.as_object()) {
        for (temp_id, val) in create_map {
            let uid = val.get("uid").and_then(|v| v.as_str()).unwrap_or(&temp_id).to_string();
            let name = val
                .get("name")
                .and_then(|n| n.get("full"))
                .and_then(|v| v.as_str())
                .unwrap_or("Contact")
                .to_string();

            let email = val
                .get("emails")
                .and_then(|e| e.as_object())
                .and_then(|obj| obj.values().next())
                .and_then(|v| v.get("address"))
                .and_then(|a| a.as_str())
                .unwrap_or("")
                .to_string();

            let phone = val
                .get("phones")
                .and_then(|p| p.as_object())
                .and_then(|obj| obj.values().next())
                .and_then(|v| v.get("number"))
                .and_then(|n| n.as_str())
                .unwrap_or("")
                .to_string();

            let company = val
                .get("company")
                .and_then(|c| c.as_str())
                .unwrap_or("")
                .to_string();

            let contact_id = Uuid::new_v4();
            let _ = sqlx::query(
                r#"
                INSERT INTO contacts (id, account_id, uid, name, email, phone, company, raw_data)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                "#,
            )
            .bind(contact_id)
            .bind(account_id)
            .bind(uid)
            .bind(name)
            .bind(email)
            .bind(phone)
            .bind(company)
            .bind(val)
            .execute(repo.pool())
            .await;

            created.insert(temp_id.clone(), json!({ "id": contact_id.to_string() }));
        }
    }

    if let Some(destroy_list) = args.get("destroy").and_then(|v| v.as_array()) {
        for id_val in destroy_list {
            if let Some(id_str) = id_val.as_str() {
                if let Ok(c_id) = Uuid::parse_str(id_str) {
                    let _ = sqlx::query("DELETE FROM contacts WHERE id = $1 AND account_id = $2")
                        .bind(c_id)
                        .bind(account_id)
                        .execute(repo.pool())
                        .await;
                    destroyed.push(json!(id_str));
                }
            }
        }
    }

    Ok(json!({
        "accountId": account_id.to_string(),
        "created": created,
        "updated": updated,
        "destroyed": destroyed
    }))
}
