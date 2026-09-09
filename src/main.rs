//! Karat — a lightweight, fast IDE written in Rust.
//!
//! Backend: Axum HTTP + WebSocket API (files, search, git, terminal PTY).
//! Serves the built web UI from `frontend/dist` when present.

mod fs_api;
mod git_api;
mod term;

use axum::{
    body::Body,
    extract::{Request, State},
    http::{header, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Router,
};
use std::{net::IpAddr, path::PathBuf};
use tower_http::{
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Clone)]
pub struct AppState {
    pub root: PathBuf,
    /// Required for every API and terminal request when listening off-machine.
    pub auth_token: Option<String>,
}

fn query_token(uri: &axum::http::Uri) -> Option<&str> {
    uri.query()?.split('&').find_map(|part| {
        let (key, value) = part.split_once('=')?;
        (key == "token").then_some(value)
    })
}

async fn protect_api(
    State(state): State<AppState>,
    request: Request<Body>,
    next: Next,
) -> Response {
    let path = request.uri().path();
    if !path.starts_with("/api/") && !path.starts_with("/ws/") {
        return next.run(request).await;
    }

    let Some(expected) = state.auth_token.as_deref() else {
        return next.run(request).await;
    };
    let bearer = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "));
    let supplied = bearer.or_else(|| query_token(request.uri()));
    if supplied != Some(expected) {
        return (
            StatusCode::UNAUTHORIZED,
            [(header::WWW_AUTHENTICATE, "Bearer")],
            "authentication required",
        )
            .into_response();
    }
    next.run(request).await
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

    // Localhost is safe by default. A non-loopback listener is intentionally
    // impossible without an explicit, reasonably long bearer token.
    let host = std::env::var("KARAT_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let ip: IpAddr = host
        .parse()
        .expect("KARAT_HOST must be an IP address such as 127.0.0.1 or 0.0.0.0");
    let auth_token = std::env::var("KARAT_AUTH_TOKEN")
        .ok()
        .filter(|token| !token.trim().is_empty());
    if !ip.is_loopback() && auth_token.as_ref().is_none_or(|token| token.len() < 16) {
        panic!(
            "KARAT_AUTH_TOKEN (at least 16 characters) is required when KARAT_HOST is not loopback"
        );
    }

    let state = AppState {
        root: root.clone(),
        auth_token,
    };

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
        .route("/api/git/diff", get(git_api::diff))
        .route("/api/git/pull", post(git_api::pull))
        .route("/api/git/push", post(git_api::push))
        .route("/api/terminal/profiles", get(term::profiles))
        .route("/ws/term", get(term::ws_handler))
        .layer(middleware::from_fn_with_state(state.clone(), protect_api))
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let dist = PathBuf::from("frontend/dist");
    if dist.join("index.html").exists() {
        tracing::info!("serving web UI from {}", dist.display());
        let files = ServeDir::new(&dist).not_found_service(ServeFile::new(dist.join("index.html")));
        app = app.fallback_service(files);
    } else {
        tracing::info!(
            "frontend/dist not found — start the UI with `npm run dev` inside frontend/"
        );
    }

    let port: u16 = std::env::var("KARAT_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3000);
    let listener = tokio::net::TcpListener::bind((ip, port))
        .await
        .expect("cannot bind");
    tracing::info!(
        "Karat listening on http://{ip}:{port}  (root: {})",
        root.display()
    );
    axum::serve(listener, app).await.expect("server error");
}
