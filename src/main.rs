//! Karat — a lightweight, fast IDE written in Rust.
//!
//! Backend: Axum HTTP + WebSocket API (files, search, git, terminal PTY).
//! Serves the built web UI from `frontend/dist` when present (single-port mode),
//! otherwise pair it with the Vite dev server (`npm run dev` inside `frontend/`).

mod fs_api;
mod git_api;
mod term;

use axum::{
    routing::{get, post},
    Router,
};
use std::path::PathBuf;
use tower_http::{
    cors::CorsLayer,
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Clone)]
pub struct AppState {
    pub root: PathBuf,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "karat=debug,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let root_arg = std::env::var("KARAT_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("workspace"));
    if !root_arg.exists() {
        std::fs::create_dir_all(&root_arg).expect("cannot create workspace dir");
    }
    let root = root_arg
        .canonicalize()
        .expect("cannot canonicalize workspace root");

    let state = AppState { root: root.clone() };

    let mut app: Router = Router::new()
        .route("/api/health", get(|| async { "ok" }))
        .route("/api/list", get(fs_api::list_dir))
        .route("/api/file", get(fs_api::read_file))
        .route("/api/save", post(fs_api::save_file))
        .route("/api/mkdir", post(fs_api::make_dir))
        .route("/api/delete", post(fs_api::delete_path))
        .route("/api/rename", post(fs_api::rename_path))
        .route("/api/search", get(fs_api::search))
        .route("/api/git", get(git_api::status))
        .route("/api/git/add", post(git_api::add))
        .route("/api/git/commit", post(git_api::commit))
        .route("/ws/term", get(term::ws_handler))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    // Single-port mode: serve the built web UI if it exists.
    let dist = PathBuf::from("frontend/dist");
    if dist.join("index.html").exists() {
        tracing::info!("serving web UI from {}", dist.display());
        let files =
            ServeDir::new(&dist).not_found_service(ServeFile::new(dist.join("index.html")));
        app = app.fallback_service(files);
    } else {
        tracing::info!("frontend/dist not found — start the UI with `npm run dev` inside frontend/");
    }

    let port: u16 = std::env::var("KARAT_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3000);
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port))
        .await
        .expect("cannot bind");
    tracing::info!(
        "Karat listening on http://0.0.0.0:{port}  (root: {})",
        root.display()
    );
    axum::serve(listener, app).await.expect("server error");
}
