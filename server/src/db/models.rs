use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct Account {
    pub id: Uuid,
    pub username: String,
    pub email: String,
    pub password_hash: String,
    pub quota_bytes: i64,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct Mailbox {
    pub id: Uuid,
    pub account_id: Uuid,
    pub name: String,
    pub role: Option<String>,
    pub parent_id: Option<Uuid>,
    pub sort_order: i32,
    pub uid_validity: i32,
    pub next_uid: i32,
    pub highest_modseq: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct Message {
    pub id: Uuid,
    pub account_id: Uuid,
    pub mailbox_id: Uuid,
    pub blob_id: String,
    pub thread_id: Uuid,
    pub uid: i32,
    pub modseq: i64,
    pub subject: String,
    pub from_address: String,
    pub to_addresses: String,
    pub cc_addresses: String,
    pub bcc_addresses: String,
    pub reply_to: String,
    pub date: DateTime<Utc>,
    pub size_bytes: i64,
    pub is_unread: bool,
    pub is_flagged: bool,
    pub is_draft: bool,
    pub is_answered: bool,
    pub keywords: Vec<String>,
    pub snippet: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct MessageBlob {
    pub sha256: String,
    pub size_bytes: i64,
    pub ref_count: i32,
    pub status: String,
    pub purge_after: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct Identity {
    pub id: Uuid,
    pub account_id: Uuid,
    pub name: String,
    pub email: String,
    pub reply_to: String,
    pub signature: String,
    pub is_default: bool,
    pub created_at: DateTime<Utc>,
}
