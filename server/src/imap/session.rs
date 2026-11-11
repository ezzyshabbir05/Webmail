use crate::auth::argon::verify_password;
use crate::db::{Account, FlagUpdates, MailRepository, Mailbox};
use crate::event_bus::{EventBus, MailboxEventType};
use crate::storage::BlobStorage;
use crate::tls::TlsManager;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader};
use tracing::debug;

#[allow(dead_code)]
pub struct ImapState {
    pub repo: MailRepository,
    pub storage: Arc<dyn BlobStorage>,
    pub event_bus: EventBus,
    pub tls_manager: TlsManager,
    pub hostname: String,
}

pub async fn handle_imap_session<S>(
    stream: S,
    state: Arc<ImapState>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>>
where
    S: AsyncRead + AsyncWrite + Unpin + Send + 'static,
{
    let (reader, mut writer) = tokio::io::split(stream);
    let mut lines = BufReader::new(reader).lines();

    // Initial IMAP greeting
    writer
        .write_all(b"* OK [CAPABILITY IMAP4rev2 IMAP4rev1 IDLE MOVE SPECIAL-USE NAMESPACE] Postarc IMAP Service ready\r\n")
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
                    .write_all(b"* CAPABILITY IMAP4rev2 IMAP4rev1 IDLE MOVE SPECIAL-USE NAMESPACE\r\n")
                    .await?;
                writer
                    .write_all(format!("{} OK CAPABILITY completed\r\n", tag).as_bytes())
                    .await?;
            }
            "NAMESPACE" => {
                writer
                    .write_all(b"* NAMESPACE ((\"\" \"/\")) NIL NIL\r\n")
                    .await?;
                writer
                    .write_all(format!("{} OK NAMESPACE completed\r\n", tag).as_bytes())
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
            "STATUS" => {
                let acc = match &authenticated_account {
                    Some(a) => a,
                    None => {
                        writer.write_all(format!("{} BAD Not authenticated\r\n", tag).as_bytes()).await?;
                        continue;
                    }
                };

                let mb_name = if parts.len() > 2 { clean_param(parts[2]) } else { "INBOX".to_string() };
                let mailboxes = state.repo.list_mailboxes(acc.id).await.unwrap_or_default();
                let found = mailboxes
                    .into_iter()
                    .find(|m| m.name.eq_ignore_ascii_case(&mb_name) || (mb_name.eq_ignore_ascii_case("INBOX") && m.role.as_deref() == Some("inbox")));

                if let Some(mb) = found {
                    let messages = state.repo.list_messages_for_imap(mb.id, 50000).await.unwrap_or_default();
                    let unseen_count = messages.iter().filter(|m| m.is_unread).count();
                    writer
                        .write_all(format!(
                            "* STATUS \"{}\" (MESSAGES {} UNSEEN {} UIDNEXT {} UIDVALIDITY {} HIGHESTMODSEQ {})\r\n",
                            mb.name, messages.len(), unseen_count, mb.next_uid, mb.uid_validity, mb.highest_modseq
                        ).as_bytes())
                        .await?;
                    writer.write_all(format!("{} OK STATUS completed\r\n", tag).as_bytes()).await?;
                } else {
                    writer.write_all(format!("{} NO [NONEXISTENT] Mailbox not found\r\n", tag).as_bytes()).await?;
                }
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
                    let messages = state.repo.list_messages_for_imap(mb.id, 50000).await.unwrap_or_default();
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

                let mb = match &selected_mailbox {
                    Some(m) => m,
                    None => {
                        writer.write_all(format!("{} BAD No mailbox selected\r\n", tag).as_bytes()).await?;
                        continue;
                    }
                };

                if actual_cmd == "FETCH" {
                    let range_str = if is_uid_cmd {
                        parts.get(3).unwrap_or(&"1:*")
                    } else {
                        parts.get(2).unwrap_or(&"1:*")
                    };

                    let messages = state.repo.list_messages_for_imap(mb.id, 50000).await.unwrap_or_default();
                    let max_uid = messages.last().map(|m| m.uid).unwrap_or(0);
                    let total_count = messages.len() as i32;

                    let line_upper = trimmed.to_uppercase();
                    let wants_body = line_upper.contains("BODY") || line_upper.contains("RFC822");

                    for (idx, msg) in messages.iter().enumerate() {
                        let seq = (idx + 1) as i32;
                        let in_range = if is_uid_cmd {
                            matches_range(msg.uid, max_uid, range_str)
                        } else {
                            matches_range(seq, total_count, range_str)
                        };

                        if !in_range {
                            continue;
                        }

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
                        if msg.is_deleted {
                            flags_str.push_str("\\Deleted ");
                        }
                        if msg.is_answered {
                            flags_str.push_str("\\Answered ");
                        }
                        let flags_trimmed = flags_str.trim();

                        if wants_body {
                            if let Ok(body_bytes) = state.storage.get_blob(&msg.blob_id).await {
                                let body_header = format!(
                                    "* {} FETCH (UID {} FLAGS ({}) RFC822.SIZE {} BODY[] {{{}}}\r\n",
                                    seq, msg.uid, flags_trimmed, msg.size_bytes, body_bytes.len()
                                );
                                writer.write_all(body_header.as_bytes()).await?;
                                writer.write_all(&body_bytes).await?;
                                writer.write_all(b")\r\n").await?;

                                if !line_upper.contains(".PEEK") && msg.is_unread {
                                    let mut fu = FlagUpdates::default();
                                    fu.is_unread = Some(false);
                                    let _ = state.repo.update_message_flags(mb.id, msg.uid, fu).await;
                                }
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
                } else if actual_cmd == "STORE" {
                    // UID STORE <range> +/-FLAGS (\Seen)
                    let flags_arg = trimmed.to_uppercase();
                    let mut flag_updates = FlagUpdates::default();
                    if flags_arg.contains("\\SEEN") {
                        flag_updates.is_unread = Some(false);
                    }
                    if flags_arg.contains("\\FLAGGED") {
                        flag_updates.is_flagged = Some(true);
                    }
                    if flags_arg.contains("\\DELETED") {
                        flag_updates.is_deleted = Some(true);
                    }

                    let range_arg = if is_uid_cmd {
                        parts.get(3).unwrap_or(&"")
                    } else {
                        parts.get(2).unwrap_or(&"")
                    };

                    let messages = state.repo.list_messages_for_imap(mb.id, 50000).await.unwrap_or_default();
                    let max_uid = messages.last().map(|m| m.uid).unwrap_or(0);
                    let total_count = messages.len() as i32;

                    for (idx, msg) in messages.iter().enumerate() {
                        let seq = (idx + 1) as i32;
                        let in_range = if is_uid_cmd {
                            matches_range(msg.uid, max_uid, range_arg)
                        } else {
                            matches_range(seq, total_count, range_arg)
                        };
                        if in_range {
                            let _ = state.repo.update_message_flags(mb.id, msg.uid, flag_updates.clone()).await;
                        }
                    }
                    writer.write_all(format!("{} OK STORE completed\r\n", tag).as_bytes()).await?;
                } else if actual_cmd == "COPY" || actual_cmd == "MOVE" {
                    let is_move = actual_cmd == "MOVE";
                    let target_mb_name = parts.last().unwrap_or(&"");
                    let clean_target = clean_param(target_mb_name);

                    let acc = authenticated_account.as_ref().unwrap();
                    let mailboxes = state.repo.list_mailboxes(acc.id).await.unwrap_or_default();
                    if let Some(dest_mb) = mailboxes.into_iter().find(|m| m.name.eq_ignore_ascii_case(&clean_target)) {
                        if is_uid_cmd && parts.len() > 3 {
                            if let Ok(target_uid) = parts[3].parse::<i32>() {
                                let _ = state.repo.copy_or_move_message(mb.id, dest_mb.id, target_uid, is_move).await;
                            }
                        }
                        writer.write_all(format!("{} OK {} completed\r\n", tag, actual_cmd).as_bytes()).await?;
                    } else {
                        writer.write_all(format!("{} NO [NONEXISTENT] Destination not found\r\n", tag).as_bytes()).await?;
                    }
                } else if actual_cmd == "EXPUNGE" {
                    if let Ok(expunged_uids) = state.repo.expunge_mailbox(mb.id).await {
                        for uid in expunged_uids {
                            writer.write_all(format!("* {} EXPUNGE\r\n", uid).as_bytes()).await?;
                        }
                    }
                    writer.write_all(format!("{} OK EXPUNGE completed\r\n", tag).as_bytes()).await?;
                } else if actual_cmd == "SEARCH" {
                    let messages = state.repo.list_messages_for_imap(mb.id, 50000).await.unwrap_or_default();
                    let mut matched_ids = Vec::new();
                    let upper_line = trimmed.to_uppercase();

                    for (idx, msg) in messages.iter().enumerate() {
                        let id = if is_uid_cmd { msg.uid } else { (idx + 1) as i32 };
                        if upper_line.contains("UNSEEN") {
                            if msg.is_unread { matched_ids.push(id); }
                        } else if upper_line.contains("SEEN") {
                            if !msg.is_unread { matched_ids.push(id); }
                        } else if upper_line.contains("FLAGGED") {
                            if msg.is_flagged { matched_ids.push(id); }
                        } else {
                            matched_ids.push(id);
                        }
                    }

                    let search_res = matched_ids.into_iter().map(|i| i.to_string()).collect::<Vec<_>>().join(" ");
                    writer.write_all(format!("* SEARCH {}\r\n", search_res).as_bytes()).await?;
                    writer.write_all(format!("{} OK SEARCH completed\r\n", tag).as_bytes()).await?;
                } else {
                    writer.write_all(format!("{} OK completed\r\n", tag).as_bytes()).await?;
                }
            }
            "EXPUNGE" => {
                let mb = match &selected_mailbox {
                    Some(m) => m,
                    None => {
                        writer.write_all(format!("{} BAD No mailbox selected\r\n", tag).as_bytes()).await?;
                        continue;
                    }
                };

                if let Ok(expunged_uids) = state.repo.expunge_mailbox(mb.id).await {
                    for uid in expunged_uids {
                        writer.write_all(format!("* {} EXPUNGE\r\n", uid).as_bytes()).await?;
                    }
                }
                writer.write_all(format!("{} OK EXPUNGE completed\r\n", tag).as_bytes()).await?;
            }
            "IDLE" => {
                let mb = match &selected_mailbox {
                    Some(m) => m.clone(),
                    None => {
                        writer.write_all(format!("{} BAD No mailbox selected\r\n", tag).as_bytes()).await?;
                        continue;
                    }
                };

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
                                        let current_count = state.repo.list_messages_for_imap(mb.id, 50000).await.map(|m| m.len()).unwrap_or(1);
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

fn matches_range(val: i32, max_val: i32, range_spec: &str) -> bool {
    let clean = range_spec.trim();
    if clean.is_empty() || clean == "*" || clean == "1:*" {
        return true;
    }
    for sub in clean.split(',') {
        let sub = sub.trim();
        if sub == "*" {
            if val == max_val {
                return true;
            }
        } else if let Some((start_s, end_s)) = sub.split_once(':') {
            let start = start_s.trim().parse::<i32>().unwrap_or(1);
            let end = if end_s.trim() == "*" {
                max_val
            } else {
                end_s.trim().parse::<i32>().unwrap_or(max_val)
            };
            let (min, max) = if start <= end { (start, end) } else { (end, start) };
            if val >= min && val <= max {
                return true;
            }
        } else if let Ok(target) = sub.parse::<i32>() {
            if val == target {
                return true;
            }
        }
    }
    false
}
