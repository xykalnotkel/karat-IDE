//! Karat desktop/mobile shell (Tauri): exposes `karat-core` logic as commands.
//! No HTTP involved — the web UI talks to Rust directly via IPC.
//!
//! Phones can't do everything a PC can: `git` CLI and native PTYs don't exist
//! on Android/iOS, so those commands return a clear error there (the UI hides
//! or degrades them accordingly).

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

/// Private app storage — the workspace home on mobile (no folder picker there).
#[tauri::command]
fn default_root(app: tauri::AppHandle) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
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

// ---------- terminal (desktop only — no PTY support on phones) ----------

#[tauri::command]
#[cfg(not(any(target_os = "android", target_os = "ios")))]
async fn term_spawn(
    state: State<'_, AppState>,
    cols: u16,
    rows: u16,
    on_data: Channel<TermEvent>,
) -> Result<String, String> {
    let session = core_term::spawn(&root_of(&state), cols, rows, move |ev| {
        let _ = on_data.send(ev);
    })?;
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
async fn term_spawn(state: State<'_, AppState>, cols: u16, rows: u16) -> Result<String, String> {
    let _ = (&state, cols, rows);
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
        .unwrap_or_else(|_| {
            std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
        });
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
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
            git_status,
            git_add,
            git_commit,
            term_spawn,
            term_input,
            term_resize,
            term_kill
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Karat");
}
