use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use chrono::Utc;
use parking_lot::Mutex;
use rusqlite::{params, Connection, Result};
use std::fs;
use std::path::Path;
use std::sync::Arc;
use uuid::Uuid;

#[derive(Clone, Debug)]
pub struct User {
    pub id: String,
    pub domain_id: String,
    pub email: String,
    pub password_hash: String,
    pub created_at: String,
}

#[derive(Clone, Debug)]
pub struct Mailbox {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub role: String,
    pub unread_count: i64,
    pub total_count: i64,
}

#[derive(Clone, Debug)]
pub struct MessageRecord {
    pub id: String,
    pub user_id: String,
    pub mailbox_id: String,
    pub sender_name: String,
    pub sender_email: String,
    pub recipient_email: String,
    pub subject: String,
    pub snippet: String,
    pub body_text: String,
    pub body_html: String,
    pub blob_id: String,
    pub size: i64,
    pub is_unread: bool,
    pub is_starred: bool,
    pub received_at: String,
}

pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    pub fn new(db_path: &str) -> Result<Self> {
        if let Some(parent) = Path::new(db_path).parent() {
            fs::create_dir_all(parent).ok();
        }

        let conn = Connection::open(db_path)?;
        conn.execute_batch(
            "
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS domains (
                id TEXT PRIMARY KEY,
                name TEXT UNIQUE NOT NULL COLLATE NOCASE,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS dkim_keys (
                domain_id TEXT PRIMARY KEY REFERENCES domains(id) ON DELETE CASCADE,
                selector TEXT NOT NULL,
                private_key TEXT NOT NULL,
                public_key TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
                email TEXT UNIQUE NOT NULL COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS mailboxes (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                role TEXT NOT NULL COLLATE NOCASE,
                unread_count INTEGER DEFAULT 0,
                total_count INTEGER DEFAULT 0,
                UNIQUE(user_id, role)
            );

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                mailbox_id TEXT NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
                sender_name TEXT NOT NULL,
                sender_email TEXT NOT NULL COLLATE NOCASE,
                recipient_email TEXT NOT NULL COLLATE NOCASE,
                subject TEXT NOT NULL,
                snippet TEXT NOT NULL,
                body_text TEXT NOT NULL,
                body_html TEXT NOT NULL,
                blob_id TEXT NOT NULL,
                size INTEGER NOT NULL,
                is_unread BOOLEAN NOT NULL DEFAULT 1,
                is_starred BOOLEAN NOT NULL DEFAULT 0,
                received_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_messages_user_mailbox ON messages(user_id, mailbox_id, received_at DESC);
            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
            CREATE INDEX IF NOT EXISTS idx_domains_name ON domains(name);
            ",
        )?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    // -------------------------------------------------------------------------
    // Domains
    // -------------------------------------------------------------------------
    pub fn get_or_create_domain(&self, name: &str) -> Result<String> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare("SELECT id FROM domains WHERE name = ?1")?;
        let mut rows = stmt.query(params![name])?;
        if let Some(row) = rows.next()? {
            return Ok(row.get(0)?);
        }
        drop(rows);
        drop(stmt);

        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO domains (id, name, created_at) VALUES (?1, ?2, ?3)",
            params![id, name, now],
        )?;
        Ok(id)
    }

    pub fn list_domains(&self) -> Result<Vec<(String, String)>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare("SELECT id, name FROM domains ORDER BY name ASC")?;
        let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    // -------------------------------------------------------------------------
    // Users & Authentication
    // -------------------------------------------------------------------------
    pub fn create_user(&self, email: &str, password: &str) -> Result<String> {
        let domain_name = email.split('@').nth(1).unwrap_or("example.com");
        let domain_id = self.get_or_create_domain(domain_name)?;

        let salt = SaltString::generate(&mut OsRng);
        let argon2 = Argon2::default();
        let password_hash = argon2
            .hash_password(password.as_bytes(), &salt)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?
            .to_string();

        let user_id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO users (id, domain_id, email, password_hash, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![user_id, domain_id, email, password_hash, now],
        )?;

        // Automatically create default system mailboxes
        let standard_folders = [
            ("Inbox", "inbox"),
            ("Sent", "sent"),
            ("Drafts", "drafts"),
            ("Trash", "trash"),
            ("Spam", "spam"),
            ("Archive", "archive"),
        ];

        for (name, role) in standard_folders {
            let mbox_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO mailboxes (id, user_id, name, role, unread_count, total_count) VALUES (?1, ?2, ?3, ?4, 0, 0)",
                params![mbox_id, user_id, name, role],
            )?;
        }

        Ok(user_id)
    }

    pub fn verify_user(&self, email: &str, password: &str) -> Option<User> {
        let user = self.get_user_by_email(email)?;
        let parsed_hash = PasswordHash::new(&user.password_hash).ok()?;
        if Argon2::default()
            .verify_password(password.as_bytes(), &parsed_hash)
            .is_ok()
        {
            Some(user)
        } else {
            None
        }
    }

    pub fn get_user_by_email(&self, email: &str) -> Option<User> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare("SELECT id, domain_id, email, password_hash, created_at FROM users WHERE email = ?1")
            .ok()?;
        let mut rows = stmt.query(params![email]).ok()?;
        if let Some(row) = rows.next().ok()? {
            Some(User {
                id: row.get(0).ok()?,
                domain_id: row.get(1).ok()?,
                email: row.get(2).ok()?,
                password_hash: row.get(3).ok()?,
                created_at: row.get(4).ok()?,
            })
        } else {
            None
        }
    }

    pub fn user_exists(&self, email: &str) -> bool {
        let conn = self.conn.lock();
        let mut stmt = match conn.prepare("SELECT 1 FROM users WHERE email = ?1") {
            Ok(s) => s,
            Err(_) => return false,
        };
        matches!(stmt.exists(params![email]), Ok(true))
    }

    pub fn list_users(&self) -> Result<Vec<(String, String)>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare("SELECT id, email FROM users ORDER BY email ASC")?;
        let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    // -------------------------------------------------------------------------
    // Mailboxes
    // -------------------------------------------------------------------------
    pub fn get_user_mailboxes(&self, user_id: &str) -> Result<Vec<Mailbox>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, user_id, name, role, unread_count, total_count FROM mailboxes WHERE user_id = ?1 ORDER BY role = 'inbox' DESC, name ASC",
        )?;
        let rows = stmt.query_map(params![user_id], |row| {
            Ok(Mailbox {
                id: row.get(0)?,
                user_id: row.get(1)?,
                name: row.get(2)?,
                role: row.get(3)?,
                unread_count: row.get(4)?,
                total_count: row.get(5)?,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn get_mailbox_by_role(&self, user_id: &str, role: &str) -> Option<Mailbox> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare("SELECT id, user_id, name, role, unread_count, total_count FROM mailboxes WHERE user_id = ?1 AND role = ?2")
            .ok()?;
        let mut rows = stmt.query(params![user_id, role]).ok()?;
        if let Some(row) = rows.next().ok()? {
            Some(Mailbox {
                id: row.get(0).ok()?,
                user_id: row.get(1).ok()?,
                name: row.get(2).ok()?,
                role: row.get(3).ok()?,
                unread_count: row.get(4).ok()?,
                total_count: row.get(5).ok()?,
            })
        } else {
            None
        }
    }

    // -------------------------------------------------------------------------
    // Messages
    // -------------------------------------------------------------------------
    pub fn insert_message(&self, msg: &MessageRecord) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO messages (
                id, user_id, mailbox_id, sender_name, sender_email, recipient_email,
                subject, snippet, body_text, body_html, blob_id, size, is_unread, is_starred, received_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![
                msg.id,
                msg.user_id,
                msg.mailbox_id,
                msg.sender_name,
                msg.sender_email,
                msg.recipient_email,
                msg.subject,
                msg.snippet,
                msg.body_text,
                msg.body_html,
                msg.blob_id,
                msg.size,
                msg.is_unread,
                msg.is_starred,
                msg.received_at,
            ],
        )?;

        // Update counts on mailbox
        let unread_delta = if msg.is_unread { 1 } else { 0 };
        conn.execute(
            "UPDATE mailboxes SET total_count = total_count + 1, unread_count = unread_count + ?1 WHERE id = ?2",
            params![unread_delta, msg.mailbox_id],
        )?;

        Ok(())
    }

    pub fn get_messages(
        &self,
        user_id: &str,
        mailbox_id: Option<&str>,
        search_query: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> Result<(Vec<MessageRecord>, i64)> {
        let conn = self.conn.lock();
        let query = format!(
            "SELECT id, user_id, mailbox_id, sender_name, sender_email, recipient_email,
                    subject, snippet, body_text, body_html, blob_id, size, is_unread, is_starred, received_at
             FROM messages
             WHERE user_id = ?1
             {}
             {}
             ORDER BY received_at DESC
             LIMIT ?2 OFFSET ?3",
            if mailbox_id.is_some() { "AND mailbox_id = ?4" } else { "" },
            if search_query.is_some() { "AND (subject LIKE ?5 OR body_text LIKE ?5 OR sender_email LIKE ?5)" } else { "" },
        );

        let count_query = format!(
            "SELECT COUNT(*) FROM messages WHERE user_id = ?1 {} {}",
            if mailbox_id.is_some() { "AND mailbox_id = ?2" } else { "" },
            if search_query.is_some() { "AND (subject LIKE ?3 OR body_text LIKE ?3 OR sender_email LIKE ?3)" } else { "" },
        );

        let search_pattern = search_query.map(|q| format!("%{q}%"));

        // Execute count
        let total: i64 = match (mailbox_id, &search_pattern) {
            (Some(mb), Some(pattern)) => conn.query_row(&count_query, params![user_id, mb, pattern], |r| r.get(0))?,
            (Some(mb), None) => conn.query_row(&count_query, params![user_id, mb], |r| r.get(0))?,
            (None, Some(pattern)) => conn.query_row(&count_query, params![user_id, pattern], |r| r.get(0))?,
            (None, None) => conn.query_row(&count_query, params![user_id], |r| r.get(0))?,
        };

        // Execute data query
        let mut stmt = conn.prepare(&query)?;
        let rows = match (mailbox_id, &search_pattern) {
            (Some(mb), Some(pattern)) => stmt.query_map(params![user_id, limit, offset, mb, pattern], Self::map_message_row)?,
            (Some(mb), None) => stmt.query_map(params![user_id, limit, offset, mb], Self::map_message_row)?,
            (None, Some(pattern)) => stmt.query_map(params![user_id, limit, offset, pattern], Self::map_message_row)?,
            (None, None) => stmt.query_map(params![user_id, limit, offset], Self::map_message_row)?,
        };

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }

        Ok((list, total))
    }

    pub fn get_message_by_id(&self, user_id: &str, message_id: &str) -> Option<MessageRecord> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare(
                "SELECT id, user_id, mailbox_id, sender_name, sender_email, recipient_email,
                        subject, snippet, body_text, body_html, blob_id, size, is_unread, is_starred, received_at
                 FROM messages WHERE user_id = ?1 AND id = ?2",
            )
            .ok()?;
        let mut rows = stmt.query(params![user_id, message_id]).ok()?;
        if let Some(row) = rows.next().ok()? {
            Self::map_message_row(row).ok()
        } else {
            None
        }
    }

    pub fn update_message_properties(
        &self,
        user_id: &str,
        message_id: &str,
        is_seen: Option<bool>,
        is_flagged: Option<bool>,
        target_mailbox_id: Option<&str>,
    ) -> Result<()> {
        let conn = self.conn.lock();

        if let Some(seen) = is_seen {
            let is_unread = !seen;
            conn.execute(
                "UPDATE messages SET is_unread = ?1 WHERE user_id = ?2 AND id = ?3",
                params![is_unread, user_id, message_id],
            )?;
        }

        if let Some(flagged) = is_flagged {
            conn.execute(
                "UPDATE messages SET is_starred = ?1 WHERE user_id = ?2 AND id = ?3",
                params![flagged, user_id, message_id],
            )?;
        }

        if let Some(new_mb) = target_mailbox_id {
            conn.execute(
                "UPDATE messages SET mailbox_id = ?1 WHERE user_id = ?2 AND id = ?3",
                params![new_mb, user_id, message_id],
            )?;
        }

        Ok(())
    }

    pub fn delete_message(&self, user_id: &str, message_id: &str) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "DELETE FROM messages WHERE user_id = ?1 AND id = ?2",
            params![user_id, message_id],
        )?;
        Ok(())
    }

    fn map_message_row(row: &rusqlite::Row) -> Result<MessageRecord> {
        Ok(MessageRecord {
            id: row.get(0)?,
            user_id: row.get(1)?,
            mailbox_id: row.get(2)?,
            sender_name: row.get(3)?,
            sender_email: row.get(4)?,
            recipient_email: row.get(5)?,
            subject: row.get(6)?,
            snippet: row.get(7)?,
            body_text: row.get(8)?,
            body_html: row.get(9)?,
            blob_id: row.get(10)?,
            size: row.get(11)?,
            is_unread: row.get(12)?,
            is_starred: row.get(13)?,
            received_at: row.get(14)?,
        })
    }
}
