use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

pub const CAPABILITY_CORE: &str = "urn:ietf:params:jmap:core";
pub const CAPABILITY_MAIL: &str = "urn:ietf:params:jmap:mail";
pub const CAPABILITY_SUBMISSION: &str = "urn:ietf:params:jmap:submission";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JmapSession {
    pub capabilities: HashMap<String, Value>,
    pub accounts: HashMap<String, JmapAccount>,
    pub primary_accounts: HashMap<String, String>,
    pub username: String,
    pub api_url: String,
    pub download_url: String,
    pub upload_url: String,
    pub event_source_url: String,
    pub state: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JmapAccount {
    pub name: String,
    pub is_personal: bool,
    pub is_read_only: bool,
    pub account_capabilities: HashMap<String, Value>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JmapRequest {
    #[allow(dead_code)]
    pub using: Vec<String>,
    pub method_calls: Vec<(String, Value, String)>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JmapResponse {
    pub method_responses: Vec<(String, Value, String)>,
    pub session_state: String,
}
