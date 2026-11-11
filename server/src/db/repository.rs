use super::models::{Account, Mailbox, Message};
use crate::auth::argon::hash_password;
use chrono::{DateTime, Utc};
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

#[derive(Clone)]
pub struct MailRepository {
    pool: PgPool,
}

#[derive(Clone, Debug)]
pub struct NewMessage {
    pub account_id: Uuid,
    pub mailbox_id: Uuid,
    pub blob_id: String,
    pub thread_id: Option<Uuid>,
    pub subject: String,
    pub from_address: String,
    pub to_addresses: String,
    pub cc_addresses: Option<String>,
    pub bcc_addresses: Option<String>,
    pub reply_to: Option<String>,
    pub date: DateTime<Utc>,
    pub size_bytes: i64,
    pub is_unread: bool,
    pub is_flagged: bool,
    pub is_draft: bool,
    pub keywords: Vec<String>,
    pub snippet: String,
}

impl MailRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    pub async fn run_migrations(&self) -> Result<(), sqlx::Error> {
        let schema_sql = include_str!("schema.sql");
        sqlx::raw_sql(schema_sql).execute(&self.pool).await?;
        Ok(())
    }

    pub async fn seed_default_account(
        &self,
        admin_email: &str,
        default_password: &str,
    ) -> Result<Account, Box<dyn std::error::Error>> {
        let email = admin_email.to_lowercase();
        let username = admin_email.to_string();

        if let Some(existing) = self.get_account_by_email(&email).await? {
            return Ok(existing);
        }

        let password_hash = hash_password(default_password)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

        let account = sqlx::query_as::<_, Account>(
            r#"
            INSERT INTO accounts (username, email, password_hash)
            VALUES ($1, $2, $3)
            RETURNING *
            "#,
        )
        .bind(&username)
        .bind(&email)
        .bind(&password_hash)
        .fetch_one(&self.pool)
        .await?;

        // Seed default mailboxes
        let default_folders = [
            ("Inbox", Some("inbox"), 1),
            ("Starred", Some("starred"), 2),
            ("Sent", Some("sent"), 3),
            ("Drafts", Some("drafts"), 4),
            ("Archive", Some("archive"), 5),
            ("Spam", Some("spam"), 6),
            ("Trash", Some("trash"), 7),
        ];

        let now_sec = Utc::now().timestamp() as i32;

        for (name, role, sort_order) in default_folders {
            sqlx::query(
                r#"
                INSERT INTO mailboxes (account_id, name, role, sort_order, uid_validity, next_uid, highest_modseq)
                VALUES ($1, $2, $3, $4, $5, 1, 1)
                ON CONFLICT (account_id, name) DO NOTHING
                "#,
            )
            .bind(account.id)
            .bind(name)
            .bind(role)
            .bind(sort_order)
            .bind(now_sec)
            .execute(&self.pool)
            .await?;
        }

        Ok(account)
    }

    pub async fn get_account_by_email(&self, email: &str) -> Result<Option<Account>, sqlx::Error> {
        sqlx::query_as::<_, Account>("SELECT * FROM accounts WHERE LOWER(email) = LOWER($1)")
            .bind(email)
            .fetch_optional(&self.pool)
            .await
    }

    pub async fn get_account_by_id(&self, id: Uuid) -> Result<Option<Account>, sqlx::Error> {
        sqlx::query_as::<_, Account>("SELECT * FROM accounts WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
    }

    pub async fn list_mailboxes(&self, account_id: Uuid) -> Result<Vec<Mailbox>, sqlx::Error> {
        sqlx::query_as::<_, Mailbox>(
            "SELECT * FROM mailboxes WHERE account_id = $1 ORDER BY sort_order ASC, name ASC",
        )
        .bind(account_id)
        .fetch_all(&self.pool)
        .await
    }

    pub async fn get_mailbox_by_role(
        &self,
        account_id: Uuid,
        role: &str,
    ) -> Result<Option<Mailbox>, sqlx::Error> {
        sqlx::query_as::<_, Mailbox>(
            "SELECT * FROM mailboxes WHERE account_id = $1 AND role = $2 LIMIT 1",
        )
        .bind(account_id)
        .bind(role)
        .fetch_optional(&self.pool)
        .await
    }

    pub async fn get_mailbox_by_id(&self, mailbox_id: Uuid) -> Result<Option<Mailbox>, sqlx::Error> {
        sqlx::query_as::<_, Mailbox>("SELECT * FROM mailboxes WHERE id = $1")
            .bind(mailbox_id)
            .fetch_optional(&self.pool)
            .await
    }

    pub async fn reserve_blob(&self, sha256: &str, size_bytes: i64) -> Result<bool, sqlx::Error> {
        let row: (bool,) = sqlx::query_as(
            r#"
            INSERT INTO message_blobs (sha256, size_bytes, ref_count, status)
            VALUES ($1, $2, 1, 'active')
            ON CONFLICT (sha256) DO UPDATE
            SET ref_count = message_blobs.ref_count + 1, status = 'active'
            RETURNING (xmax = 0) AS is_new
            "#,
        )
        .bind(sha256)
        .bind(size_bytes)
        .fetch_one(&self.pool)
        .await?;

        Ok(row.0)
    }

    pub async fn release_blob(&self, sha256: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE message_blobs SET ref_count = ref_count - 1 WHERE sha256 = $1;
            UPDATE message_blobs SET status = 'pending_purge', purge_after = NOW() + INTERVAL '24 hours'
            WHERE sha256 = $1 AND ref_count <= 0;
            "#,
        )
        .bind(sha256)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn insert_message(&self, msg: NewMessage) -> Result<Message, sqlx::Error> {
        let mut tx: Transaction<'_, Postgres> = self.pool.begin().await?;

        // 1. Lock and increment mailbox next_uid and highest_modseq
        let mb: (i32, i64) = sqlx::query_as(
            r#"
            SELECT next_uid, highest_modseq
            FROM mailboxes
            WHERE id = $1
            FOR UPDATE
            "#,
        )
        .bind(msg.mailbox_id)
        .fetch_one(&mut *tx)
        .await?;

        let current_uid = mb.0;
        let new_modseq = mb.1 + 1;
        let next_uid = current_uid + 1;

        sqlx::query(
            r#"
            UPDATE mailboxes
            SET next_uid = $1, highest_modseq = $2
            WHERE id = $3
            "#,
        )
        .bind(next_uid)
        .bind(new_modseq)
        .bind(msg.mailbox_id)
        .execute(&mut *tx)
        .await?;

        // 2. Insert message record
        let thread_id = msg.thread_id.unwrap_or_else(Uuid::new_v4);
        let inserted = sqlx::query_as::<_, Message>(
            r#"
            INSERT INTO messages (
                account_id, mailbox_id, blob_id, thread_id, uid, modseq,
                subject, from_address, to_addresses, cc_addresses, bcc_addresses,
                reply_to, date, size_bytes, is_unread, is_flagged, is_draft,
                keywords, snippet
            )
            VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8, $9, $10, $11,
                $12, $13, $14, $15, $16, $17,
                $18, $19
            )
            RETURNING *
            "#,
        )
        .bind(msg.account_id)
        .bind(msg.mailbox_id)
        .bind(msg.blob_id)
        .bind(thread_id)
        .bind(current_uid)
        .bind(new_modseq)
        .bind(msg.subject)
        .bind(msg.from_address)
        .bind(msg.to_addresses)
        .bind(msg.cc_addresses.unwrap_or_default())
        .bind(msg.bcc_addresses.unwrap_or_default())
        .bind(msg.reply_to.unwrap_or_default())
        .bind(msg.date)
        .bind(msg.size_bytes)
        .bind(msg.is_unread)
        .bind(msg.is_flagged)
        .bind(msg.is_draft)
        .bind(&msg.keywords)
        .bind(msg.snippet)
        .fetch_one(&mut *tx)
        .await?;

        tx.commit().await?;

        Ok(inserted)
    }

    pub async fn list_messages(
        &self,
        mailbox_id: Uuid,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Message>, sqlx::Error> {
        sqlx::query_as::<_, Message>(
            r#"
            SELECT * FROM messages
            WHERE mailbox_id = $1
            ORDER BY date DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(mailbox_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
    }

    pub async fn search_messages(
        &self,
        account_id: Uuid,
        search_query: &str,
        limit: i64,
    ) -> Result<Vec<Message>, sqlx::Error> {
        sqlx::query_as::<_, Message>(
            r#"
            SELECT * FROM messages
            WHERE account_id = $1 AND tsv @@ plainto_tsquery('simple', $2)
            ORDER BY ts_rank(tsv, plainto_tsquery('simple', $2)) DESC, date DESC
            LIMIT $3
            "#,
        )
        .bind(account_id)
        .bind(search_query)
        .bind(limit)
        .fetch_all(&self.pool)
        .await
    }

    pub async fn update_message_flags(
        &self,
        message_id: Uuid,
        is_unread: Option<bool>,
        is_flagged: Option<bool>,
    ) -> Result<Option<Message>, sqlx::Error> {
        let mut tx = self.pool.begin().await?;

        let msg = match sqlx::query_as::<_, Message>("SELECT * FROM messages WHERE id = $1 FOR UPDATE")
            .bind(message_id)
            .fetch_optional(&mut *tx)
            .await?
        {
            Some(m) => m,
            None => return Ok(None),
        };

        // Increment modseq on mailbox
        let new_modseq: (i64,) = sqlx::query_as(
            "UPDATE mailboxes SET highest_modseq = highest_modseq + 1 WHERE id = $1 RETURNING highest_modseq",
        )
        .bind(msg.mailbox_id)
        .fetch_one(&mut *tx)
        .await?;

        let updated = sqlx::query_as::<_, Message>(
            r#"
            UPDATE messages
            SET is_unread = COALESCE($1, is_unread),
                is_flagged = COALESCE($2, is_flagged),
                modseq = $3
            WHERE id = $4
            RETURNING *
            "#,
        )
        .bind(is_unread)
        .bind(is_flagged)
        .bind(new_modseq.0)
        .bind(message_id)
        .fetch_one(&mut *tx)
        .await?;

        tx.commit().await?;

        Ok(Some(updated))
    }
}
