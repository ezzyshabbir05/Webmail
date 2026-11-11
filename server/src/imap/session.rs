use crate::auth::argon::verify_password;
use crate::db::{Account, FlagUpdates, MailRepository, Mailbox, NewIncomingMessage};
use crate::event_bus::{EventBus, MailboxEvent, MailboxEventType};
use crate::storage::BlobStorage;
use crate::tls::TlsManager;
use mail_parser::MessageParser;
use sha2::{Digest, Sha256};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, BufReader};
use tracing::{debug, error, info};
use uuid::Uuid;

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
        .write_all(b"* OK [CAPABILITY IMAP4rev2 IMAP4rev1 IDLE MOVE SPECIAL-USE NAMESPACE UIDPLUS] Postarc IMAP Service ready\r\n")
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
                    .write_all(b"* CAPABILITY IMAP4rev2 IMAP4rev1 IDLE MOVE SPECIAL-USE NAMESPACE UIDPLUS\r\n")
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
                            .write_all(format!("{} OK [CAPABILITY IMAP4rev2 IMAP4rev1 IDLE MOVE SPECIAL-USE NAMESPACE UIDPLUS] Logged in\r\n", tag).as_bytes())
                            .await?;
                    }
                    _ => {
                        writer
                            .write_all(format!("{} NO [AUTHENTICATIONFAILED] Invalid credentials\r\n", tag).as_bytes())
                            .await?;
                    }
                }
            }
            "LIST" | "LSUB" => {
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
                        .write_all(format!("* {} ({}) \"/\" \"{}\"\r\n", command, special_flag, mb.name).as_bytes())
                        .await?;
                }
                writer.write_all(format!("{} OK {} completed\r\n", tag, command).as_bytes()).await?;
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
            "SELECT" | "EXAMINE" => {
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

                    let mode = if command == "EXAMINE" { "READ-ONLY" } else { "READ-WRITE" };
                    let res = format!(
                        "* {} EXISTS\r\n* 0 RECENT\r\n* OK [UIDVALIDITY {}] UIDs valid\r\n* OK [UIDNEXT {}] Next UID\r\n* OK [HIGHESTMODSEQ {}] Highest\r\n* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)\r\n* OK [PERMANENTFLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft \\*)] Limited\r\n{} OK [{}] {} completed\r\n",
                        count, mb.uid_validity, mb.next_uid, mb.highest_modseq, tag, mode, command
                    );
                    writer.write_all(res.as_bytes()).await?;
                    selected_mailbox = Some(mb);
                } else {
                    writer
                        .write_all(format!("{} NO [NONEXISTENT] Mailbox does not exist\r\n", tag).as_bytes())
                        .await?;
                }
            }
            "FETCH" | "UID" | "SEARCH" => {
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
                    let wants_full_body = line_upper.contains("BODY[]")
                        || line_upper.contains("BODY.PEEK[]")
                        || line_upper.contains("RFC822 ")
                        || line_upper.ends_with("RFC822)")
                        || line_upper.ends_with("RFC822");
                    let wants_headers = line_upper.contains("HEADER");

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
                        let internal_date = msg.date.format("%d-%b-%Y %H:%M:%S +0000").to_string();

                        if wants_full_body {
                            if let Ok(body_bytes) = state.storage.get_blob(&msg.blob_id).await {
                                let body_header = format!(
                                    "* {} FETCH (UID {} FLAGS ({}) RFC822.SIZE {} INTERNALDATE \"{}\" BODY[] {{{}}}\r\n",
                                    seq, msg.uid, flags_trimmed, msg.size_bytes, internal_date, body_bytes.len()
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
                        } else if wants_headers {
                            if let Ok(body_bytes) = state.storage.get_blob(&msg.blob_id).await {
                                let header_end = if let Some(pos) = body_bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                                    pos + 4
                                } else if let Some(pos) = body_bytes.windows(2).position(|w| w == b"\n\n") {
                                    pos + 2
                                } else {
                                    body_bytes.len()
                                };
                                let header_slice = &body_bytes[..header_end];

                                let body_sec_tag = if let Some(start) = trimmed.find("BODY") {
                                    if let Some(open) = trimmed[start..].find('[') {
                                        if let Some(close) = trimmed[start + open..].find(']') {
                                            let inside = &trimmed[start + open..start + open + close + 1];
                                            format!("BODY{}", inside)
                                        } else {
                                            "BODY[HEADER]".to_string()
                                        }
                                    } else {
                                        "BODY[HEADER]".to_string()
                                    }
                                } else {
                                    "BODY[HEADER]".to_string()
                                };

                                let body_header = format!(
                                    "* {} FETCH (UID {} FLAGS ({}) RFC822.SIZE {} INTERNALDATE \"{}\" {} {{{}}}\r\n",
                                    seq, msg.uid, flags_trimmed, msg.size_bytes, internal_date, body_sec_tag, header_slice.len()
                                );
                                writer.write_all(body_header.as_bytes()).await?;
                                writer.write_all(header_slice).await?;
                                writer.write_all(b")\r\n").await?;
                                continue;
                            }
                        }

                        let fetch_resp = format!(
                            "* {} FETCH (UID {} FLAGS ({}) RFC822.SIZE {} INTERNALDATE \"{}\")\r\n",
                            seq, msg.uid, flags_trimmed, msg.size_bytes, internal_date
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
            "APPEND" => {
                let acc = match &authenticated_account {
                    Some(a) => a.clone(),
                    None => {
                        writer.write_all(format!("{} BAD Not authenticated\r\n", tag).as_bytes()).await?;
                        continue;
                    }
                };

                let Some(brace_open) = trimmed.rfind('{') else {
                    writer.write_all(format!("{} BAD APPEND requires literal message data\r\n", tag).as_bytes()).await?;
                    continue;
                };
                let Some(brace_close) = trimmed.rfind('}') else {
                    writer.write_all(format!("{} BAD Malformed literal size\r\n", tag).as_bytes()).await?;
                    continue;
                };
                if brace_close <= brace_open {
                    writer.write_all(format!("{} BAD Malformed literal size\r\n", tag).as_bytes()).await?;
                    continue;
                }
                let size_str = &trimmed[brace_open + 1..brace_close];
                let literal_size = match size_str.parse::<usize>() {
                    Ok(s) => s,
                    Err(_) => {
                        writer.write_all(format!("{} BAD Invalid literal size\r\n", tag).as_bytes()).await?;
                        continue;
                    }
                };

                if literal_size > 50 * 1024 * 1024 {
                    writer.write_all(format!("{} NO [TOOBIG] Message exceeds 50MB maximum size\r\n", tag).as_bytes()).await?;
                    continue;
                }

                // Extract mailbox name and optional flags from prefix
                let prefix = trimmed[..brace_open].trim();
                let rest = prefix.strip_prefix(tag).unwrap_or(prefix).trim();
                let rest = if rest.to_uppercase().starts_with("APPEND") {
                    rest[6..].trim()
                } else {
                    rest
                };

                let (mb_token, after_mb) = if rest.starts_with('"') {
                    if let Some(end_quote) = rest[1..].find('"') {
                        (&rest[1..1 + end_quote], rest[1 + end_quote + 1..].trim())
                    } else {
                        (rest.trim_matches('"'), "")
                    }
                } else {
                    let mut s = rest.splitn(2, char::is_whitespace);
                    (s.next().unwrap_or(""), s.next().unwrap_or("").trim())
                };

                let mb_name = clean_param(mb_token);

                let mut is_unread = true;
                let mut is_flagged = false;
                let mut is_draft = false;
                let mut keywords = Vec::new();

                if let (Some(f_start), Some(f_end)) = (after_mb.find('('), after_mb.find(')')) {
                    if f_end > f_start {
                        let flags_str = &after_mb[f_start + 1..f_end];
                        for f in flags_str.split_whitespace() {
                            let f_upper = f.to_uppercase();
                            if f_upper.contains("SEEN") {
                                is_unread = false;
                                keywords.push("$seen".to_string());
                            }
                            if f_upper.contains("FLAGGED") {
                                is_flagged = true;
                                keywords.push("$flagged".to_string());
                            }
                            if f_upper.contains("DRAFT") {
                                is_draft = true;
                                keywords.push("$draft".to_string());
                            }
                            if f_upper.contains("ANSWERED") {
                                keywords.push("$answered".to_string());
                            }
                            if f_upper.contains("DELETED") {
                                keywords.push("$deleted".to_string());
                            }
                        }
                    }
                }

                // Look up target mailbox
                let mailboxes = state.repo.list_mailboxes(acc.id).await.unwrap_or_default();
                let found_mb = mailboxes.into_iter().find(|m| {
                    m.name.eq_ignore_ascii_case(&mb_name)
                        || (mb_name.eq_ignore_ascii_case("INBOX") && m.role.as_deref() == Some("inbox"))
                        || (mb_name.eq_ignore_ascii_case("Sent") && m.role.as_deref() == Some("sent"))
                        || (mb_name.eq_ignore_ascii_case("Drafts") && m.role.as_deref() == Some("drafts"))
                        || (mb_name.eq_ignore_ascii_case("Trash") && m.role.as_deref() == Some("trash"))
                        || (mb_name.eq_ignore_ascii_case("Spam") && m.role.as_deref() == Some("spam"))
                });

                let Some(dest_mb) = found_mb else {
                    writer.write_all(format!("{} NO [TRYCREATE] Mailbox '{}' does not exist\r\n", tag, mb_name).as_bytes()).await?;
                    continue;
                };

                // Ready continuation response
                writer.write_all(b"+ Ready for literal data\r\n").await?;
                writer.flush().await?;

                let mut payload = vec![0u8; literal_size];
                if let Err(e) = lines.get_mut().read_exact(&mut payload).await {
                    error!("Error reading APPEND literal payload: {}", e);
                    writer.write_all(format!("{} NO APPEND failed reading data\r\n", tag).as_bytes()).await?;
                    continue;
                }

                let parsed = MessageParser::default().parse(&payload);
                let rfc822_id = parsed.as_ref().and_then(|p| p.message_id()).unwrap_or("").trim().to_string();

                // Idempotent Deduplication: Check if Message-ID already exists in this mailbox
                if !rfc822_id.is_empty() {
                    if let Ok(Some(existing_uid)) = state.repo.find_message_uid_by_rfc822_id(acc.id, dest_mb.id, &rfc822_id).await {
                        info!("Deduplicated APPEND for Message-ID: {} in {} (UID: {})", rfc822_id, dest_mb.name, existing_uid);
                        writer.write_all(format!("{} OK [APPENDUID {} {}] APPEND completed\r\n", tag, dest_mb.uid_validity, existing_uid).as_bytes()).await?;
                        continue;
                    }
                }

                let mut hasher = Sha256::new();
                hasher.update(&payload);
                let blob_id = hex::encode(hasher.finalize());

                let _ = state.storage.put_blob(&blob_id, &payload).await;
                let _ = state.repo.reserve_blob(&blob_id, payload.len() as i64, payload.len() as i64, "zstd").await;

                let subject = parsed.as_ref().and_then(|p| p.subject()).unwrap_or("(No Subject)").to_string();
                let snippet = parsed.as_ref().and_then(|p| p.body_text(0)).map(|s| s.chars().take(150).collect::<String>()).unwrap_or_default();
                let from_addr = parsed.as_ref().and_then(|p| p.from()).and_then(|f| f.first()).and_then(|a| a.address()).unwrap_or(&acc.email).to_string();
                let from_name = parsed.as_ref().and_then(|p| p.from()).and_then(|f| f.first()).and_then(|a| a.name()).map(|s| s.to_string()).unwrap_or_default();
                let to_addresses = parsed.as_ref().and_then(|p| p.to()).map(|list| list.iter().filter_map(|a| a.address()).collect::<Vec<_>>().join(", ")).unwrap_or_default();
                let has_attachments = parsed.as_ref().map(|p| p.attachment_count() > 0).unwrap_or(false);

                let in_reply_to = parsed.as_ref().map(|p| match p.in_reply_to() {
                    mail_parser::HeaderValue::Text(t) => t.to_string(),
                    mail_parser::HeaderValue::TextList(l) => l.first().map(|s| s.to_string()).unwrap_or_default(),
                    _ => String::new(),
                }).unwrap_or_default();

                let mut references = Vec::new();
                if let Some(ref p) = parsed {
                    match p.references() {
                        mail_parser::HeaderValue::Text(t) => references.push(t.to_string()),
                        mail_parser::HeaderValue::TextList(l) => {
                            for r in l {
                                references.push(r.to_string());
                            }
                        }
                        _ => {}
                    }
                }

                let date = parsed.as_ref().and_then(|p| p.date()).and_then(|d| chrono::DateTime::from_timestamp(d.to_timestamp(), 0)).unwrap_or_else(chrono::Utc::now);

                let incoming = NewIncomingMessage {
                    account_id: acc.id,
                    mailbox_id: dest_mb.id,
                    blob_id,
                    rfc822_message_id: if rfc822_id.is_empty() { format!("<{}@{}>", Uuid::new_v4(), state.hostname) } else { rfc822_id },
                    in_reply_to,
                    references,
                    subject,
                    from_address: from_addr,
                    from_name,
                    to_addresses,
                    cc_addresses: None,
                    bcc_addresses: None,
                    reply_to: None,
                    date,
                    size_bytes: payload.len() as i64,
                    snippet,
                    has_attachments,
                    is_unread,
                    is_flagged,
                    is_draft,
                    keywords,
                };

                match state.repo.insert_message_with_junction(incoming).await {
                    Ok((inserted_msg, junction)) => {
                        state.event_bus.publish(MailboxEvent {
                            account_id: acc.id,
                            mailbox_id: dest_mb.id,
                            event_type: MailboxEventType::Created,
                            uid: junction.uid,
                            modseq: junction.modseq,
                        });

                        writer.write_all(format!("{} OK [APPENDUID {} {}] APPEND completed\r\n", tag, dest_mb.uid_validity, junction.uid).as_bytes()).await?;
                        info!("APPEND completed: msg [{}] UID {} into {}", inserted_msg.id, junction.uid, dest_mb.name);
                    }
                    Err(e) => {
                        error!("Database error inserting APPEND message: {}", e);
                        writer.write_all(format!("{} NO Database error inserting message\r\n", tag).as_bytes()).await?;
                    }
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
