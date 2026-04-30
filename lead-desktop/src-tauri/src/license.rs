// License module — calls api.cwleaders.com/license/validate, caches the
// returned HS256 JWT for 14 days of offline use.
//
// SECURITY (release-audit P1-67/68): the JWT lives in the OS keyring
// (Keychain on macOS, Credential Manager on Windows, Secret Service on Linux)
// instead of plaintext on disk. Only non-secret metadata (tier, features,
// machine_id, expires_at) lives in the JSON sidecar.

use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::fs;
use uuid::Uuid;

const API_BASE: &str = "https://api.cwleaders.com";
const LICENSE_FILE: &str = "license.json";
const KEYRING_SERVICE: &str = "com.cwleaders.studio";
const KEYRING_USER:    &str = "license-jwt";

/// Has the user gone through the welcome / EULA acceptance screen?
pub fn eula_accepted() -> bool {
    app_data_dir().join("eula-accepted.json").exists()
}

fn keyring_set(jwt: &str) -> Result<(), String> {
    Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .and_then(|e| e.set_password(jwt))
        .map_err(|e| e.to_string())
}

fn keyring_get() -> Option<String> {
    Entry::new(KEYRING_SERVICE, KEYRING_USER).ok()
        .and_then(|e| e.get_password().ok())
}

fn keyring_delete() {
    if let Ok(e) = Entry::new(KEYRING_SERVICE, KEYRING_USER) {
        let _ = e.delete_credential();
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LicenseState {
    pub key: Option<String>,
    pub tier: Option<String>,
    pub features: Vec<String>,
    pub expires_at: Option<String>,
    pub jwt: Option<String>,
    pub validated_at: Option<u64>,
    pub machine_id: String,
    pub email: Option<String>,
}

impl Default for LicenseState {
    fn default() -> Self {
        Self {
            key: None, tier: None, features: vec![],
            expires_at: None, jwt: None, validated_at: None,
            machine_id: Self::stable_machine_id(),
            email: None,
        }
    }
}

impl LicenseState {
    fn stable_machine_id() -> String {
        // Stored once and reused — bound to the user's machine for license validation
        let dir = app_data_dir();
        let mid = dir.join("machine.id");
        if let Ok(s) = std::fs::read_to_string(&mid) {
            return s.trim().to_string();
        }
        let id = Uuid::new_v4().to_string();
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(&mid, &id);
        id
    }
}

fn app_data_dir() -> PathBuf {
    dirs::data_dir().unwrap_or_else(|| PathBuf::from("."))
        .join("CW-Leaders-Studio")
}

async fn load() -> LicenseState {
    let path = app_data_dir().join(LICENSE_FILE);
    if let Ok(bytes) = fs::read(&path).await {
        if let Ok(state) = serde_json::from_slice::<LicenseState>(&bytes) {
            return state;
        }
    }
    LicenseState::default()
}

async fn save(state: &LicenseState) -> std::io::Result<()> {
    let dir = app_data_dir();
    fs::create_dir_all(&dir).await?;
    let json = serde_json::to_vec_pretty(state).unwrap();
    fs::write(dir.join(LICENSE_FILE), json).await
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs()
}

#[derive(Debug, Serialize)]
pub struct LicenseStatus {
    pub valid: bool,
    pub tier: String,
    pub features: Vec<String>,
    pub expires_at: Option<String>,
    pub email: Option<String>,
    pub offline_grace_days: i64,
}

#[tauri::command]
pub async fn license_status() -> Result<LicenseStatus, String> {
    let state = load().await;
    // The JWT itself lives in the OS keyring; presence + freshness gates validity
    let jwt_in_keyring = keyring_get().is_some();
    let valid = jwt_in_keyring
        && state.validated_at.map(|t| now_secs() < t + 14 * 24 * 3600).unwrap_or(false);

    let grace_days = state.validated_at
        .map(|t| ((t + 14 * 24 * 3600) as i64 - now_secs() as i64) / 86400)
        .unwrap_or(0)
        .max(0);

    Ok(LicenseStatus {
        valid,
        tier: state.tier.unwrap_or_else(|| "free".to_string()),
        features: state.features,
        expires_at: state.expires_at,
        email: state.email,
        offline_grace_days: grace_days,
    })
}

#[derive(Debug, Deserialize)]
struct ValidateResponse {
    valid: bool,
    tier: String,
    features: Vec<String>,
    expires: Option<String>,
    jwt: String,
}

#[tauri::command]
pub async fn license_redeem(key: String) -> Result<LicenseStatus, String> {
    let mut state = load().await;
    let normalized = key.trim().to_uppercase().replace('-', "");
    if normalized.len() != 16 {
        return Err("License keys are 16 characters (4 groups of 4)".to_string());
    }

    let body = serde_json::json!({
        "key": normalized,
        "machineId": state.machine_id,
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client.post(format!("{}/license/validate", API_BASE))
        .json(&body)
        .send().await
        .map_err(|e| format!("Couldn't reach the license server: {e}"))?;

    if !resp.status().is_success() {
        let txt = resp.text().await.unwrap_or_default();
        return Err(format!("License rejected: {}", trim_json_error(&txt)));
    }

    let parsed: ValidateResponse = resp.json().await
        .map_err(|e| format!("Server returned an unexpected response: {e}"))?;

    if !parsed.valid {
        return Err("License is not valid".to_string());
    }

    state.key = Some(normalized);
    state.tier = Some(parsed.tier.clone());
    state.features = parsed.features.clone();
    state.expires_at = parsed.expires;
    // SECURITY: JWT goes to OS keyring; never written to disk plaintext
    keyring_set(&parsed.jwt)?;
    state.jwt = None;  // explicit — do not leak via file
    state.validated_at = Some(now_secs());
    save(&state).await.map_err(|e| e.to_string())?;

    Ok(LicenseStatus {
        valid: true,
        tier: parsed.tier,
        features: parsed.features,
        expires_at: state.expires_at,
        email: state.email,
        offline_grace_days: 14,
    })
}

#[tauri::command]
pub async fn license_clear() -> Result<(), String> {
    let path = app_data_dir().join(LICENSE_FILE);
    let _ = fs::remove_file(path).await;
    keyring_delete();
    Ok(())
}

fn trim_json_error(s: &str) -> String {
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(s) {
        if let Some(e) = v.get("error").and_then(|v| v.as_str()) {
            return e.to_string();
        }
    }
    s.chars().take(200).collect()
}
