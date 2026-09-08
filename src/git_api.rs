//! Axum HTTP wrappers over [`karat::core_git`] (web mode).

use crate::fs_api::{err, ApiResult, PathQuery};
use crate::AppState;
use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};
use karat::core_fs::CoreError;
use karat::core_git;
use serde::Deserialize;

fn map_err(e: CoreError) -> (StatusCode, Json<serde_json::Value>) {
    let status = match e {
        CoreError::BadPath(_) => StatusCode::BAD_REQUEST,
        CoreError::NotFound(_) => StatusCode::NOT_FOUND,
        _ => StatusCode::INTERNAL_SERVER_ERROR,
    };
    err(status, e.message())
}

pub async fn status(
    State(state): State<AppState>,
    Query(q): Query<PathQuery>,
) -> ApiResult<core_git::GitStatus> {
    let dir = core_git::repo_dir(&state.root, q.path.as_deref().unwrap_or(""));
    core_git::status(&dir).await.map(Json).map_err(map_err)
}

#[derive(Deserialize)]
pub struct AddReq {
    pub paths: Vec<String>,
}

pub async fn add(
    State(state): State<AppState>,
    Json(req): Json<AddReq>,
) -> ApiResult<core_git::GitOutput> {
    core_git::add(&state.root, &req.paths)
        .await
        .map(Json)
        .map_err(map_err)
}

#[derive(Deserialize)]
pub struct CommitReq {
    pub message: String,
}

pub async fn commit(
    State(state): State<AppState>,
    Json(req): Json<CommitReq>,
) -> ApiResult<core_git::GitOutput> {
    core_git::commit(&state.root, &req.message)
        .await
        .map(Json)
        .map_err(map_err)
}
