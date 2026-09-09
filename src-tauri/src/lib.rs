//! Karat desktop/mobile shell (Tauri): exposes `karat-core` logic as commands.
//! No HTTP involved — the web UI talks to Rust directly via IPC.
//!
//! Phones can't do everything a PC can: `git` CLI and native PTYs don't exist
//! on Android/iOS, so those commands return a clear error there (the UI hides
//! or degrades them accordingly).

mod integrations;

use integrations::{
    github_device_poll, github_device_start, install_openvsx_extension, install_vsix,
    mobile_term_run,
};
use karat::core_fs::{self, CoreError};
use karat::core_git;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
use karat::core_term::{self, TermEvent, TermSession};
#[cfg(not(any(target_os = "android", target_os = "ios")))]
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri::ipc::Channel;
use tauri::{Manager, State};

struct AppState {
    root: Mutex<PathBuf>,
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    terms: Mutex<HashMap<String, TermSession>>,
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    term_seq: Mutex<u64>,
}

fn root_of(state: &State<AppState>) -> PathBuf {
    state.root.lock().expect("root lock").clone()
}

fn msg(e: CoreError) -> String {
    e.message()
}

// ---------- workspace root ----------

#[tauri::command]
fn get_root(state: State<AppState>) -> String {
    root_of(&state).to_string_lossy().into_owned()
}

#[tauri::command]
fn set_root(state: State<AppState>, path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    if !p.is_dir() {
        return Err(format!("folder not found: {path}"));
    }
    let canon = p.canonicalize().map_err(|e| e.to_string())?;
    *state.root.lock().expect("root lock") = canon.clone();
    Ok(canon.to_string_lossy().into_owned())
}

/// A writable first-run workspace. Desktop uses the user's profile folder
/// (`C:\\Users\\<name>\\Karat Workspace` on Windows); mobile uses private app
/// storage. Users can still switch to any folder on desktop.
#[tauri::command]
fn default_root(app: tauri::AppHandle) -> Result<String, String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let base = app
        .path()
        .home_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| e.to_string())?;

    let dir = base.join("Karat Workspace");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().into_owned())
}

// ---------- files ----------

#[tauri::command]
fn list_dir(state: State<AppState>, path: String) -> Result<Vec<core_fs::Entry>, String> {
    core_fs::list_dir(&root_of(&state), &path).map_err(msg)
}

#[tauri::command]
fn read_file(state: State<AppState>, path: String) -> Result<String, String> {
    core_fs::read_file(&root_of(&state), &path).map_err(msg)
}

#[tauri::command]
fn save_file(state: State<AppState>, path: String, content: String) -> Result<(), String> {
    core_fs::save_file(&root_of(&state), &path, &content).map_err(msg)
}

#[tauri::command]
fn make_dir(state: State<AppState>, path: String) -> Result<(), String> {
    core_fs::make_dir(&root_of(&state), &path).map_err(msg)
}

#[tauri::command]
fn delete_path(state: State<AppState>, path: String) -> Result<(), String> {
    core_fs::delete_path(&root_of(&state), &path).map_err(msg)
}

#[tauri::command]
fn rename_path(state: State<AppState>, from: String, to: String) -> Result<(), String> {
    core_fs::rename_path(&root_of(&state), &from, &to).map_err(msg)
}

#[tauri::command]
fn search_files(
    state: State<AppState>,
    q: String,
    path: String,
) -> Result<core_fs::SearchResults, String> {
    core_fs::search(&root_of(&state), &path, &q).map_err(msg)
}

