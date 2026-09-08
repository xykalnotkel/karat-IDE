// Detects whether the UI runs inside the Tauri desktop shell
// or as a plain web page (Axum backend), and re-exports IPC.

export { invoke } from '@tauri-apps/api/core';

export const isTauri: boolean =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
