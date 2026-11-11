use super::methods::*;
use super::session::build_session;
use super::sse::handle_sse;
use super::types::{JmapRequest, JmapResponse};
use crate::auth::argon::verify_password;
use crate::auth::jwt::{create_token, verify_token};
use crate::db::MailRepository;
use crate::event_bus::EventBus;
use crate::storage::BlobStorage;
use axum::{
    body::Bytes,
    extract::{Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
use serde::Deserialize;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tracing::{info, warn};
use uuid::Uuid;

#[derive(Clone)]
pub struct AppState {
    pub repo: MailRepository,
    pub storage: Arc<dyn BlobStorage>,
    pub event_bus: EventBus,
    pub default_admin_email: String,
    pub jwt_secret: String,
    pub mail_domain: String,
    pub hostname: String,
}

#[derive(Deserialize)]
struct LoginPayload {
    email: String,
    password: String,
}

pub fn create_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/healthz", get(get_healthz))
        .route("/.well-known/mta-sts.txt", get(get_mta_sts))
        .route("/.well-known/autoconfig/mail/config-v1.1.xml", get(get_autoconfig_xml))
        .route("/mail/config-v1.1.xml", get(get_autoconfig_xml))
        .route("/autodiscover/autodiscover.xml", get(get_or_post_autodiscover_xml).post(get_or_post_autodiscover_xml))
        .route("/Autodiscover/Autodiscover.xml", get(get_or_post_autodiscover_xml).post(get_or_post_autodiscover_xml))
        .route("/api/auth/login", post(post_auth_login))
        .route("/.well-known/jmap", get(get_session))
        .route("/api/jmap", post(post_jmap))
        .route("/api/events", get(get_events))
        .route("/api/blob/{account_id}/{blob_id}/{name}", get(get_blob))
        .route("/api/upload/{account_id}", post(post_upload))
        .layer(cors)
        .with_state(state)
}

pub async fn run_jmap_server(bind_addr: SocketAddr, state: AppState) -> Result<(), Box<dyn std::error::Error>> {
    let router = create_router(state);
    info!("JMAP & HTTP API listening on http://{}", bind_addr);

    let listener = tokio::net::TcpListener::bind(bind_addr).await?;
    axum::serve(listener, router).await?;
    Ok(())
}

async fn post_auth_login(
    State(state): State<AppState>,
    Json(body): Json<LoginPayload>,
) -> Response {
    let clean_email = body.email.trim().to_lowercase();
    match state.repo.get_account_by_email(&clean_email).await {
        Ok(Some(account)) => {
            if verify_password(&body.password, &account.password_hash) {
                match create_token(account.id, &account.email, &state.jwt_secret) {
                    Ok(token) => {
                        info!("Successful webmail authentication for {}", account.email);
                        (
                            StatusCode::OK,
                            Json(json!({
                                "token": token,
                                "account": {
                                    "id": account.id.to_string(),
                                    "email": account.email,
                                    "username": account.username
                                }
                            })),
                        )
                            .into_response()
                    }
                    Err(e) => {
                        warn!("Failed to generate JWT for {}: {}", account.email, e);
                        (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(json!({ "error": "Token generation error" })),
                        )
                            .into_response()
                    }
                }
            } else {
                warn!("Authentication failed (invalid password) for {}", clean_email);
                (
                    StatusCode::UNAUTHORIZED,
                    Json(json!({ "error": "Invalid email or password" })),
                )
                    .into_response()
            }
        }
        _ => {
            warn!("Authentication failed (user not found) for {}", clean_email);
            (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "error": "Invalid email or password" })),
            )
                .into_response()
        }
    }
}

async fn authenticate_request(headers: &HeaderMap, state: &AppState) -> Option<(Uuid, String)> {
    if let Some(auth_header) = headers.get(header::AUTHORIZATION).and_then(|v| v.to_str().ok()) {
        let token = auth_header.trim_start_matches("Bearer ").trim();
        if let Ok(claims) = verify_token(token, &state.jwt_secret) {
            if let Ok(account_id) = Uuid::parse_str(&claims.sub) {
                return Some((account_id, claims.email));
            }
        }
    }
    None
}

async fn get_session(headers: HeaderMap, State(state): State<AppState>) -> Response {
    let Some((account_id, username)) = authenticate_request(&headers, &state).await else {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "type": "urn:ietf:params:jmap:error:unauthorized", "status": 401 })),
        )
            .into_response();
    };
    let session = build_session(account_id, &username);
    Json(session).into_response()
}

