use crate::db::MailRepository;
use serde_json::{json, Value};
use uuid::Uuid;

pub async fn handle_mailbox_get(
    repo: &MailRepository,
    account_id: Uuid,
    _args: Value,
) -> Result<Value, String> {
    let mailboxes = repo
        .list_mailboxes(account_id)
        .await
        .map_err(|e| format!("Database error: {}", e))?;

    let mut list = Vec::new();

    for mb in mailboxes {
        // Query counts for this mailbox via junction table message_mailboxes
        let counts: Result<(i64, i64), sqlx::Error> = sqlx::query_as(
            r#"
            SELECT 
                COUNT(*)::bigint as total,
                COUNT(CASE WHEN mm.is_unread THEN 1 END)::bigint as unread
            FROM message_mailboxes mm
            WHERE mm.mailbox_id = $1 AND mm.is_deleted = false
            "#,
        )
        .bind(mb.id)
        .fetch_one(repo.pool())
        .await;

        let (total_emails, unread_emails) = counts.unwrap_or((0, 0));

        list.push(json!({
            "id": mb.id.to_string(),
            "name": mb.name,
            "role": mb.role,
            "parentId": mb.parent_id.map(|id| id.to_string()),
            "sortOrder": mb.sort_order,
            "totalEmails": total_emails,
            "unreadEmails": unread_emails,
            "totalThreads": total_emails,
            "unreadThreads": unread_emails,
            "myRights": {
                "mayReadItems": true,
                "mayAddItems": true,
                "maySetSeen": true,
                "maySetKeywords": true,
                "mayCreateChild": true,
                "mayRename": mb.role.is_none(),
                "mayDelete": mb.role.is_none(),
                "maySubmit": true
            }
        }));
    }

    Ok(json!({
        "accountId": account_id.to_string(),
        "state": "1",
        "list": list
    }))
}

pub async fn handle_mailbox_set(
    repo: &MailRepository,
    account_id: Uuid,
    args: Value,
) -> Result<Value, String> {
    let mut created = serde_json::Map::new();
    let updated = serde_json::Map::new();
    let mut destroyed = Vec::new();

    if let Some(create_map) = args.get("create").and_then(|v| v.as_object()) {
        for (temp_id, val) in create_map {
            if let Some(name) = val.get("name").and_then(|n| n.as_str()) {
                let now_sec = chrono::Utc::now().timestamp() as i32;
                let res = sqlx::query_as::<_, (Uuid,)>(
                    r#"
                    INSERT INTO mailboxes (account_id, name, sort_order, uid_validity, next_uid, highest_modseq)
                    VALUES ($1, $2, 10, $3, 1, 1)
                    RETURNING id
                    "#,
                )
                .bind(account_id)
                .bind(name)
                .bind(now_sec)
                .fetch_one(repo.pool())
                .await;

                if let Ok(row) = res {
                    created.insert(temp_id.clone(), json!({ "id": row.0.to_string() }));
                }
            }
        }
    }

    if let Some(destroy_list) = args.get("destroy").and_then(|v| v.as_array()) {
        for id_val in destroy_list {
            if let Some(id_str) = id_val.as_str() {
                if let Ok(mb_id) = Uuid::parse_str(id_str) {
                    let _ = sqlx::query("DELETE FROM mailboxes WHERE id = $1 AND account_id = $2 AND role IS NULL")
                        .bind(mb_id)
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
        "oldState": "1",
        "newState": "2",
        "created": created,
        "updated": updated,
        "destroyed": destroyed
    }))
}
