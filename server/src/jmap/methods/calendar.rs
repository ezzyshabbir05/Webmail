use crate::db::MailRepository;
use serde_json::{json, Value};
use uuid::Uuid;

pub async fn handle_calendar_event_get(
    repo: &MailRepository,
    account_id: Uuid,
    _args: Value,
) -> Result<Value, String> {
    let rows: Vec<(Uuid, String, String, chrono::DateTime<chrono::Utc>, chrono::DateTime<chrono::Utc>, String, String, serde_json::Value)> = sqlx::query_as(
        r#"
        SELECT id, uid, title, start_time, end_time, location, description, raw_data
        FROM calendar_events
        WHERE account_id = $1
        ORDER BY start_time ASC
        "#,
    )
    .bind(account_id)
    .fetch_all(repo.pool())
    .await
    .map_err(|e| format!("DB error: {}", e))?;

    let list: Vec<Value> = rows
        .into_iter()
        .map(|(id, uid, title, start, end, location, desc, raw)| {
            let mut val = json!({
                "id": id.to_string(),
                "uid": uid,
                "title": title,
                "start": start.to_rfc3339(),
                "end": end.to_rfc3339(),
                "locations": { "loc": { "name": location } },
                "description": desc,
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

pub async fn handle_calendar_event_set(
    repo: &MailRepository,
    account_id: Uuid,
    args: Value,
) -> Result<Value, String> {
    let mut created = serde_json::Map::new();
    let updated = serde_json::Map::new();
    let mut destroyed = Vec::new();

    if let Some(create_map) = args.get("create").and_then(|v| v.as_object()) {
        for (temp_id, val) in create_map {
            let uid = val.get("uid").and_then(|v| v.as_str()).unwrap_or(&temp_id).to_string();
            let title = val.get("title").and_then(|v| v.as_str()).unwrap_or("Event").to_string();
            let start = val
                .get("start")
                .and_then(|v| v.as_str())
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(chrono::Utc::now);

            let end = val
                .get("end")
                .and_then(|v| v.as_str())
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(|| start + chrono::Duration::hours(1));

            let location = val
                .get("locations")
                .and_then(|l| l.as_object())
                .and_then(|obj| obj.values().next())
                .and_then(|v| v.get("name"))
                .and_then(|n| n.as_str())
                .unwrap_or("")
                .to_string();

            let desc = val.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string();

            let event_id = Uuid::new_v4();
            let _ = sqlx::query(
                r#"
                INSERT INTO calendar_events (id, account_id, uid, title, start_time, end_time, location, description, raw_data)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                "#,
            )
            .bind(event_id)
            .bind(account_id)
            .bind(uid)
            .bind(title)
            .bind(start)
            .bind(end)
            .bind(location)
            .bind(desc)
            .bind(val)
            .execute(repo.pool())
            .await;

            created.insert(temp_id.clone(), json!({ "id": event_id.to_string() }));
        }
    }

    if let Some(destroy_list) = args.get("destroy").and_then(|v| v.as_array()) {
        for id_val in destroy_list {
            if let Some(id_str) = id_val.as_str() {
                if let Ok(ev_id) = Uuid::parse_str(id_str) {
                    let _ = sqlx::query("DELETE FROM calendar_events WHERE id = $1 AND account_id = $2")
                        .bind(ev_id)
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
