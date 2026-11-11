use super::methods::*;
use super::session::build_session;
use super::sse::handle_sse;
use super::types::{JmapRequest, JmapResponse};
use crate::db::MailRepository;
use crate::event_bus::EventBus;
use crate::storage::BlobStorage;
use axum::{
    body::Bytes,
    extract::{Path, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tracing::info;
use uuid::Uuid;

#[derive(Clone)]
pub struct AppState {
    pub repo: MailRepository,
    pub storage: Arc<dyn BlobStorage>,
    pub event_bus: EventBus,
    pub default_domain: String,
}

pub fn create_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
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

async fn get_default_account_id(state: &AppState) -> Uuid {
    let email = format!("admin@{}", state.default_domain);
    if let Ok(Some(acc)) = state.repo.get_account_by_email(&email).await {
        acc.id
    } else {
        Uuid::nil()
    }
}

async fn get_session(State(state): State<AppState>) -> Response {
    let account_id = get_default_account_id(&state).await;
    let username = format!("admin@{}", state.default_domain);
    let session = build_session(account_id, &username);
    Json(session).into_response()
}

async fn post_jmap(
    State(state): State<AppState>,
    Json(req): Json<JmapRequest>,
) -> Response {
    let account_id = get_default_account_id(&state).await;
    let mut method_responses = Vec::new();

    for (name, args, call_id) in req.method_calls {
        let res = match name.as_str() {
            "Mailbox/get" => handle_mailbox_get(&state.repo, account_id, args).await,
            "Mailbox/set" => handle_mailbox_set(&state.repo, account_id, args).await,
            "Email/get" => handle_email_get(&state.repo, account_id, args).await,
            "Email/query" => handle_email_query(&state.repo, account_id, args).await,
            "Email/set" => handle_email_set(&state.repo, &state.event_bus, account_id, args).await,
            "EmailSubmission/set" => handle_submission_set(&state.repo, account_id, args).await,
            "Identity/get" => handle_identity_get(&state.repo, account_id, args).await,
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

async fn get_events(State(state): State<AppState>) -> Response {
    let account_id = get_default_account_id(&state).await;
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
                format!("inline; filename=\"{}\"", name).parse().unwrap(),
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

    let _ = state.repo.reserve_blob(&sha256, size).await;

    Json(json!({
        "accountId": account_id,
        "blobId": sha256,
        "type": "application/octet-stream",
        "size": size
    }))
    .into_response()
}