async fn post_jmap(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(req): Json<JmapRequest>,
) -> Response {
    let Some((account_id, _)) = authenticate_request(&headers, &state).await else {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "type": "urn:ietf:params:jmap:error:unauthorized", "status": 401 })),
        )
            .into_response();
    };
    let mut method_responses = Vec::new();

    for (name, args, call_id) in req.method_calls {
        let res = match name.as_str() {
            "Mailbox/get" => handle_mailbox_get(&state.repo, account_id, args).await,
            "Mailbox/set" => handle_mailbox_set(&state.repo, account_id, args).await,
            "Email/get" => handle_email_get(&state.repo, &state.storage, account_id, args).await,
            "Email/query" => handle_email_query(&state.repo, account_id, args).await,
            "Email/set" => {
                handle_email_set(&state.repo, &state.storage, &state.event_bus, account_id, args).await
            }
            "EmailSubmission/set" => handle_submission_set(&state.repo, account_id, args).await,
            "Identity/get" => handle_identity_get(&state.repo, account_id, args).await,
            "CalendarEvent/get" => handle_calendar_event_get(&state.repo, account_id, args).await,
            "CalendarEvent/set" => handle_calendar_event_set(&state.repo, account_id, args).await,
            "ContactCard/get" => handle_contact_card_get(&state.repo, account_id, args).await,
            "ContactCard/set" => handle_contact_card_set(&state.repo, account_id, args).await,
            "Quota/get" => handle_quota_get(&state.repo, account_id, args).await,
            _ => {
                method_responses.push((
                    format!("{}/error", name),
                    json!({ "type": "unknownMethod" }),
                    call_id,
                ));
                continue;
            }
        };

        match res {
            Ok(val) => method_responses.push((name, val, call_id)),
            Err(err) => method_responses.push((
                format!("{}/error", name),
                json!({ "type": "serverError", "description": err }),
                call_id,
            )),
        }
    }

    Json(JmapResponse {
        method_responses,
        session_state: "1".to_string(),
    })
    .into_response()
}

#[derive(Deserialize)]
struct EventParams {
    token: Option<String>,
}

async fn get_events(
    headers: HeaderMap,
    Query(params): Query<EventParams>,
    State(state): State<AppState>,
) -> Response {
    let mut auth = authenticate_request(&headers, &state).await;
    if auth.is_none() {
        if let Some(ref t) = params.token {
            if let Ok(claims) = verify_token(t, &state.jwt_secret) {
                if let Ok(account_id) = Uuid::parse_str(&claims.sub) {
                    auth = Some((account_id, claims.email));
                }
            }
        }
    }

    let Some((account_id, _)) = auth else {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "type": "urn:ietf:params:jmap:error:unauthorized", "status": 401 })),
        )
            .into_response();
    };
    handle_sse(state.event_bus.clone(), account_id).await.into_response()
}

async fn get_blob(
    State(state): State<AppState>,
    Path((_account_id, blob_id, name)): Path<(String, String, String)>,
) -> Response {
    match state.storage.get_blob(&blob_id).await {
        Ok(bytes) => {
            let mut headers = HeaderMap::new();
            headers.insert(
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{}\"", name).parse().unwrap(),
            );
            headers.insert(header::CONTENT_TYPE, "application/octet-stream".parse().unwrap());
            (StatusCode::OK, headers, bytes).into_response()
        }
        Err(_) => (StatusCode::NOT_FOUND, "Blob not found").into_response(),
    }
}

async fn post_upload(
    State(state): State<AppState>,
    Path(account_id): Path<String>,
    body: Bytes,
) -> Response {
    let size = body.len() as i64;
    let mut hasher = Sha256::new();
    hasher.update(&body);
    let sha256 = hex::encode(hasher.finalize());

    if let Err(e) = state.storage.put_blob(&sha256, &body).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, format!("Storage error: {}", e)).into_response();
    }

    let _ = state.repo.reserve_blob(&sha256, size, size, "zstd").await;

    Json(json!({
        "accountId": account_id,
        "blobId": sha256,
        "type": "application/octet-stream",
        "size": size
    }))
    .into_response()
}

async fn get_healthz(State(state): State<AppState>) -> Response {
    if state.repo.pool().is_closed() {
        return (StatusCode::SERVICE_UNAVAILABLE, Json(json!({ "status": "fail", "reason": "database disconnected" }))).into_response();
    }
    (StatusCode::OK, Json(json!({ "status": "pass", "service": "postarc-mailserver", "version": "0.1.0" }))).into_response()
}

