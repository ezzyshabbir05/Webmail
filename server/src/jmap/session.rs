use super::types::{JmapAccount, JmapSession, CAPABILITY_CORE, CAPABILITY_MAIL, CAPABILITY_SUBMISSION};
use serde_json::json;
use std::collections::HashMap;
use uuid::Uuid;

pub fn build_session(account_id: Uuid, username: &str) -> JmapSession {
    let mut capabilities = HashMap::new();
    capabilities.insert(
        CAPABILITY_CORE.to_string(),
        json!({
            "maxSizeUpload": 52428800,
            "maxConcurrentUpload": 4,
            "maxSizeRequest": 10485760,
            "maxConcurrentRequests": 8,
            "maxCallsInRequest": 16,
            "maxObjectsInGet": 500,
            "maxObjectsInSet": 500,
            "collationAlgorithms": ["i;ascii-numeric", "i;ascii-casemap", "i;unicode-casemap"]
        }),
    );
    capabilities.insert(
        CAPABILITY_MAIL.to_string(),
        json!({
            "maxMailboxesPerEmail": 10,
            "maxMailboxDepth": 5,
            "maxSizeMailboxName": 100,
            "maxSizeAttachmentsPerEmail": 52428800,
            "emailQuerySortOptions": ["date", "from", "subject"],
            "mayCreateTopLevelMailbox": true
        }),
    );
    capabilities.insert(
        CAPABILITY_SUBMISSION.to_string(),
        json!({
            "maxDelayedSend": 0,
            "submissionExtensions": {}
        }),
    );

    let mut account_capabilities = HashMap::new();
    account_capabilities.insert(CAPABILITY_CORE.to_string(), json!({}));
    account_capabilities.insert(CAPABILITY_MAIL.to_string(), json!({}));
    account_capabilities.insert(CAPABILITY_SUBMISSION.to_string(), json!({}));

    let mut accounts = HashMap::new();
    let acc_id_str = account_id.to_string();
    accounts.insert(
        acc_id_str.clone(),
        JmapAccount {
            name: username.to_string(),
            is_personal: true,
            is_read_only: false,
            account_capabilities,
        },
    );

    let mut primary_accounts = HashMap::new();
    primary_accounts.insert(CAPABILITY_CORE.to_string(), acc_id_str.clone());
    primary_accounts.insert(CAPABILITY_MAIL.to_string(), acc_id_str.clone());
    primary_accounts.insert(CAPABILITY_SUBMISSION.to_string(), acc_id_str);

    JmapSession {
        capabilities,
        accounts,
        primary_accounts,
        username: username.to_string(),
        api_url: "/api/jmap".to_string(),
        download_url: "/api/blob/{accountId}/{blobId}/{name}".to_string(),
        upload_url: "/api/upload/{accountId}".to_string(),
        event_source_url: "/api/events".to_string(),
        state: "1".to_string(),
    }
}
