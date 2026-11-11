#![allow(dead_code)]

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct Domain {
    pub id: Uuid,
    pub name: String,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct Account {
    pub id: Uuid,
    pub domain_id: Uuid,
    pub email: String,
    pub username: String,
    pub password_hash: String,
    pub display_name: String,
    pub quota_bytes: i64,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct Alias {
    pub id: Uuid,
    pub domain_id: Uuid,
    pub source_address: String,
    pub target_account_id: Uuid,
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
pub struct MessageBlob {
    pub sha256: String,
    pub compressed_size_bytes: i64,
    pub uncompressed_size_bytes: i64,
    pub compression_algorithm: String,
    pub ref_count: i32,
    pub status: String,
    pub purge_after: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct Message {
    pub id: Uuid,
    pub account_id: Uuid,
    pub blob_id: String,
    pub thread_id: Uuid,
    pub rfc822_message_id: String,
    pub in_reply_to: String,
    pub subject: String,
    pub from_address: String,
    pub from_name: String,
    pub to_addresses: String,
    pub cc_addresses: String,
    pub bcc_addresses: String,
    pub reply_to: String,
    pub date: DateTime<Utc>,
    pub size_bytes: i64,
    pub snippet: String,
    pub has_attachments: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct MessageMailbox {
    pub message_id: Uuid,
    pub mailbox_id: Uuid,
    pub uid: i32,
    pub modseq: i64,
    pub is_unread: bool,
    pub is_flagged: bool,
    pub is_draft: bool,
    pub is_answered: bool,
    pub is_deleted: bool,
    pub keywords: Vec<String>,
    pub created_at: DateTime<Utc>,
}

/// Joined representation of a message within a specific mailbox
#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct EnrichedMessage {
    pub id: Uuid,
    pub account_id: Uuid,
    pub mailbox_id: Uuid,
    pub blob_id: String,
    pub thread_id: Uuid,
    pub uid: i32,
    pub modseq: i64,
    pub rfc822_message_id: String,
    pub in_reply_to: String,
    pub subject: String,
    pub from_address: String,
    pub from_name: String,
    pub to_addresses: String,
    pub cc_addresses: String,
    pub bcc_addresses: String,
    pub reply_to: String,
    pub date: DateTime<Utc>,
    pub size_bytes: i64,
    pub snippet: String,
    pub has_attachments: bool,
    pub is_unread: bool,
    pub is_flagged: bool,
    pub is_draft: bool,
    pub is_answered: bool,
    pub is_deleted: bool,
    pub keywords: Vec<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct OutboundQueueItem {
    pub id: Uuid,
    pub account_id: Uuid,
    pub message_id: Uuid,
    pub sender: String,
    pub recipient: String,
    pub attempts: i32,
    pub max_attempts: i32,
    pub next_retry_at: DateTime<Utc>,
    pub status: String,
    pub last_error: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct DkimKey {
    pub id: Uuid,
    pub domain_id: Uuid,
    pub selector: String,
    pub private_key_pem: String,
    pub algorithm: String,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct SieveScript {
    pub id: Uuid,
    pub account_id: Uuid,
    pub name: String,
    pub script: String,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct VacationResponse {
    pub account_id: Uuid,
    pub is_enabled: bool,
    pub start_at: Option<DateTime<Utc>>,
    pub end_at: Option<DateTime<Utc>>,
    pub subject: String,
    pub text_body: String,
    pub updated_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct CalendarEvent {
    pub id: Uuid,
    pub account_id: Uuid,
    pub uid: String,
    pub title: String,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub location: String,
    pub description: String,
    pub raw_data: serde_json::Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct Contact {
    pub id: Uuid,
    pub account_id: Uuid,
    pub uid: String,
    pub name: String,
    pub email: String,
    pub phone: String,
    pub company: String,
    pub raw_data: serde_json::Value,
    pub created_at: DateTime<Utc>,
}
