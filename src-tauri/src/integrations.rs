use super::{root_of, AppState};
use serde::Serialize;
use std::io::{Cursor, Read, Write};
use std::path::{Component, Path, PathBuf};
use tauri::State;

const MAX_EXTENSION_FILES: usize = 2_000;
const MAX_EXTENSION_BYTES: u64 = 50 * 1024 * 1024;

fn valid_slug(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 80
        && value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
}

fn normalized_slug(value: &str) -> String {
    value
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .chars()
        .take(80)
        .collect()
}

fn safe_archive_path(path: &Path) -> Option<PathBuf> {
    let mut clean = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(value) => clean.push(value),
            _ => return None,
        }
    }
    Some(clean)
}

fn install_vsix_bytes(root: &Path, bytes: &[u8], source: &str) -> Result<String, String> {
    if bytes.len() as u64 > MAX_EXTENSION_BYTES {
        return Err("extension exceeds the 50 MB download limit".to_string());
    }
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|e| e.to_string())?;
    if archive.len() > MAX_EXTENSION_FILES {
        return Err("extension exceeds the 2,000 file limit".to_string());
    }

    let package: serde_json::Value = {
        let mut file = archive
            .by_name("extension/package.json")
            .map_err(|_| "VSIX is missing extension/package.json".to_string())?;
        if file.size() > 1024 * 1024 {
            return Err("extension package.json is too large".to_string());
        }
        let mut text = String::new();
        file.read_to_string(&mut text).map_err(|e| e.to_string())?;
        serde_json::from_str(&text).map_err(|e| format!("invalid extension package.json: {e}"))?
    };

    let name = package
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "extension package.json requires name".to_string())?;
    let publisher = package
        .get("publisher")
        .and_then(|v| v.as_str())
        .unwrap_or("community");
    let id = normalized_slug(&format!("{publisher}-{name}"));
    if !valid_slug(&id) {
        return Err("extension publisher/name cannot form a safe identifier".to_string());
    }

    let extensions =
        karat::core_fs::safe_join(root, ".karat/extensions").map_err(|e| e.message())?;
    std::fs::create_dir_all(&extensions).map_err(|e| e.to_string())?;
    let destination = karat::core_fs::safe_join(root, &format!(".karat/extensions/{id}"))
        .map_err(|e| e.message())?;
    let staging = extensions.join(format!(".{id}.installing"));
    if staging.exists() {
        std::fs::remove_dir_all(&staging).map_err(|e| e.to_string())?;
    }
    std::fs::create_dir_all(&staging).map_err(|e| e.to_string())?;

    let extraction = (|| -> Result<(), String> {
        let mut total = 0u64;
        for index in 0..archive.len() {
            let mut file = archive.by_index(index).map_err(|e| e.to_string())?;
            let Some(enclosed) = file.enclosed_name() else {
                return Err("extension contains an unsafe archive path".to_string());
            };
            let Ok(relative) = enclosed.strip_prefix("extension") else {
                continue;
            };
            if relative.as_os_str().is_empty() {
                continue;
            }
            let relative = safe_archive_path(relative)
                .ok_or_else(|| "extension contains an unsafe archive path".to_string())?;
            let target = staging.join(relative);
            if file.is_dir() {
                std::fs::create_dir_all(&target).map_err(|e| e.to_string())?;
                continue;
            }
            let remaining = MAX_EXTENSION_BYTES.saturating_sub(total);
            if file.size() > remaining {
                return Err("extension exceeds the 50 MB extracted limit".to_string());
            }
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut output = std::fs::File::create(target).map_err(|e| e.to_string())?;
            let copied = std::io::copy(&mut file.by_ref().take(remaining + 1), &mut output)
                .map_err(|e| e.to_string())?;
            if copied > remaining {
                return Err("extension exceeds the 50 MB extracted limit".to_string());
            }
            total = total.saturating_add(copied);
            output.flush().map_err(|e| e.to_string())?;
        }

        let contributes = package.get("contributes").cloned().unwrap_or_default();
        let supported = ["themes", "iconThemes", "snippets", "grammars"]
            .into_iter()
            .filter(|key| contributes.get(*key).is_some())
            .collect::<Vec<_>>();
        let display_name = package
            .get("displayName")
            .and_then(|v| v.as_str())
            .unwrap_or(name);
        let author = package
            .get("author")
            .and_then(|v| v.as_str())
            .or_else(|| package.get("publisher").and_then(|v| v.as_str()))
            .unwrap_or("Open VSX publisher");
        let manifest = serde_json::json!({
            "id": id,
            "name": display_name,
            "version": package.get("version").and_then(|v| v.as_str()).unwrap_or("0.0.0"),
            "description": package.get("description").and_then(|v| v.as_str()).unwrap_or("Imported VS Code extension"),
            "author": author,
            "source": source,
            "compatibility": {
                "format": "vscode-vsix",
                "supportedContributions": supported,
                "extensionHost": false
            },
            "commands": []
        });
        let manifest_text = serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?;
        std::fs::write(staging.join("extension.json"), manifest_text).map_err(|e| e.to_string())?;
        Ok(())
    })();

    if let Err(error) = extraction {
        let _ = std::fs::remove_dir_all(&staging);
        return Err(error);
    }
    if destination.exists() {
        std::fs::remove_dir_all(&destination).map_err(|e| e.to_string())?;
    }
    std::fs::rename(staging, destination).map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub async fn install_openvsx_extension(
    state: State<'_, AppState>,
    namespace: String,
    name: String,
    download_url: String,
) -> Result<String, String> {
    if !valid_slug(&namespace) || !valid_slug(&name) {
        return Err("invalid Open VSX extension identifier".to_string());
    }
    let expected = format!("https://open-vsx.org/api/{namespace}/{name}/");
    if !download_url.starts_with(&expected) || !download_url.ends_with(".vsix") {
        return Err("download must be an Open VSX VSIX URL for this extension".to_string());
    }
    let mut response = reqwest::Client::new()
        .get(&download_url)
        .timeout(std::time::Duration::from_secs(45))
        .send()
        .await
        .map_err(|e| format!("Open VSX download failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Open VSX download failed: {e}"))?;
    if response.content_length().unwrap_or(0) > MAX_EXTENSION_BYTES {
        return Err("extension exceeds the 50 MB download limit".to_string());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        if bytes.len().saturating_add(chunk.len()) > MAX_EXTENSION_BYTES as usize {
            return Err("extension exceeds the 50 MB download limit".to_string());
        }
        bytes.extend_from_slice(&chunk);
    }
    let root = root_of(&state);
    let source = format!("open-vsx:{namespace}/{name}");
    tauri::async_runtime::spawn_blocking(move || install_vsix_bytes(&root, &bytes, &source))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub async fn install_vsix(state: State<'_, AppState>, source: String) -> Result<String, String> {
    let path = PathBuf::from(source)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if path.extension().and_then(|v| v.to_str()) != Some("vsix") {
        return Err("select a .vsix file".to_string());
    }
    if path.metadata().map_err(|e| e.to_string())?.len() > MAX_EXTENSION_BYTES {
        return Err("extension exceeds the 50 MB download limit".to_string());
    }
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let root = root_of(&state);
    tauri::async_runtime::spawn_blocking(move || install_vsix_bytes(&root, &bytes, "local-vsix"))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
#[cfg(any(target_os = "android", target_os = "ios"))]
pub async fn install_vsix(state: State<'_, AppState>, source: String) -> Result<String, String> {
    let _ = (&state, source);
    Err("local VSIX import is desktop-only; use Open VSX on mobile".to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubDeviceCode {
    device_code: String,
    user_code: String,
    verification_uri: String,
    expires_in: u64,
    interval: u64,
}

#[tauri::command]
pub async fn github_device_start(client_id: String) -> Result<GitHubDeviceCode, String> {
    if client_id.len() < 10
        || client_id.len() > 128
        || !client_id.bytes().all(|c| c.is_ascii_alphanumeric())
    {
        return Err("enter a valid GitHub OAuth App client ID".to_string());
    }
    let response = reqwest::Client::new()
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .header("User-Agent", "Karat-by-XySpace")
        .form(&[("client_id", client_id.as_str()), ("scope", "read:user")])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())?;
    if response["device_code"].as_str().is_none() {
        return Err(response["error_description"]
            .as_str()
            .or_else(|| response["error"].as_str())
            .unwrap_or("GitHub did not return a device code")
            .to_string());
    }
    Ok(GitHubDeviceCode {
        device_code: response["device_code"]
            .as_str()
            .unwrap_or_default()
            .to_string(),
        user_code: response["user_code"]
            .as_str()
            .unwrap_or_default()
            .to_string(),
        verification_uri: response["verification_uri"]
            .as_str()
            .unwrap_or("https://github.com/login/device")
            .to_string(),
        expires_in: response["expires_in"].as_u64().unwrap_or(900),
        interval: response["interval"].as_u64().unwrap_or(5),
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubDeviceToken {
    access_token: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

#[tauri::command]
pub async fn github_device_poll(
    client_id: String,
    device_code: String,
) -> Result<GitHubDeviceToken, String> {
    let response = reqwest::Client::new()
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .header("User-Agent", "Karat-by-XySpace")
        .form(&[
            ("client_id", client_id.as_str()),
            ("device_code", device_code.as_str()),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())?;
    Ok(GitHubDeviceToken {
        access_token: response["access_token"].as_str().map(str::to_string),
        error: response["error"].as_str().map(str::to_string),
        error_description: response["error_description"].as_str().map(str::to_string),
    })
}

#[derive(Serialize)]
pub struct MobileCommandResult {
    output: String,
    status: i32,
    truncated: bool,
}

#[tauri::command]
#[cfg(target_os = "android")]
pub async fn mobile_term_run(
    state: State<'_, AppState>,
    command: String,
    cwd: String,
) -> Result<MobileCommandResult, String> {
    if command.len() > 4096 {
        return Err("command is too long".to_string());
    }
    let directory = karat::core_fs::safe_join(&root_of(&state), &cwd).map_err(|e| e.message())?;
    if !directory.is_dir() {
        return Err("terminal directory does not exist".to_string());
    }
    let mut child = tokio::process::Command::new("/system/bin/sh");
    child
        .arg("-c")
        .arg(&command)
        .current_dir(directory)
        .kill_on_drop(true);
    let result = tokio::time::timeout(std::time::Duration::from_secs(30), child.output())
        .await
        .map_err(|_| "command timed out after 30 seconds".to_string())?
        .map_err(|e| e.to_string())?;
    let mut bytes = result.stdout;
    bytes.extend_from_slice(&result.stderr);
    let truncated = bytes.len() > 256 * 1024;
    bytes.truncate(256 * 1024);
    Ok(MobileCommandResult {
        output: String::from_utf8_lossy(&bytes).into_owned(),
        status: result.status.code().unwrap_or(-1),
        truncated,
    })
}

#[tauri::command]
#[cfg(not(target_os = "android"))]
pub async fn mobile_term_run(
    state: State<'_, AppState>,
    command: String,
    cwd: String,
) -> Result<MobileCommandResult, String> {
    let _ = (&state, command, cwd);
    Err("the sandbox shell is available on Android only".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extension_slugs_are_bounded_and_portable() {
        assert_eq!(
            normalized_slug("Red Hat.vscode-yaml"),
            "Red-Hat-vscode-yaml"
        );
        assert!(valid_slug("redhat-vscode-yaml"));
        assert!(!valid_slug("../escape"));
        assert!(!valid_slug("has.dot"));
    }

    #[test]
    fn archive_paths_reject_parent_and_absolute_components() {
        assert_eq!(
            safe_archive_path(Path::new("themes/dark.json")),
            Some(PathBuf::from("themes/dark.json"))
        );
        assert_eq!(safe_archive_path(Path::new("../escape")), None);
        assert_eq!(safe_archive_path(Path::new("/absolute")), None);
    }

    #[test]
    fn safe_vsix_import_generates_a_karat_manifest() {
        let cursor = Cursor::new(Vec::new());
        let mut writer = zip::ZipWriter::new(cursor);
        writer
            .start_file(
                "extension/package.json",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
        writer
            .write_all(
                br#"{"name":"sample","publisher":"xyspace","displayName":"Sample","version":"1.2.3","contributes":{"themes":[]}}"#,
            )
            .unwrap();
        writer
            .start_file(
                "extension/themes/dark.json",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
        writer.write_all(br#"{"name":"Dark"}"#).unwrap();
        let bytes = writer.finish().unwrap().into_inner();

        let root = std::env::temp_dir().join(format!("karat-vsix-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        let id = install_vsix_bytes(&root, &bytes, "test").unwrap();
        assert_eq!(id, "xyspace-sample");
        let manifest =
            std::fs::read_to_string(root.join(".karat/extensions/xyspace-sample/extension.json"))
                .unwrap();
        assert!(manifest.contains("\"supportedContributions\": ["));
        assert!(manifest.contains("\"themes\""));
        let _ = std::fs::remove_dir_all(root);
    }
}
