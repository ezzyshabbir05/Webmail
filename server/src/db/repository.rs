#![allow(dead_code)]

use super::models::{
    Account, Alias, DkimKey, Domain, EnrichedMessage, Mailbox, Message,
    MessageMailbox, SieveScript, VacationResponse,
};
use crate::auth::argon::hash_password;
use chrono::{DateTime, Utc};
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

#[derive(Clone)]
pub struct MailRepository {
    pool: PgPool,
}

#[derive(Clone, Debug)]
pub struct NewIncomingMessage {
    pub account_id: Uuid,
    pub mailbox_id: Uuid,
    pub blob_id: String,
    pub rfc822_message_id: String,
    pub in_reply_to: String,
    pub references: Vec<String>,
    pub subject: String,
    pub from_address: String,
    pub from_name: String,
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
    pub has_attachments: bool,
}

#[derive(Clone, Debug, Default)]
pub struct FlagUpdates {
    pub is_unread: Option<bool>,
    pub is_flagged: Option<bool>,
    pub is_draft: Option<bool>,
    pub is_answered: Option<bool>,
    pub is_deleted: Option<bool>,
    pub add_keywords: Vec<String>,
    pub remove_keywords: Vec<String>,
}

impl MailRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn connect(database_url: &str) -> Result<Self, sqlx::Error> {
        let pool = crate::db::init_pool(database_url).await?;
        let repo = Self::new(pool);
        repo.run_migrations().await?;
        Ok(repo)
    }

    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    pub async fn run_migrations(&self) -> Result<(), sqlx::Error> {
        let schema_sql = include_str!("schema.sql");
        sqlx::raw_sql(schema_sql).execute(&self.pool).await?;
        Ok(())
    }

    // =========================================================================
    // Domain & Directory Operations
    // =========================================================================

    pub async fn ensure_domain(&self, name: &str) -> Result<Domain, sqlx::Error> {
        let clean = name.trim().to_lowercase();
        let domain = sqlx::query_as::<_, Domain>(
            r#"
            INSERT INTO domains (name)
            VALUES ($1)
            ON CONFLICT (name) DO UPDATE SET is_active = true
            RETURNING *
            "#,
        )
        .bind(&clean)
        .fetch_one(&self.pool)
        .await?;
        Ok(domain)
    }

    pub async fn get_domain_by_name(&self, name: &str) -> Result<Option<Domain>, sqlx::Error> {
        sqlx::query_as::<_, Domain>("SELECT * FROM domains WHERE LOWER(name) = LOWER($1)")
            .bind(name.trim())
            .fetch_optional(&self.pool)
            .await
    }

    pub async fn list_domains(&self) -> Result<Vec<Domain>, sqlx::Error> {
        sqlx::query_as::<_, Domain>("SELECT * FROM domains ORDER BY name ASC")
            .fetch_all(&self.pool)
            .await
    }

    pub async fn delete_domain(&self, id: Uuid) -> Result<bool, sqlx::Error> {
        let res = sqlx::query("DELETE FROM domains WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(res.rows_affected() > 0)
    }

    pub async fn delete_domain_by_name(&self, name: &str) -> Result<bool, sqlx::Error> {
        let res = sqlx::query("DELETE FROM domains WHERE LOWER(name) = LOWER($1)")
            .bind(name.trim())
            .execute(&self.pool)
            .await?;
        Ok(res.rows_affected() > 0)
    }

    // =========================================================================
    // Account Operations
    // =========================================================================

    pub async fn create_account(
        &self,
        domain_id: Uuid,
        email: &str,
        username: &str,
        password_hash: &str,
        display_name: &str,
        quota_bytes: i64,
    ) -> Result<Account, sqlx::Error> {
        let clean_email = email.trim().to_lowercase();
        let clean_username = username.trim().to_lowercase();

        let mut tx = self.pool.begin().await?;

        let account = sqlx::query_as::<_, Account>(
            r#"
            INSERT INTO accounts (domain_id, email, username, password_hash, display_name, quota_bytes)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
            "#,
        )
        .bind(domain_id)
        .bind(&clean_email)
        .bind(&clean_username)
        .bind(password_hash)
        .bind(display_name)
        .bind(quota_bytes)
        .fetch_one(&mut *tx)
        .await?;

        // Seed default folders
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
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(account)
    }

    pub async fn get_account_by_email(&self, ident: &str) -> Result<Option<Account>, sqlx::Error> {
        let clean = ident.trim().to_lowercase();
        if clean.contains('@') {
            sqlx::query_as::<_, Account>("SELECT * FROM accounts WHERE LOWER(email) = LOWER($1)")
                .bind(&clean)
                .fetch_optional(&self.pool)
                .await
        } else {
            sqlx::query_as::<_, Account>("SELECT * FROM accounts WHERE LOWER(username) = LOWER($1) ORDER BY created_at ASC LIMIT 1")
                .bind(&clean)
                .fetch_optional(&self.pool)
                .await
        }
    }

    pub async fn get_account_by_id(&self, id: Uuid) -> Result<Option<Account>, sqlx::Error> {
        sqlx::query_as::<_, Account>("SELECT * FROM accounts WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
    }

    pub async fn list_accounts(&self, domain_id: Option<Uuid>) -> Result<Vec<Account>, sqlx::Error> {
        if let Some(did) = domain_id {
            sqlx::query_as::<_, Account>("SELECT * FROM accounts WHERE domain_id = $1 ORDER BY email ASC")
                .bind(did)
                .fetch_all(&self.pool)
                .await
        } else {
            sqlx::query_as::<_, Account>("SELECT * FROM accounts ORDER BY email ASC")
                .fetch_all(&self.pool)
                .await
        }
    }

    pub async fn delete_account(&self, id: Uuid) -> Result<bool, sqlx::Error> {
        let res = sqlx::query("DELETE FROM accounts WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(res.rows_affected() > 0)
    }

    pub async fn seed_default_account(
        &self,
        admin_email: &str,
        default_password: &str,
    ) -> Result<Account, Box<dyn std::error::Error>> {
        let email = admin_email.to_lowercase();
        let domain_name = email
            .split('@')
            .nth(1)
            .unwrap_or("localhost")
            .to_string();

        let domain = self.ensure_domain(&domain_name).await?;

        if let Some(existing) = self.get_account_by_email(&email).await? {
            return Ok(existing);
        }

        let password_hash = hash_password(default_password)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

        let username = email.split('@').next().unwrap_or("admin").to_string();
        let account = self
            .create_account(
                domain.id,
                &email,
                &username,
                &password_hash,
                "Administrator",
                10737418240,
            )
            .await?;

        Ok(account)
    }

    // =========================================================================
    // Virtual Alias & Recipient Resolution
    // =========================================================================

    pub async fn create_alias(
        &self,
        domain_id: Uuid,
        source_address: &str,
        target_account_id: Uuid,
    ) -> Result<Alias, sqlx::Error> {
        let clean_src = source_address.trim().to_lowercase();
        let alias = sqlx::query_as::<_, Alias>(
            r#"
            INSERT INTO aliases (domain_id, source_address, target_account_id)
            VALUES ($1, $2, $3)
            RETURNING *
            "#,
        )
        .bind(domain_id)
        .bind(&clean_src)
        .bind(target_account_id)
        .fetch_one(&self.pool)
        .await?;
        Ok(alias)
    }

    /// Resolves incoming address against:
    /// 1. Direct local account email
    /// 2. Exact alias (e.g. sales@domain.com)
    /// 3. Catch-all alias (e.g. @domain.com)
    pub async fn resolve_recipient(&self, address: &str) -> Result<Option<Account>, sqlx::Error> {
        let clean = address
            .trim()
            .trim_start_matches('<')
            .trim_end_matches('>')
            .to_lowercase();

        // 1. Direct match on accounts.email
        if let Some(acc) = self.get_account_by_email(&clean).await? {
            return Ok(Some(acc));
        }

        // 2. Exact match in aliases
        let direct_alias = sqlx::query_as::<_, Account>(
            r#"
            SELECT a.* FROM accounts a
            JOIN aliases al ON al.target_account_id = a.id
            WHERE LOWER(al.source_address) = LOWER($1) AND al.is_active = true
            LIMIT 1
            "#,
        )
        .bind(&clean)
        .fetch_optional(&self.pool)
        .await?;

        if direct_alias.is_some() {
            return Ok(direct_alias);
        }

        // 3. Catch-all match in aliases (@domain.com)
        if let Some(domain_part) = clean.split('@').nth(1) {
            let catch_all_pattern = format!("@{}", domain_part);
            let catch_all = sqlx::query_as::<_, Account>(
                r#"
                SELECT a.* FROM accounts a
                JOIN aliases al ON al.target_account_id = a.id
                WHERE LOWER(al.source_address) = LOWER($1) AND al.is_active = true
                LIMIT 1
                "#,
            )
            .bind(&catch_all_pattern)
            .fetch_optional(&self.pool)
            .await?;

            if catch_all.is_some() {
                return Ok(catch_all);
            }
        }

        Ok(None)
    }

    // =========================================================================
    // Mailbox Operations
    // =========================================================================

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

    pub async fn get_mailbox_by_name(
        &self,
        account_id: Uuid,
        name: &str,
    ) -> Result<Option<Mailbox>, sqlx::Error> {
        sqlx::query_as::<_, Mailbox>(
            "SELECT * FROM mailboxes WHERE account_id = $1 AND LOWER(name) = LOWER($2)",
        )
        .bind(account_id)
        .bind(name.trim())
        .fetch_optional(&self.pool)
        .await
    }

    pub async fn create_mailbox(
        &self,
        account_id: Uuid,
        name: &str,
        role: Option<&str>,
    ) -> Result<Mailbox, sqlx::Error> {
        let now_sec = Utc::now().timestamp() as i32;
        let mb = sqlx::query_as::<_, Mailbox>(
            r#"
            INSERT INTO mailboxes (account_id, name, role, sort_order, uid_validity, next_uid, highest_modseq)
            VALUES ($1, $2, $3, 10, $4, 1, 1)
            RETURNING *
            "#,
        )
        .bind(account_id)
        .bind(name.trim())
        .bind(role)
        .bind(now_sec)
        .fetch_one(&self.pool)
        .await?;
        Ok(mb)
    }

    // =========================================================================
    // Content-Addressed Blob Storage Metadata
    // =========================================================================

    pub async fn reserve_blob(
        &self,
        sha256: &str,
        compressed_size: i64,
        uncompressed_size: i64,
        algorithm: &str,
    ) -> Result<bool, sqlx::Error> {
        let row: (bool,) = sqlx::query_as(
            r#"
            INSERT INTO message_blobs (sha256, compressed_size_bytes, uncompressed_size_bytes, compression_algorithm, ref_count, status)
            VALUES ($1, $2, $3, $4, 1, 'active')
            ON CONFLICT (sha256) DO UPDATE
            SET ref_count = message_blobs.ref_count + 1, status = 'active'
            RETURNING (xmax = 0) AS is_new
            "#,
        )
        .bind(sha256)
        .bind(compressed_size)
        .bind(uncompressed_size)
        .bind(algorithm)
        .fetch_one(&self.pool)
        .await?;

        Ok(row.0)
    }

    pub async fn release_blob(&self, sha256: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE message_blobs SET ref_count = ref_count - 1 WHERE sha256 = $1;
            UPDATE message_blobs SET status = 'pending_purge', purge_after = NOW() + INTERVAL '48 hours'
            WHERE sha256 = $1 AND ref_count <= 0;
            "#,
        )
        .bind(sha256)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    // =========================================================================
    // Message & Junction Operations (JWZ Threading & IMAP UIDs)
    // =========================================================================

    /// Finds parent thread ID by traversing References or In-Reply-To
    pub async fn resolve_thread_id(
        &self,
        account_id: Uuid,
        in_reply_to: &str,
        references: &[String],
    ) -> Uuid {
        // 1. Try In-Reply-To
        if !in_reply_to.is_empty() {
            let row: Option<(Uuid,)> = sqlx::query_as(
                "SELECT thread_id FROM messages WHERE account_id = $1 AND rfc822_message_id = $2 LIMIT 1",
            )
            .bind(account_id)
            .bind(in_reply_to.trim())
            .fetch_optional(&self.pool)
            .await
            .ok()
            .flatten();

            if let Some((tid,)) = row {
                return tid;
            }
        }

        // 2. Try References (from newest to oldest)
        for r in references.iter().rev() {
            let row: Option<(Uuid,)> = sqlx::query_as(
                "SELECT thread_id FROM messages WHERE account_id = $1 AND rfc822_message_id = $2 LIMIT 1",
            )
            .bind(account_id)
            .bind(r.trim())
            .fetch_optional(&self.pool)
            .await
            .ok()
            .flatten();

            if let Some((tid,)) = row {
                return tid;
            }
        }

        // 3. Fallback: New Thread
        Uuid::new_v4()
    }

    /// Looks up whether an email with the specified RFC822 Message-ID already exists in a given mailbox
    pub async fn find_message_uid_by_rfc822_id(
        &self,
        account_id: Uuid,
        mailbox_id: Uuid,
        rfc822_message_id: &str,
    ) -> Result<Option<i32>, sqlx::Error> {
        let clean_id = rfc822_message_id.trim();
        if clean_id.is_empty() {
            return Ok(None);
        }

        let row: Option<(i32,)> = sqlx::query_as(
            r#"
            SELECT mm.uid
            FROM messages m
            JOIN message_mailboxes mm ON m.id = mm.message_id
            WHERE m.account_id = $1 AND mm.mailbox_id = $2 AND m.rfc822_message_id = $3
            LIMIT 1
            "#,
        )
        .bind(account_id)
        .bind(mailbox_id)
        .bind(clean_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|r| r.0))
    }

    /// Atomically inserts message metadata and message_mailboxes junction row
    pub async fn insert_message_with_junction(
        &self,
        msg: NewIncomingMessage,
    ) -> Result<(Message, MessageMailbox), sqlx::Error> {
        let mut tx: Transaction<'_, Postgres> = self.pool.begin().await?;

        // 1. Determine canonical thread ID
        let thread_id = self
            .resolve_thread_id(msg.account_id, &msg.in_reply_to, &msg.references)
            .await;

        // 2. Lock target mailbox and retrieve next UID & modseq
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

        // 3. Insert canonical message
        let inserted_msg = sqlx::query_as::<_, Message>(
            r#"
            INSERT INTO messages (
                account_id, blob_id, thread_id, rfc822_message_id, in_reply_to,
                subject, from_address, from_name, to_addresses, cc_addresses, bcc_addresses,
                reply_to, date, size_bytes, snippet, has_attachments
            )
            VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8, $9, $10, $11,
                $12, $13, $14, $15, $16
            )
            RETURNING *
            "#,
        )
        .bind(msg.account_id)
        .bind(&msg.blob_id)
        .bind(thread_id)
        .bind(&msg.rfc822_message_id)
        .bind(&msg.in_reply_to)
        .bind(&msg.subject)
        .bind(&msg.from_address)
        .bind(&msg.from_name)
        .bind(&msg.to_addresses)
        .bind(msg.cc_addresses.unwrap_or_default())
        .bind(msg.bcc_addresses.unwrap_or_default())
        .bind(msg.reply_to.unwrap_or_default())
        .bind(msg.date)
        .bind(msg.size_bytes)
        .bind(&msg.snippet)
        .bind(msg.has_attachments)
        .fetch_one(&mut *tx)
        .await?;

        // 4. Insert junction row
        let junction = sqlx::query_as::<_, MessageMailbox>(
            r#"
            INSERT INTO message_mailboxes (
                message_id, mailbox_id, uid, modseq, is_unread, is_flagged, is_draft, keywords
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
            "#,
        )
        .bind(inserted_msg.id)
        .bind(msg.mailbox_id)
        .bind(current_uid)
        .bind(new_modseq)
        .bind(msg.is_unread)
        .bind(msg.is_flagged)
        .bind(msg.is_draft)
        .bind(&msg.keywords)
        .fetch_one(&mut *tx)
        .await?;

        tx.commit().await?;

        Ok((inserted_msg, junction))
    }

    pub async fn list_messages_in_mailbox(
        &self,
        mailbox_id: Uuid,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<EnrichedMessage>, sqlx::Error> {
        sqlx::query_as::<_, EnrichedMessage>(
            r#"
            SELECT 
                m.id, m.account_id, mm.mailbox_id, m.blob_id, m.thread_id,
                mm.uid, mm.modseq, m.rfc822_message_id, m.in_reply_to,
                m.subject, m.from_address, m.from_name, m.to_addresses,
                m.cc_addresses, m.bcc_addresses, m.reply_to, m.date,
                m.size_bytes, m.snippet, m.has_attachments,
                mm.is_unread, mm.is_flagged, mm.is_draft, mm.is_answered,
                mm.is_deleted, mm.keywords, m.created_at
            FROM messages m
            JOIN message_mailboxes mm ON mm.message_id = m.id
            WHERE mm.mailbox_id = $1 AND mm.is_deleted = false
            ORDER BY m.date DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(mailbox_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
    }

    pub async fn list_messages_for_imap(
        &self,
        mailbox_id: Uuid,
        limit: i64,
    ) -> Result<Vec<EnrichedMessage>, sqlx::Error> {
        sqlx::query_as::<_, EnrichedMessage>(
            r#"
            SELECT 
                m.id, m.account_id, mm.mailbox_id, m.blob_id, m.thread_id,
                mm.uid, mm.modseq, m.rfc822_message_id, m.in_reply_to,
                m.subject, m.from_address, m.from_name, m.to_addresses,
                m.cc_addresses, m.bcc_addresses, m.reply_to, m.date,
                m.size_bytes, m.snippet, m.has_attachments,
                mm.is_unread, mm.is_flagged, mm.is_draft, mm.is_answered,
                mm.is_deleted, mm.keywords, m.created_at
            FROM messages m
            JOIN message_mailboxes mm ON mm.message_id = m.id
            WHERE mm.mailbox_id = $1 AND mm.is_deleted = false
            ORDER BY mm.uid ASC
            LIMIT $2
            "#,
        )
        .bind(mailbox_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await
    }

    pub async fn get_message_by_uid(
        &self,
        mailbox_id: Uuid,
        uid: i32,
    ) -> Result<Option<EnrichedMessage>, sqlx::Error> {
        sqlx::query_as::<_, EnrichedMessage>(
            r#"
            SELECT 
                m.id, m.account_id, mm.mailbox_id, m.blob_id, m.thread_id,
                mm.uid, mm.modseq, m.rfc822_message_id, m.in_reply_to,
                m.subject, m.from_address, m.from_name, m.to_addresses,
                m.cc_addresses, m.bcc_addresses, m.reply_to, m.date,
                m.size_bytes, m.snippet, m.has_attachments,
                mm.is_unread, mm.is_flagged, mm.is_draft, mm.is_answered,
                mm.is_deleted, mm.keywords, m.created_at
            FROM messages m
            JOIN message_mailboxes mm ON mm.message_id = m.id
            WHERE mm.mailbox_id = $1 AND mm.uid = $2
            LIMIT 1
            "#,
        )
        .bind(mailbox_id)
        .bind(uid)
        .fetch_optional(&self.pool)
        .await
    }

    pub async fn search_messages(
        &self,
        account_id: Uuid,
        search_query: &str,
        limit: i64,
    ) -> Result<Vec<EnrichedMessage>, sqlx::Error> {
        sqlx::query_as::<_, EnrichedMessage>(
            r#"
            SELECT 
                m.id, m.account_id, mm.mailbox_id, m.blob_id, m.thread_id,
                mm.uid, mm.modseq, m.rfc822_message_id, m.in_reply_to,
                m.subject, m.from_address, m.from_name, m.to_addresses,
                m.cc_addresses, m.bcc_addresses, m.reply_to, m.date,
                m.size_bytes, m.snippet, m.has_attachments,
                mm.is_unread, mm.is_flagged, mm.is_draft, mm.is_answered,
                mm.is_deleted, mm.keywords, m.created_at
            FROM messages m
            JOIN message_mailboxes mm ON mm.message_id = m.id
            WHERE m.account_id = $1 AND m.tsv @@ plainto_tsquery('english', unaccent($2))
            ORDER BY ts_rank(m.tsv, plainto_tsquery('english', unaccent($2))) DESC, m.date DESC
            LIMIT $3
            "#,
        )
        .bind(account_id)
        .bind(search_query.trim())
        .bind(limit)
        .fetch_all(&self.pool)
        .await
    }

    pub async fn update_message_flags(
        &self,
        mailbox_id: Uuid,
        uid: i32,
        flags: FlagUpdates,
    ) -> Result<Option<MessageMailbox>, sqlx::Error> {
        let mut tx = self.pool.begin().await?;

        // Bump highest_modseq
        let new_modseq: (i64,) = sqlx::query_as(
            "UPDATE mailboxes SET highest_modseq = highest_modseq + 1 WHERE id = $1 RETURNING highest_modseq",
        )
        .bind(mailbox_id)
        .fetch_one(&mut *tx)
        .await?;

        let updated = sqlx::query_as::<_, MessageMailbox>(
            r#"
            UPDATE message_mailboxes
            SET is_unread = COALESCE($1, is_unread),
                is_flagged = COALESCE($2, is_flagged),
                is_draft = COALESCE($3, is_draft),
                is_answered = COALESCE($4, is_answered),
                is_deleted = COALESCE($5, is_deleted),
                modseq = $6
            WHERE mailbox_id = $7 AND uid = $8
            RETURNING *
            "#,
        )
        .bind(flags.is_unread)
        .bind(flags.is_flagged)
        .bind(flags.is_draft)
        .bind(flags.is_answered)
        .bind(flags.is_deleted)
        .bind(new_modseq.0)
        .bind(mailbox_id)
        .bind(uid)
        .fetch_optional(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(updated)
    }

    pub async fn expunge_mailbox(&self, mailbox_id: Uuid) -> Result<Vec<i32>, sqlx::Error> {
        let mut tx = self.pool.begin().await?;

        let deleted_uids: Vec<(i32, String)> = sqlx::query_as(
            r#"
            DELETE FROM message_mailboxes mm
            USING messages m
            WHERE mm.message_id = m.id AND mm.mailbox_id = $1 AND mm.is_deleted = true
            RETURNING mm.uid, m.blob_id
            "#,
        )
        .bind(mailbox_id)
        .fetch_all(&mut *tx)
        .await?;

        for (_, blob_id) in &deleted_uids {
            let _ = sqlx::query(
                "UPDATE message_blobs SET ref_count = ref_count - 1 WHERE sha256 = $1",
            )
            .bind(blob_id)
            .execute(&mut *tx)
            .await;
        }

        tx.commit().await?;
        Ok(deleted_uids.into_iter().map(|(u, _)| u).collect())
    }

    pub async fn copy_or_move_message(
        &self,
        src_mailbox_id: Uuid,
        dest_mailbox_id: Uuid,
        uid: i32,
        is_move: bool,
    ) -> Result<Option<(i32, i32)>, sqlx::Error> {
        let mut tx = self.pool.begin().await?;

        // 1. Fetch source message
        let src_msg: Option<(Uuid,)> = sqlx::query_as(
            "SELECT message_id FROM message_mailboxes WHERE mailbox_id = $1 AND uid = $2",
        )
        .bind(src_mailbox_id)
        .bind(uid)
        .fetch_optional(&mut *tx)
        .await?;

        let message_id = match src_msg {
            Some((mid,)) => mid,
            None => return Ok(None),
        };

        // 2. Lock destination mailbox and increment UID & modseq
        let dest_mb: (i32, i64) = sqlx::query_as(
            "SELECT next_uid, highest_modseq FROM mailboxes WHERE id = $1 FOR UPDATE",
        )
        .bind(dest_mailbox_id)
        .fetch_one(&mut *tx)
        .await?;

        let dest_uid = dest_mb.0;
        let new_modseq = dest_mb.1 + 1;

        sqlx::query(
            "UPDATE mailboxes SET next_uid = next_uid + 1, highest_modseq = $1 WHERE id = $2",
        )
        .bind(new_modseq)
        .bind(dest_mailbox_id)
        .execute(&mut *tx)
        .await?;

        // 3. Insert into destination
        sqlx::query(
            r#"
            INSERT INTO message_mailboxes (message_id, mailbox_id, uid, modseq, is_unread, is_flagged)
            VALUES ($1, $2, $3, $4, false, false)
            ON CONFLICT (mailbox_id, message_id) DO UPDATE SET uid = $3, modseq = $4
            "#,
        )
        .bind(message_id)
        .bind(dest_mailbox_id)
        .bind(dest_uid)
        .bind(new_modseq)
        .execute(&mut *tx)
        .await?;

        // 4. If move, delete from source
        if is_move {
            sqlx::query(
                "DELETE FROM message_mailboxes WHERE mailbox_id = $1 AND message_id = $2",
            )
            .bind(src_mailbox_id)
            .bind(message_id)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(Some((uid, dest_uid)))
    }

    // =========================================================================
    // DKIM Key Management
    // =========================================================================

    pub async fn store_dkim_key(
        &self,
        domain_id: Uuid,
        selector: &str,
        private_key_pem: &str,
        algorithm: &str,
    ) -> Result<DkimKey, sqlx::Error> {
        let key = sqlx::query_as::<_, DkimKey>(
            r#"
            INSERT INTO dkim_keys (domain_id, selector, private_key_pem, algorithm)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (domain_id, selector) DO UPDATE
            SET private_key_pem = $3, algorithm = $4, is_active = true
            RETURNING *
            "#,
        )
        .bind(domain_id)
        .bind(selector)
        .bind(private_key_pem)
        .bind(algorithm)
        .fetch_one(&self.pool)
        .await?;
        Ok(key)
    }

    pub async fn get_dkim_key(
        &self,
        domain_name: &str,
        selector: &str,
    ) -> Result<Option<DkimKey>, sqlx::Error> {
        sqlx::query_as::<_, DkimKey>(
            r#"
            SELECT k.* FROM dkim_keys k
            JOIN domains d ON d.id = k.domain_id
            WHERE LOWER(d.name) = LOWER($1) AND k.selector = $2 AND k.is_active = true
            LIMIT 1
            "#,
        )
        .bind(domain_name.trim())
        .bind(selector)
        .fetch_optional(&self.pool)
        .await
    }

    // =========================================================================
    // Sieve & Vacation
    // =========================================================================

    pub async fn get_active_sieve_script(
        &self,
        account_id: Uuid,
    ) -> Result<Option<SieveScript>, sqlx::Error> {
        sqlx::query_as::<_, SieveScript>(
            "SELECT * FROM sieve_scripts WHERE account_id = $1 AND is_active = true LIMIT 1",
        )
        .bind(account_id)
        .fetch_optional(&self.pool)
        .await
    }

    pub async fn get_vacation_response(
        &self,
        account_id: Uuid,
    ) -> Result<Option<VacationResponse>, sqlx::Error> {
        sqlx::query_as::<_, VacationResponse>(
            "SELECT * FROM vacation_responses WHERE account_id = $1",
        )
        .bind(account_id)
        .fetch_optional(&self.pool)
        .await
    }

    pub async fn set_vacation_response(
        &self,
        account_id: Uuid,
        is_enabled: bool,
        subject: &str,
        text_body: &str,
    ) -> Result<VacationResponse, sqlx::Error> {
        let resp = sqlx::query_as::<_, VacationResponse>(
            r#"
            INSERT INTO vacation_responses (account_id, is_enabled, subject, text_body)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (account_id) DO UPDATE
            SET is_enabled = $2, subject = $3, text_body = $4, updated_at = NOW()
            RETURNING *
            "#,
        )
        .bind(account_id)
        .bind(is_enabled)
        .bind(subject)
        .bind(text_body)
        .fetch_one(&self.pool)
        .await?;
        Ok(resp)
    }
}
