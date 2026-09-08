//! Axum HTTP wrappers over [`karat::core_fs`] (web mode).

use crate::AppState;
use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};
use karat::core_fs::{self, CoreError};
use serde::Deserialize;

pub type ApiResult<T> = Result<Json<T>, (StatusCode, Json<serde_json::Value>)>;

pub fn err(status: StatusCode, msg: impl Into<String>) -> (StatusCode, Json<serde_json::Value>) {
    (status, Json(serde_json::json!({ "error": msg.into() })))
}

fn map_err(e: CoreError) -> (StatusCode, Json<serde_json::Value>) {
    let status = match e {
        CoreError::BadPath(_) => StatusCode::BAD_REQUEST,
        CoreError::NotFound(_) => StatusCode::NOT_FOUND,
        CoreError::TooLarge(_) => StatusCode::PAYLOAD_TOO_LARGE,
        CoreError::Binary(_) => StatusCode::UNSUPPORTED_MEDIA_TYPE,
        CoreError::Io(_) => StatusCode::INTERNAL_SERVER_ERROR,
    };
    err(status, e.message())
}

#[derive(Deserialize)]
pub struct PathQuery {
    pub path: Option<String>,
}

fn rel(q: &PathQuery) -> &str {
    q.path.as_deref().unwrap_or("")
}

pub async fn list_dir(
    State(state): State<AppState>,
    Query(q): Query<PathQuery>,
) -> ApiResult<Vec<core_fs::Entry>> {
    core_fs::list_dir(&state.root, rel(&q))
        .map(Json)
        .map_err(map_err)
}

pub async fn read_file(
    State(state): State<AppState>,
    Query(q): Query<PathQuery>,
) -> ApiResult<serde_json::Value> {
    core_fs::read_file(&state.root, rel(&q))
        .map(|content| Json(serde_json::json!({ "content": content })))
        .map_err(map_err)
}

#[derive(Deserialize)]
pub struct SaveReq {
    pub path: String,
    pub content: String,
}

pub async fn save_file(
    State(state): State<AppState>,
    Json(req): Json<SaveReq>,
) -> ApiResult<serde_json::Value> {
    core_fs::save_file(&state.root, &req.path, &req.content)
        .map(|_| Json(serde_json::json!({ "ok": true })))
        .map_err(map_err)
}

#[derive(Deserialize)]
pub struct MkdirReq {
    pub path: String,
}

pub async fn make_dir(
    State(state): State<AppState>,
    Json(req): Json<MkdirReq>,
) -> ApiResult<serde_json::Value> {
    core_fs::make_dir(&state.root, &req.path)
        .map(|_| Json(serde_json::json!({ "ok": true })))
        .map_err(map_err)
}

#[derive(Deserialize)]
pub struct DeleteReq {
    pub path: String,
}

pub async fn delete_path(
    State(state): State<AppState>,
    Json(req): Json<DeleteReq>,
) -> ApiResult<serde_json::Value> {
    core_fs::delete_path(&state.root, &req.path)
        .map(|_| Json(serde_json::json!({ "ok": true })))
        .map_err(map_err)
}

#[derive(Deserialize)]
pub struct RenameReq {
    pub from: String,
    pub to: String,
}

pub async fn rename_path(
    State(state): State<AppState>,
    Json(req): Json<RenameReq>,
) -> ApiResult<serde_json::Value> {
    core_fs::rename_path(&state.root, &req.from, &req.to)
        .map(|_| Json(serde_json::json!({ "ok": true })))
        .map_err(map_err)
}

#[derive(Deserialize)]
pub struct SearchQuery {
    pub q: String,
    pub path: Option<String>,
}

pub async fn search(
    State(state): State<AppState>,
    Query(q): Query<SearchQuery>,
) -> ApiResult<core_fs::SearchResults> {
    core_fs::search(&state.root, q.path.as_deref().unwrap_or(""), &q.q)
        .map(Json)
        .map_err(map_err)
}
