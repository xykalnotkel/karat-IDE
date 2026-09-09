//! Terminal core: native PTY sessions shared by Axum (WebSocket) and Tauri (Channel).
//!
//! Output bytes are delivered through the `emit` callback as [`TermEvent`]s
//! (base64 payload, so any byte sequence survives JSON transport).

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use portable_pty::{Child, CommandBuilder, MasterPty, NativePtySystem, PtySize, PtySystem};
use serde::Serialize;
use std::io::{Read, Write};
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
pub struct TermEvent {
    pub t: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub d: Option<String>,
}

impl TermEvent {
    pub fn out(bytes: &[u8]) -> Self {
        Self {
            t: "out".to_string(),
            d: Some(B64.encode(bytes)),
        }
    }

    pub fn exit() -> Self {
        Self {
            t: "exit".to_string(),
            d: None,
        }
    }
}

pub struct TermSession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn Child + Send + Sync>,
}

impl TermSession {
    pub fn input(&mut self, bytes: &[u8]) -> Result<(), String> {
        self.writer.write_all(bytes).map_err(|e| e.to_string())?;
        self.writer.flush().map_err(|e| e.to_string())
    }

    pub fn input_b64(&mut self, data: &str) -> Result<(), String> {
        let bytes = B64.decode(data).map_err(|e| e.to_string())?;
        self.input(&bytes)
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), String> {
        self.master
            .resize(PtySize {
                rows: rows.clamp(5, 200),
                cols: cols.clamp(20, 500),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())
    }

    pub fn kill(&mut self) -> Result<(), String> {
        // Best effort — the reader thread exits on its own once the slave closes.
        let _ = self.child.kill();
        Ok(())
    }
}

/// Spawn a shell attached to a new PTY. Output/exit events go to `emit`
/// from a dedicated reader thread.
pub fn spawn<F>(root: &Path, cols: u16, rows: u16, emit: F) -> Result<TermSession, String>
where
    F: Fn(TermEvent) + Send + 'static,
{
    let pty_system = NativePtySystem::default();
    let pair = pty_system
        .openpty(PtySize {
            rows: rows.clamp(5, 200),
            cols: cols.clamp(20, 500),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("cannot open pty: {e}"))?;

    #[cfg(windows)]
    let shell = std::env::var("COMSPEC").unwrap_or_else(|_| String::from("cmd.exe"));
    #[cfg(not(windows))]
    let shell = std::env::var("SHELL").unwrap_or_else(|_| String::from("bash"));

    let mut cmd = CommandBuilder::new(shell);
    cmd.cwd(root.as_os_str());
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");

    let slave = pair.slave;
    let child = slave
        .spawn_command(cmd)
        .map_err(|e| format!("cannot spawn shell: {e}"))?;
    drop(slave);

    let pty = pair.master;
    let mut reader = pty
        .try_clone_reader()
        .map_err(|e| format!("cannot read pty: {e}"))?;
    let writer = pty
        .take_writer()
        .map_err(|e| format!("cannot write pty: {e}"))?;

    std::thread::Builder::new()
        .name("karat-pty-reader".to_string())
        .spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => emit(TermEvent::out(&buf[..n])),
                    Err(_) => break, // EIO etc. — slave side closed
                }
            }
            emit(TermEvent::exit());
        })
        .map_err(|e| format!("cannot spawn reader thread: {e}"))?;

    Ok(TermSession {
        writer,
        master: pty,
        child,
    })
}
