use crate::config::Config;
use crate::db::{Database, MessageRecord, User};
use crate::smtp::SmtpClient;
use crate::storage::Storage;
use axum::{
    body::Bytes,
    extract::{Path as AxumPath, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use tracing::{error, info, warn};
use uuid::Uuid;

pub struct ApiState {
    pub config: Arc<Config>,
    pub db: Arc<Database>,
    pub storage: Arc<Storage>,
    pub smtp_client: Arc<SmtpClient>,
}

pub fn router(state: Arc<ApiState>) -> Router {
    Router::new()
        .route("/jmap/session", get(jmap_session))
        .route("/.well-known/jmap", get(jmap_session))
        .route("/jmap", post(jmap_batch))
        .route("/healthz/live", get(health_check))
        .route("/api/blob/:id", get(download_blob))
        .route("/api/blob", post(upload_blob))
        .route("/api/admin/users", post(admin_create_user).get(admin_list_users))
        .route("/api/admin/domains", post(admin_create_domain).get(admin_list_domains))
        .with_state(state)
}

async fn health_check() -> impl IntoResponse {
    (StatusCode::OK, "OK")
}

// -----------------------------------------------------------------------------
// Authentication Helper
// -----------------------------------------------------------------------------
fn authenticate(headers: &HeaderMap, db: &Database) -> Option<User> {
    let auth_header = headers.get(header::AUTHORIZATION)?.to_str().ok()?;
    if !auth_header.starts_with("Basic ") {
        return None;
    }

    let b64 = &auth_header[6..];
    let decoded = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, b64).ok()?;
    let creds = String::from_utf8(decoded).ok()?;
    let mut parts = creds.splitn(2, ':');
    let email = parts.next()?.trim();
    let password = parts.next()?.trim();

    db.verify_user(email, password)
}

fn unauthorized_response() -> Response {
    let mut resp = (StatusCode::UNAUTHORIZED, "Unauthorized").into_response();
    resp.headers_mut().insert(
        header::WWW_AUTHENTICATE,
        "Basic realm=\"Postarc\"".parse().unwrap(),
    );
    resp
}

// -----------------------------------------------------------------------------
// GET /jmap/session
// -----------------------------------------------------------------------------
async fn jmap_session(
    headers: HeaderMap,
    State(state): State<Arc<ApiState>>,
) -> Response {
    let user = match authenticate(&headers, &state.db) {
        Some(u) => u,
        None => return unauthorized_response(),
    };

    let base_url = format!("http://{}:{}", state.config.hostname, state.config.http_port);
    let account_id = user.id.clone();

    let session = json!({
        "capabilities": {
            "urn:ietf:params:jmap:core": {
                "maxSizeUpload": 33554432,
                "maxConcurrentUpload": 4,
                "maxSizeRequest": 10000000,
                "maxConcurrentRequests": 4,
                "maxCallsInRequest": 16,
                "maxObjectsInGet": 500,
                "maxObjectsInSet": 500,
                "collationAlgorithms": ["i;ascii-casemap", "i;unicode-casemap"]
            },
            "urn:ietf:params:jmap:mail": {},
            "urn:ietf:params:jmap:submission": {},
            "urn:ietf:params:jmap:quota": {}
        },
        "accounts": {
            &account_id: {
                "name": &user.email,
                "isPersonal": true,
                "isReadOnly": false,
                "accountCapabilities": {
                    "urn:ietf:params:jmap:mail": {},
                    "urn:ietf:params:jmap:submission": {}
                }
            }
        },
        "primaryAccounts": {
            "urn:ietf:params:jmap:mail": &account_id,
            "urn:ietf:params:jmap:submission": &account_id,
            "urn:ietf:params:jmap:quota": &account_id
        },
        "username": &user.email,
        "apiUrl": format!("{}/jmap", base_url),
        "downloadUrl": format!("{}/api/blob/{{blobId}}", base_url),
        "uploadUrl": format!("{}/api/blob", base_url),
        "eventSourceUrl": format!("{}/api/push", base_url),
        "state": "1"
    });

    Json(session).into_response()
}

// -----------------------------------------------------------------------------
// POST /jmap (Batch Request)
// -----------------------------------------------------------------------------
#[derive(Deserialize)]
struct JmapBatchRequest {
    #[serde(default)]
    using: Vec<String>,
    #[serde(rename = "methodCalls")]
    method_calls: Vec<(String, Value, String)>,
}

async fn jmap_batch(
    headers: HeaderMap,
    State(state): State<Arc<ApiState>>,
    Json(payload): Json<JmapBatchRequest>,
) -> Response {
    let user = match authenticate(&headers, &state.db) {
        Some(u) => u,
        None => return unauthorized_response(),
    };

    let mut method_responses = Vec::new();
    let mut created_ids: HashMap<String, String> = HashMap::new();

    for (method_name, args, call_id) in payload.method_calls {
        let (resp_method, resp_data) = process_jmap_call(
            &method_name,
            args,
            &user,
            &state,
            &mut created_ids,
        )
        .await;
        method_responses.push((resp_method, resp_data, call_id));
    }

    Json(json!({
        "methodResponses": method_responses,
        "sessionState": "1"
    }))
    .into_response()
}

async fn process_jmap_call(
    method: &str,
    args: Value,
    user: &User,
    state: &Arc<ApiState>,
    created_ids: &mut HashMap<String, String>,
) -> (String, Value) {
    let account_id = &user.id;

    match method {
        // ---------------------------------------------------------------------
        // Mailbox/get
        // ---------------------------------------------------------------------
        "Mailbox/get" => {
            let mailboxes = state.db.get_user_mailboxes(&user.id).unwrap_or_default();
            let list: Vec<Value> = mailboxes
                .into_iter()
                .map(|m| {
                    json!({
                        "id": m.id,
                        "name": m.name,
                        "role": m.role,
                        "totalEmails": m.total_count,
                        "unreadEmails": m.unread_count,
                        "totalThreads": m.total_count,
                        "unreadThreads": m.unread_count,
                        "myRights": {
                            "mayReadItems": true,
                            "mayAddItems": true,
                            "mayRemoveItems": true,
                            "maySetSeen": true,
                            "maySetKeywords": true,
                            "mayCreateChild": false,
                            "mayRename": false,
                            "mayDelete": false,
                            "maySubmit": true
                        }
                    })
                })
                .collect();

            (
                "Mailbox/get".to_string(),
                json!({
                    "accountId": account_id,
                    "state": "1",
                    "list": list,
                    "notFound": []
                }),
            )
        }

        // ---------------------------------------------------------------------
        // Mailbox/set
        // ---------------------------------------------------------------------
        "Mailbox/set" => {
            (
                "Mailbox/set".to_string(),
                json!({
                    "accountId": account_id,
                    "created": {},
                    "updated": {},
                    "destroyed": []
                }),
            )
        }

        // ---------------------------------------------------------------------
        // Email/query
        // ---------------------------------------------------------------------
        "Email/query" => {
            let limit = args.get("limit").and_then(|v| v.as_i64()).unwrap_or(50);
            let position = args.get("position").and_then(|v| v.as_i64()).unwrap_or(0);
            let filter = args.get("filter");

            let mailbox_id = filter
                .and_then(|f| f.get("inMailbox"))
                .and_then(|v| v.as_str());

            let search_text = filter
                .and_then(|f| f.get("text"))
                .and_then(|v| v.as_str());

            let (messages, total) = state
                .db
                .get_messages(&user.id, mailbox_id, search_text, limit, position)
                .unwrap_or_default();

            let ids: Vec<String> = messages.into_iter().map(|m| m.id).collect();

            (
                "Email/query".to_string(),
                json!({
                    "accountId": account_id,
                    "queryState": "1",
                    "canCalculateChanges": false,
                    "position": position,
                    "total": total,
                    "ids": ids
                }),
            )
        }

        // ---------------------------------------------------------------------
        // Email/get
        // ---------------------------------------------------------------------
        "Email/get" => {
            let requested_ids: Vec<String> = if let Some(ids_array) = args.get("ids").and_then(|v| v.as_array()) {
                ids_array.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()
            } else {
                // Return all recent messages if ids is null
                let (messages, _) = state.db.get_messages(&user.id, None, None, 100, 0).unwrap_or_default();
                messages.into_iter().map(|m| m.id).collect()
            };

            let mut list = Vec::new();
            for msg_id in &requested_ids {
                if let Some(msg) = state.db.get_message_by_id(&user.id, msg_id) {
                    list.push(json!({
                        "id": msg.id,
                        "blobId": msg.blob_id,
                        "threadId": msg.id,
                        "mailboxIds": {
                            &msg.mailbox_id: true
                        },
                        "keywords": {
                            "$seen": !msg.is_unread,
                            "$flagged": msg.is_starred
                        },
                        "size": msg.size,
                        "receivedAt": msg.received_at,
                        "from": [{
                            "name": msg.sender_name,
                            "email": msg.sender_email
                        }],
                        "to": [{
                            "email": msg.recipient_email
                        }],
                        "subject": msg.subject,
                        "preview": msg.snippet,
                        "bodyValues": {
                            "body1": {
                                "value": if !msg.body_html.is_empty() { &msg.body_html } else { &msg.body_text },
                                "isEncodingProblem": false,
                                "isTruncated": false
                            }
                        },
                        "textBody": [{
                            "partId": "body1",
                            "type": "text/plain"
                        }],
                        "htmlBody": if !msg.body_html.is_empty() {
                            Some(vec![json!({
                                "partId": "body1",
                                "type": "text/html"
                            })])
                        } else {
                            None
                        },
                        "attachments": []
                    }));
                }
            }

            (
                "Email/get".to_string(),
                json!({
                    "accountId": account_id,
                    "state": "1",
                    "list": list,
                    "notFound": []
                }),
            )
        }

        // ---------------------------------------------------------------------
        // Email/set
        // ---------------------------------------------------------------------
        "Email/set" => {
            let mut created = json!({});
            let mut updated = json!({});
            let mut destroyed = Vec::new();

            // Handle creates (e.g. draftMsg)
            if let Some(creates) = args.get("create").and_then(|v| v.as_object()) {
                for (temp_id, data) in creates {
                    let new_id = Uuid::new_v4().to_string();
                    created_ids.insert(temp_id.clone(), new_id.clone());

                    created[temp_id] = json!({
                        "id": new_id,
                        "blobId": new_id,
                        "threadId": new_id,
                        "size": 1024
                    });
                }
            }

            // Handle updates (flags, keywords, moving folders)
            if let Some(updates) = args.get("update").and_then(|v| v.as_object()) {
                for (msg_id, patch) in updates {
                    let is_seen = patch.get("keywords").and_then(|k| k.get("$seen")).and_then(|v| v.as_bool());
                    let is_flagged = patch.get("keywords").and_then(|k| k.get("$flagged")).and_then(|v| v.as_bool());
                    let target_mailbox = patch.get("mailboxIds").and_then(|m| m.as_object()).and_then(|m| m.keys().next()).map(|s| s.as_str());

                    if state.db.update_message_properties(&user.id, msg_id, is_seen, is_flagged, target_mailbox).is_ok() {
                        updated[msg_id] = json!(null);
                    }
                }
            }

            // Handle destroy
            if let Some(destroys) = args.get("destroy").and_then(|v| v.as_array()) {
                for id_val in destroys {
                    if let Some(id_str) = id_val.as_str() {
                        if state.db.delete_message(&user.id, id_str).is_ok() {
                            destroyed.push(id_str.to_string());
                        }
                    }
                }
            }

            (
                "Email/set".to_string(),
                json!({
                    "accountId": account_id,
                    "created": created,
                    "updated": updated,
                    "destroyed": destroyed
                }),
            )
        }

        // ---------------------------------------------------------------------
        // EmailSubmission/set (Outbound Email Delivery)
        // ---------------------------------------------------------------------
        "EmailSubmission/set" => {
            let mut created = json!({});
            let mut not_created = json!({});

            if let Some(creates) = args.get("create").and_then(|v| v.as_object()) {
                for (temp_id, submission_val) in creates {
                    let sender_email = submission_val
                        .get("envelope")
                        .and_then(|e| e.get("mailFrom"))
                        .and_then(|m| m.get("email"))
                        .and_then(|v| v.as_str())
                        .unwrap_or(&user.email);

                    let rcpt_to: Vec<String> = submission_val
                        .get("envelope")
                        .and_then(|e| e.get("rcptTo"))
                        .and_then(|v| v.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|r| r.get("email").and_then(|v| v.as_str()).map(|s| s.to_string()))
                                .collect()
                        })
                        .unwrap_or_default();

                    if rcpt_to.is_empty() {
                        not_created[temp_id] = json!({
                            "type": "invalidProperties",
                            "description": "No valid recipients specified in envelope"
                        });
                        continue;
                    }

                    let submission_id = Uuid::new_v4().to_string();
                    let mut all_delivered = true;
                    let mut delivery_err = String::new();

                    for recipient in &rcpt_to {
                        match state
                            .smtp_client
                            .send_email(
                                &user.email.split('@').next().unwrap_or("User"),
                                sender_email,
                                recipient,
                                "Message from Postarc",
                                "Sent via Postarc Webmail",
                                None,
                            )
                            .await
                        {
                            Ok(_) => {
                                info!("Email successfully submitted to {}", recipient);
                            }
                            Err(e) => {
                                error!("Failed outbound delivery to {}: {}", recipient, e);
                                all_delivered = false;
                                delivery_err = e;
                            }
                        }
                    }

                    if all_delivered {
                        // Place a copy into user's Sent folder
                        if let Some(sent_box) = state.db.get_mailbox_by_role(&user.id, "sent") {
                            let sent_msg = MessageRecord {
                                id: Uuid::new_v4().to_string(),
                                user_id: user.id.clone(),
                                mailbox_id: sent_box.id,
                                sender_name: user.email.split('@').next().unwrap_or("User").to_string(),
                                sender_email: sender_email.to_string(),
                                recipient_email: rcpt_to.join(", "),
                                subject: "Message from Postarc".to_string(),
                                snippet: "Sent via Postarc Webmail".to_string(),
                                body_text: "Sent via Postarc Webmail".to_string(),
                                body_html: String::new(),
                                blob_id: submission_id.clone(),
                                size: 1024,
                                is_unread: false,
                                is_starred: false,
                                received_at: Utc::now().to_rfc3339(),
                            };
                            let _ = state.db.insert_message(&sent_msg);
                        }

                        created[temp_id] = json!({
                            "id": submission_id,
                            "sendAt": Utc::now().to_rfc3339()
                        });
                    } else {
                        not_created[temp_id] = json!({
                            "type": "forbiddenFrom",
                            "description": delivery_err
                        });
                    }
                }
            }

            (
                "EmailSubmission/set".to_string(),
                json!({
                    "accountId": account_id,
                    "created": created,
                    "notCreated": not_created
                }),
            )
        }

        // ---------------------------------------------------------------------
        // Identity/get
        // ---------------------------------------------------------------------
        "Identity/get" => {
            (
                "Identity/get".to_string(),
                json!({
                    "accountId": account_id,
                    "state": "1",
                    "list": [{
                        "id": &user.id,
                        "name": user.email.split('@').next().unwrap_or("Admin"),
                        "email": &user.email,
                        "textSignature": "",
                        "htmlSignature": "",
                        "mayDelete": false
                    }],
                    "notFound": []
                }),
            )
        }

        // ---------------------------------------------------------------------
        // VacationResponse/get
        // ---------------------------------------------------------------------
        "VacationResponse/get" => {
            (
                "VacationResponse/get".to_string(),
                json!({
                    "accountId": account_id,
                    "state": "1",
                    "list": [{
                        "id": "singleton",
                        "isEnabled": false
                    }],
                    "notFound": []
                }),
            )
        }

        // ---------------------------------------------------------------------
        // Quota/get
        // ---------------------------------------------------------------------
        "Quota/get" => {
            (
                "Quota/get".to_string(),
                json!({
                    "accountId": account_id,
                    "state": "1",
                    "list": [{
                        "id": "quota_default",
                        "name": "Storage Quota",
                        "resourceType": "octets",
                        "used": 1048576,
                        "limit": 10737418240_i64,
                        "scope": "account"
                    }],
                    "notFound": []
                }),
            )
        }

        _ => {
            warn!("Unhandled JMAP method: {}", method);
            (
                format!("{}/error", method),
                json!({
                    "type": "unknownMethod",
                    "description": format!("Method '{}' is not supported", method)
                }),
            )
        }
    }
}