// ---------- workspace extensions ----------

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn copy_extension_tree(
    source: &std::path::Path,
    destination: &std::path::Path,
) -> Result<(), String> {
    const MAX_FILES: usize = 2_000;
    const MAX_BYTES: u64 = 50 * 1024 * 1024;
    let mut stack = vec![(source.to_path_buf(), destination.to_path_buf())];
    let mut files = 0usize;
    let mut bytes = 0u64;

    while let Some((from, to)) = stack.pop() {
        std::fs::create_dir_all(&to).map_err(|e| e.to_string())?;
        for entry in std::fs::read_dir(&from).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let kind = entry.file_type().map_err(|e| e.to_string())?;
            if kind.is_symlink() {
                return Err("extension folders cannot contain symbolic links".to_string());
            }
            let target = to.join(entry.file_name());
            if kind.is_dir() {
                stack.push((entry.path(), target));
            } else if kind.is_file() {
                files += 1;
                bytes += entry.metadata().map_err(|e| e.to_string())?.len();
                if files > MAX_FILES || bytes > MAX_BYTES {
                    return Err("extension exceeds the 2,000 file / 50 MB safety limit".to_string());
                }
                std::fs::copy(entry.path(), target).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

#[tauri::command]
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn install_extension(state: State<AppState>, source: String) -> Result<String, String> {
    let source = PathBuf::from(source)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !source.is_dir() {
        return Err("select an extension folder".to_string());
    }
    let manifest_path = source.join("extension.json");
    let manifest = std::fs::read_to_string(&manifest_path)
        .map_err(|_| "extension.json is required in the selected folder".to_string())?;
    let value: serde_json::Value =
        serde_json::from_str(&manifest).map_err(|e| format!("invalid extension.json: {e}"))?;
    let id = value
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "extension.json requires a string id".to_string())?;
    if id.is_empty()
        || id.len() > 80
        || !id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
    {
        return Err("extension id may only contain letters, numbers, '-' and '_'".to_string());
    }
    if value.get("name").and_then(|v| v.as_str()).is_none() {
        return Err("extension.json requires a string name".to_string());
    }

    let root = root_of(&state);
    let extensions = core_fs::safe_join(&root, ".karat/extensions").map_err(msg)?;
    std::fs::create_dir_all(&extensions).map_err(|e| e.to_string())?;
    let destination = core_fs::safe_join(&root, &format!(".karat/extensions/{id}")).map_err(msg)?;
    let staging = extensions.join(format!(".{id}.installing"));
    if staging.exists() {
        std::fs::remove_dir_all(&staging).map_err(|e| e.to_string())?;
    }
    copy_extension_tree(&source, &staging)?;
    if destination.exists() {
        std::fs::remove_dir_all(&destination).map_err(|e| e.to_string())?;
    }
    std::fs::rename(&staging, &destination).map_err(|e| e.to_string())?;
    Ok(id.to_string())
}

#[tauri::command]
#[cfg(any(target_os = "android", target_os = "ios"))]
fn install_extension(state: State<AppState>, source: String) -> Result<String, String> {
    let _ = (&state, source);
    Err("installing extension folders is desktop-only".to_string())
}

// ---------- git (desktop only — phones have no `git` CLI) ----------

#[tauri::command]
#[cfg(not(any(target_os = "android", target_os = "ios")))]
async fn git_status(
    state: State<'_, AppState>,
    path: String,
) -> Result<core_git::GitStatus, String> {
    let root = root_of(&state);
    let dir = core_git::repo_dir(&root, &path);
    core_git::status(&dir).await.map_err(msg)
}

#[tauri::command]
#[cfg(any(target_os = "android", target_os = "ios"))]
async fn git_status(
    state: State<'_, AppState>,
    path: String,
) -> Result<core_git::GitStatus, String> {
    let _ = (&state, path);
    Err("Git is not available on mobile yet".to_string())
}

#[tauri::command]
#[cfg(not(any(target_os = "android", target_os = "ios")))]
async fn git_add(
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<core_git::GitOutput, String> {
    core_git::add(&root_of(&state), &paths).await.map_err(msg)
}

#[tauri::command]
#[cfg(any(target_os = "android", target_os = "ios"))]
async fn git_add(
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<core_git::GitOutput, String> {
    let _ = (&state, paths);
    Err("Git is not available on mobile yet".to_string())
}

#[tauri::command]
#[cfg(not(any(target_os = "android", target_os = "ios")))]
async fn git_commit(
    state: State<'_, AppState>,
    message: String,
) -> Result<core_git::GitOutput, String> {
    core_git::commit(&root_of(&state), &message)
        .await
        .map_err(msg)
}

#[tauri::command]
#[cfg(any(target_os = "android", target_os = "ios"))]
async fn git_commit(
    state: State<'_, AppState>,
    message: String,
) -> Result<core_git::GitOutput, String> {
    let _ = (&state, message);
    Err("Git is not available on mobile yet".to_string())
}

#[tauri::command]
#[cfg(not(any(target_os = "android", target_os = "ios")))]
async fn git_diff(
    state: State<'_, AppState>,
    path: String,
    staged: bool,
) -> Result<core_git::GitDiff, String> {
    core_git::diff(&root_of(&state), &path, staged)
        .await
        .map_err(msg)
}

#[tauri::command]
#[cfg(any(target_os = "android", target_os = "ios"))]
async fn git_diff(
    state: State<'_, AppState>,
    path: String,
    staged: bool,
) -> Result<serde_json::Value, String> {
    let _ = (&state, path, staged);
    Err("Git is not available on mobile yet".to_string())
}

#[tauri::command]
#[cfg(not(any(target_os = "android", target_os = "ios")))]
async fn git_pull(state: State<'_, AppState>) -> Result<core_git::GitOutput, String> {
    core_git::pull(&root_of(&state)).await.map_err(msg)
}

#[tauri::command]
#[cfg(any(target_os = "android", target_os = "ios"))]
async fn git_pull(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let _ = &state;
    Err("Git is not available on mobile yet".to_string())
}

#[tauri::command]
#[cfg(not(any(target_os = "android", target_os = "ios")))]
async fn git_push(state: State<'_, AppState>) -> Result<core_git::GitOutput, String> {
    core_git::push(&root_of(&state)).await.map_err(msg)
}

#[tauri::command]
#[cfg(any(target_os = "android", target_os = "ios"))]
async fn git_push(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let _ = &state;
    Err("Git is not available on mobile yet".to_string())
}

// ---------- terminal (desktop PTY; Android uses the bounded command console) ----------

#[tauri::command]
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn term_profiles() -> Vec<core_term::ShellProfile> {
    core_term::available_shells()
}

#[tauri::command]
#[cfg(any(target_os = "android", target_os = "ios"))]
fn term_profiles() -> Vec<serde_json::Value> {
    Vec::new()
}

#[tauri::command]
#[cfg(not(any(target_os = "android", target_os = "ios")))]
async fn term_spawn(
    state: State<'_, AppState>,
    cols: u16,
    rows: u16,
    profile: Option<String>,
    on_data: Channel<TermEvent>,
) -> Result<String, String> {
    let session = core_term::spawn(
        &root_of(&state),
        cols,
        rows,
        profile.as_deref(),
        move |ev| {
            let _ = on_data.send(ev);
        },
    )?;
    let mut seq = state.term_seq.lock().expect("seq lock");
    *seq += 1;
    let id = format!("term-{seq}");
    state
        .terms
        .lock()
        .expect("terms lock")
        .insert(id.clone(), session);
    Ok(id)
}

#[tauri::command]
#[cfg(any(target_os = "android", target_os = "ios"))]
async fn term_spawn(
    state: State<'_, AppState>,
    cols: u16,
    rows: u16,
    profile: Option<String>,
) -> Result<String, String> {
    let _ = (&state, cols, rows, profile);
    Err("Terminal is not available on mobile yet".to_string())
}

#[tauri::command]
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn term_input(state: State<AppState>, id: String, data: String) -> Result<(), String> {
    let mut terms = state.terms.lock().expect("terms lock");
    let s = terms
        .get_mut(&id)
        .ok_or_else(|| "no such terminal".to_string())?;
    s.input_b64(&data)
}

#[tauri::command]
#[cfg(any(target_os = "android", target_os = "ios"))]
fn term_input(state: State<AppState>, id: String, data: String) -> Result<(), String> {
    let _ = (&state, id, data);
    Err("Terminal is not available on mobile yet".to_string())
}

#[tauri::command]
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn term_resize(state: State<AppState>, id: String, cols: u16, rows: u16) -> Result<(), String> {
    let terms = state.terms.lock().expect("terms lock");
    let s = terms
        .get(&id)
        .ok_or_else(|| "no such terminal".to_string())?;
    s.resize(cols, rows)
}

#[tauri::command]
#[cfg(any(target_os = "android", target_os = "ios"))]
fn term_resize(state: State<AppState>, id: String, cols: u16, rows: u16) -> Result<(), String> {
    let _ = (&state, id, cols, rows);
    Err("Terminal is not available on mobile yet".to_string())
}

#[tauri::command]
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn term_kill(state: State<AppState>, id: String) -> Result<(), String> {
    let mut terms = state.terms.lock().expect("terms lock");
    if let Some(mut s) = terms.remove(&id) {
        s.kill()?;
    }
    Ok(())
}

#[tauri::command]
#[cfg(any(target_os = "android", target_os = "ios"))]
fn term_kill(state: State<AppState>, id: String) -> Result<(), String> {
    let _ = (&state, id);
    Err("Terminal is not available on mobile yet".to_string())
}

// ---------- app ----------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let initial_root = std::env::var("KARAT_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            root: Mutex::new(initial_root),
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            terms: Mutex::new(HashMap::new()),
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            term_seq: Mutex::new(0),
        })
        .invoke_handler(tauri::generate_handler![
            get_root,
            set_root,
            default_root,
            list_dir,
            read_file,
            save_file,
            make_dir,
            delete_path,
            rename_path,
            search_files,
            install_extension,
            install_openvsx_extension,
            install_vsix,
            github_device_start,
            github_device_poll,
            mobile_term_run,
            git_status,
            git_add,
            git_commit,
            git_diff,
            git_pull,
            git_push,
            term_profiles,
            term_spawn,
            term_input,
            term_resize,
            term_kill
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Karat");
}
