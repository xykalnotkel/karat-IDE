//! Axum WebSocket wrapper over [`karat::core_term`] (web mode).
//!
//! Wire protocol (JSON text frames):
//!   client -> server: {"t":"in","d": base64}        keystrokes
//!   client -> server: {"t":"rs","cols":N,"rows":M}  resize
//!   server -> client: {"t":"out","d": base64}       pty output
//!   server -> client: {"t":"exit"}                  shell exited

use crate::AppState;
use axum::{
    extract::{
        ws::{Message, WebSocket},
        Query, State, WebSocketUpgrade,
    },
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use karat::core_term;
use serde::Deserialize;

pub async fn profiles() -> axum::Json<Vec<core_term::ShellProfile>> {
    axum::Json(core_term::available_shells())
}

#[derive(Deserialize)]
pub struct TermQuery {
    pub cols: Option<u16>,
    pub rows: Option<u16>,
    pub profile: Option<String>,
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Query(q): Query<TermQuery>,
) -> impl IntoResponse {
    let cols = q.cols.unwrap_or(80).clamp(20, 500);
    let rows = q.rows.unwrap_or(24).clamp(5, 200);
    ws.on_upgrade(move |socket| handle(socket, state, cols, rows, q.profile))
}

async fn handle(socket: WebSocket, state: AppState, cols: u16, rows: u16, profile: Option<String>) {
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<core_term::TermEvent>();
    let mut session =
        match core_term::spawn(&state.root, cols, rows, profile.as_deref(), move |ev| {
            let _ = tx.send(ev);
        }) {
            Ok(s) => s,
            Err(e) => {
                let mut s = socket;
                let _ = s
                    .send(Message::Text(
                        serde_json::json!({"t": "err", "d": e}).to_string(),
                    ))
                    .await;
                return;
            }
        };

    let (mut sender, mut receiver) = socket.split();

    loop {
        tokio::select! {
            Some(ev) = rx.recv() => {
                let msg = serde_json::to_string(&ev).unwrap_or_default();
                if sender.send(Message::Text(msg)).await.is_err() {
                    break;
                }
            }
            msg = receiver.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                            match v.get("t").and_then(|t| t.as_str()) {
                                Some("in") => {
                                    if let Some(d) = v.get("d").and_then(|d| d.as_str()) {
                                        let _ = session.input_b64(d);
                                    }
                                }
                                Some("rs") => {
                                    let c = v.get("cols").and_then(|c| c.as_u64()).unwrap_or(80).clamp(20, 500) as u16;
                                    let r = v.get("rows").and_then(|r| r.as_u64()).unwrap_or(24).clamp(5, 200) as u16;
                                    let _ = session.resize(c, r);
                                }
                                _ => {}
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    _ => {}
                }
            }
        }
    }

    let _ = session.kill();
}