// -----------------------------------------------------------------------------
// Blob Upload & Download
// -----------------------------------------------------------------------------
async fn download_blob(
    AxumPath(blob_id): AxumPath<String>,
    State(state): State<Arc<ApiState>>,
) -> Response {
    if let Some(bytes) = state.storage.get_blob(&blob_id).await {
        (
            StatusCode::OK,
            [(header::CONTENT_TYPE, "application/octet-stream")],
            bytes,
        )
            .into_response()
    } else {
        (StatusCode::NOT_FOUND, "Blob not found").into_response()
    }
}

async fn upload_blob(
    State(state): State<Arc<ApiState>>,
    body: Bytes,
) -> Response {
    match state.storage.save_blob(&body).await {
        Ok(blob_id) => Json(json!({
            "blobId": blob_id,
            "size": body.len()
        }))
        .into_response(),
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Failed to save blob").into_response(),
    }
}

// -----------------------------------------------------------------------------
// Admin API (User & Domain Provisioning)
// -----------------------------------------------------------------------------
#[derive(Deserialize)]
struct AdminUserPayload {
    email: String,
    password: String,
}

async fn admin_create_user(
    State(state): State<Arc<ApiState>>,
    Json(payload): Json<AdminUserPayload>,
) -> Response {
    match state.db.create_user(&payload.email, &payload.password) {
        Ok(user_id) => (
            StatusCode::CREATED,
            Json(json!({
                "success": true,
                "userId": user_id,
                "email": payload.email
            })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "success": false,
                "error": e.to_string()
            })),
        )
            .into_response(),
    }
}

async fn admin_list_users(State(state): State<Arc<ApiState>>) -> Response {
    let users = state.db.list_users().unwrap_or_default();
    let list: Vec<Value> = users
        .into_iter()
        .map(|(id, email)| json!({ "id": id, "email": email }))
        .collect();
    Json(json!({ "users": list })).into_response()
}

#[derive(Deserialize)]
struct AdminDomainPayload {
    name: String,
}

async fn admin_create_domain(
    State(state): State<Arc<ApiState>>,
    Json(payload): Json<AdminDomainPayload>,
) -> Response {
    match state.db.get_or_create_domain(&payload.name) {
        Ok(domain_id) => (
            StatusCode::CREATED,
            Json(json!({
                "success": true,
                "domainId": domain_id,
                "domain": payload.name
            })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "success": false,
                "error": e.to_string()
            })),
        )
            .into_response(),
    }
}

async fn admin_list_domains(State(state): State<Arc<ApiState>>) -> Response {
    let domains = state.db.list_domains().unwrap_or_default();
    let list: Vec<Value> = domains
        .into_iter()
        .map(|(id, name)| json!({ "id": id, "name": name }))
        .collect();
    Json(json!({ "domains": list })).into_response()
}
