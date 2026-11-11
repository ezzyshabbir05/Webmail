use crate::auth::argon::verify_password;
use crate::db::{Account, MailRepository, Mailbox};
use crate::event_bus::{EventBus, MailboxEventType};
use crate::storage::BlobStorage;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tracing::debug;

pub struct ImapState {
    pub repo: MailRepository,
    pub storage: Arc<dyn BlobStorage>,
    pub event_bus: EventBus,
    pub hostname: String,
}

pub async fn handle_imap_session(
    stream: TcpStream,
    state: Arc<ImapState>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let (reader, mut writer) = stream.into_split();
    let mut lines = BufReader::new(reader).lines();

    // Initial IMAP greeting
    writer
        .write_all(b"* OK [CAPABILITY IMAP4rev2 IMAP4rev1 IDLE MOVE SPECIAL-USE] Postarc IMAP Service ready\r\n")
        .await?;

    let mut authenticated_account: Option<Account> = None;
    let mut selected_mailbox: Option<Mailbox> = None;

    while let Some(line) = lines.next_line().await? {
        let trimmed = line.trim();
        debug!("IMAP RECV: {}", trimmed);

        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        if parts.is_empty() {
            continue;
        }

        let tag = parts[0];
        let command = if parts.len() > 1 { parts[1].to_uppercase() } else { String::new() };

        match command.as_str() {
            "CAPABILITY" => {
                writer
                    .write_all(b"* CAPABILITY IMAP4rev2 IMAP4rev1 IDLE MOVE SPECIAL-USE\r\n")
                    .await?;
                writer
                    .write_all(format!("{} OK CAPABILITY completed\r\n", tag).as_bytes())
                    .await?;
            }
            "LOGIN" => {
                if parts.len() < 4 {
                    writer
                        .write_all(format!("{} BAD LOGIN requires user and password\r\n", tag).as_bytes())
                        .await?;
                    continue;
                }
                let user = clean_param(parts[2]);
                let pass = clean_param(parts[3]);

                match state.repo.get_account_by_email(&user).await {
                    Ok(Some(acc)) if verify_password(&pass, &acc.password_hash) => {
                        authenticated_account = Some(acc);
                        writer
                            .write_all(format!("{} OK [CAPABILITY IMAP4rev2] Logged in\r\n", tag).as_bytes())
                            .await?;
                    }
                    _ => {
                        writer
                            .write_all(format!("{} NO [AUTHENTICATIONFAILED] Invalid credentials\r\n", tag).as_bytes())
                            .await?;
                    }
                }
            }
            "LIST" => {
                let acc = match &authenticated_account {
                    Some(a) => a,
                    None => {
                        writer.write_all(format!("{} BAD Not authenticated\r\n", tag).as_bytes()).await?;
                        continue;
                    }
                };

                let mailboxes = state.repo.list_mailboxes(acc.id).await.unwrap_or_default();
                for mb in mailboxes {
                    let special_flag = match mb.role.as_deref() {
                        Some("inbox") => "\\Inbox",
                        Some("sent") => "\\Sent",
                        Some("drafts") => "\\Drafts",
                        Some("trash") => "\\Trash",
                        Some("spam") => "\\Junk",
                        Some("archive") => "\\Archive",
                        _ => "\\HasNoChildren",
                    };
                    writer
                        .write_all(format!("* LIST ({}) \"/\" \"{}\"\r\n", special_flag, mb.name).as_bytes())
                        .await?;
                }
                writer.write_all(format!("{} OK LIST completed\r\n", tag).as_bytes()).await?;
            }
            "SELECT" => {
                let acc = match &authenticated_account {
                    Some(a) => a,
                    None => {
                        writer.write_all(format!("{} BAD Not authenticated\r\n", tag).as_bytes()).await?;
                        continue;
                    }
                };

                let mb_name = if parts.len() > 2 { clean_param(parts[2]) } else { "Inbox".to_string() };
                let mailboxes = state.repo.list_mailboxes(acc.id).await.unwrap_or_default();
                let found = mailboxes
                    .into_iter()
                    .find(|m| m.name.eq_ignore_ascii_case(&mb_name) || (mb_name.eq_ignore_ascii_case("INBOX") && m.role.as_deref() == Some("inbox")));

                if let Some(mb) = found {
                    let messages = state.repo.list_messages(mb.id, 1000, 0).await.unwrap_or_default();
                    let count = messages.len();

                    let res = format!(
                        "* {} EXISTS\r\n* 0 RECENT\r\n* OK [UIDVALIDITY {}] UIDs valid\r\n* OK [UIDNEXT {}] Next UID\r\n* OK [HIGHESTMODSEQ {}] Highest\r\n* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)\r\n* OK [PERMANENTFLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft \\*)] Limited\r\n{} OK [READ-WRITE] SELECT completed\r\n",
                        count, mb.uid_validity, mb.next_uid, mb.highest_modseq, tag
                    );
                    writer.write_all(res.as_bytes()).await?;
                    selected_mailbox = Some(mb);
                } else {
                    writer
                        .write_all(format!("{} NO [NONEXISTENT] Mailbox does not exist\r\n", tag).as_bytes())
                        .await?;
                }
            }
            "FETCH" | "UID" => {
                let is_uid_cmd = command == "UID";
                let actual_cmd = if is_uid_cmd && parts.len() > 2 { parts[2].to_uppercase() } else { command.clone() };

                if actual_cmd == "FETCH" {
                    let mb = match &selected_mailbox {
                        Some(m) => m,
                        None => {
                            writer.write_all(format!("{} BAD No mailbox selected\r\n", tag).as_bytes()).await?;
                            continue;
                        }
                    };

                    let messages = state.repo.list_messages(mb.id, 50, 0).await.unwrap_or_default();

                    for (idx, msg) in messages.iter().enumerate() {
                        let seq = idx + 1;
                        let mut flags_str = String::new();
                        if !msg.is_unread {
                            flags_str.push_str("\\Seen ");
                        }
                        if msg.is_flagged {
                            flags_str.push_str("\\Flagged ");
                        }
                        if msg.is_draft {
                            flags_str.push_str("\\Draft ");
                        }
                        let flags_trimmed = flags_str.trim();

                        // Check if BODY[] was requested
                        let line_upper = trimmed.to_uppercase();
                        if line_upper.contains("BODY[]") || line_upper.contains("RFC822") {
                            if let Ok(body_bytes) = state.storage.get_blob(&msg.blob_id).await {
                                let body_header = format!(
                                    "* {} FETCH (UID {} FLAGS ({}) RFC822.SIZE {} BODY[] {{{}}}\r\n",
                                    seq, msg.uid, flags_trimmed, msg.size_bytes, body_bytes.len()
                                );
                                writer.write_all(body_header.as_bytes()).await?;
                                writer.write_all(&body_bytes).await?;
                                writer.write_all(b")\r\n").await?;
                                continue;
                            }
                        }

                        let fetch_resp = format!(
                            "* {} FETCH (UID {} FLAGS ({}) RFC822.SIZE {})\r\n",
                            seq, msg.uid, flags_trimmed, msg.size_bytes
                        );
                        writer.write_all(fetch_resp.as_bytes()).await?;
                    }

                    writer.write_all(format!("{} OK FETCH completed\r\n", tag).as_bytes()).await?;
                } else {
                    writer.write_all(format!("{} OK completed\r\n", tag).as_bytes()).await?;
                }
            }
            "IDLE" => {
                let mb = match &selected_mailbox {
                    Some(m) => m.clone(),
                    None => {
                        writer.write_all(format!("{} BAD No mailbox selected\r\n", tag).as_bytes()).await?;
                        continue;
                    }
                };

                // Advertise continuation
                writer.write_all(b"+ idling\r\n").await?;

                let mut rx = state.event_bus.subscribe();

                loop {
                    tokio::select! {
                        line_res = lines.next_line() => {
                            match line_res {
                                Ok(Some(client_line)) => {
                                    if client_line.trim().eq_ignore_ascii_case("DONE") {
                                        writer.write_all(format!("{} OK IDLE completed\r\n", tag).as_bytes()).await?;
                                        break;
                                    }
                                }
                                _ => break,
                            }
                        }
                        event_res = rx.recv() => {
                            if let Ok(evt) = event_res {
                                if evt.mailbox_id == mb.id {
                                    if evt.event_type == MailboxEventType::Created {
                                        // Broadcast unsolicited exists
                                        let current_count = state.repo.list_messages(mb.id, 1000, 0).await.map(|m| m.len()).unwrap_or(1);
                                        writer.write_all(format!("* {} EXISTS\r\n", current_count).as_bytes()).await?;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            "NOOP" => {
                writer.write_all(format!("{} OK NOOP completed\r\n", tag).as_bytes()).await?;
            }
            "LOGOUT" => {
                writer.write_all(b"* BYE Postarc server logging out\r\n").await?;
                writer.write_all(format!("{} OK LOGOUT completed\r\n", tag).as_bytes()).await?;
                break;
            }
            _ => {
                writer.write_all(format!("{} OK completed\r\n", tag).as_bytes()).await?;
            }
        }
    }

    Ok(())
}

fn clean_param(p: &str) -> String {
    p.trim_matches('"').to_string()
}