async fn get_mta_sts(State(state): State<AppState>) -> Response {
    let domain = state.default_admin_email.split('@').nth(1).unwrap_or("localhost");
    let content = format!(
        "version: STSv1\r\nmode: testing\r\nmx: mail.{}\r\nmax_age: 604800\r\n",
        domain
    );
    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, "text/plain; charset=utf-8".parse().unwrap());
    (StatusCode::OK, headers, content).into_response()
}

#[derive(Deserialize)]
struct AutoconfigQuery {
    emailaddress: Option<String>,
}

async fn get_autoconfig_xml(
    Query(query): Query<AutoconfigQuery>,
    State(state): State<AppState>,
) -> Response {
    let domain = query
        .emailaddress
        .as_deref()
        .and_then(|e| e.split('@').nth(1))
        .unwrap_or(&state.mail_domain);
    let hostname = &state.hostname;

    let xml = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<clientConfig version="1.1">
  <emailProvider id="{domain}">
    <domain>{domain}</domain>
    <displayName>{domain} Mail</displayName>
    <displayShortName>{domain}</displayShortName>
    <incomingServer type="imap">
      <hostname>{hostname}</hostname>
      <port>993</port>
      <socketType>SSL</socketType>
      <authentication>password-cleartext</authentication>
      <username>%EMAILADDRESS%</username>
    </incomingServer>
    <incomingServer type="imap">
      <hostname>{hostname}</hostname>
      <port>143</port>
      <socketType>STARTTLS</socketType>
      <authentication>password-cleartext</authentication>
      <username>%EMAILADDRESS%</username>
    </incomingServer>
    <outgoingServer type="smtp">
      <hostname>{hostname}</hostname>
      <port>465</port>
      <socketType>SSL</socketType>
      <authentication>password-cleartext</authentication>
      <username>%EMAILADDRESS%</username>
    </outgoingServer>
    <outgoingServer type="smtp">
      <hostname>{hostname}</hostname>
      <port>587</port>
      <socketType>STARTTLS</socketType>
      <authentication>password-cleartext</authentication>
      <username>%EMAILADDRESS%</username>
    </outgoingServer>
  </emailProvider>
</clientConfig>"#
    );

    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, "application/xml; charset=utf-8".parse().unwrap());
    (StatusCode::OK, headers, xml).into_response()
}

async fn get_or_post_autodiscover_xml(
    State(state): State<AppState>,
    body: Bytes,
) -> Response {
    let email_or_placeholder = if !body.is_empty() {
        let text = String::from_utf8_lossy(&body);
        if let Some(start) = text.find("<EMailAddress>") {
            if let Some(end) = text[start..].find("</EMailAddress>") {
                text[start + 14..start + end].trim().to_string()
            } else {
                "%EMAILADDRESS%".to_string()
            }
        } else {
            "%EMAILADDRESS%".to_string()
        }
    } else {
        "%EMAILADDRESS%".to_string()
    };

    let hostname = &state.hostname;
    let xml = format!(
        r#"<?xml version="1.0" encoding="utf-8"?>
<Autodiscover xmlns="http://schemas.microsoft.com/exchange/autodiscover/responseschema/2006">
  <Response xmlns="http://schemas.microsoft.com/exchange/autodiscover/outlook/responseschema/2006a">
    <Account>
      <AccountType>email</AccountType>
      <Action>settings</Action>
      <Protocol>
        <Type>IMAP</Type>
        <Server>{hostname}</Server>
        <Port>993</Port>
        <DomainRequired>off</DomainRequired>
        <LoginName>{email_or_placeholder}</LoginName>
        <SPA>off</SPA>
        <SSL>on</SSL>
        <AuthRequired>on</AuthRequired>
      </Protocol>
      <Protocol>
        <Type>SMTP</Type>
        <Server>{hostname}</Server>
        <Port>465</Port>
        <DomainRequired>off</DomainRequired>
        <LoginName>{email_or_placeholder}</LoginName>
        <SPA>off</SPA>
        <SSL>on</SSL>
        <AuthRequired>on</AuthRequired>
      </Protocol>
    </Account>
  </Response>
</Autodiscover>"#
    );

    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, "application/xml; charset=utf-8".parse().unwrap());
    (StatusCode::OK, headers, xml).into_response()
}
