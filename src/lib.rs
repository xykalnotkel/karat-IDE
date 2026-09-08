//! Karat core library — shared by the web backend (Axum) and the desktop app (Tauri).

pub mod core_fs;
pub mod core_git;
/// Native PTY sessions — desktop only (`portable-pty` has no Android/iOS support).
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub mod core_term;

/// C ABI exports for DLL / cdylib build (Windows .dll, Linux .so, macOS .dylib)
pub mod c_api;
