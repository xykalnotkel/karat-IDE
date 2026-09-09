// Typed client for Karat's backend — dual transport:
// Tauri IPC commands on desktop, Axum HTTP in the browser.

import { invoke, isTauri } from './transport';

export interface Entry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified: number;
}

export interface Hit {
  path: string;
  line: number;
  text: string;
}

export interface GitFile {
  path: string;
  staged: string;
  unstaged: string;
}

export interface GitStatus {
  repo: boolean;
  branch: string;
  files: GitFile[];
}

export interface GitDiff {
  path: string;
  staged: boolean;
  content: string;
  truncated: boolean;
}

// Remote web mode can be opened as `https://host/?token=...`. Keep the
// URL-safe token for API/WebSocket requests, then remove it from browser history.
const pageToken = new URLSearchParams(location.search).get('token');
if (pageToken && /^[A-Za-z0-9._~-]{16,}$/.test(pageToken)) {
  sessionStorage.setItem('karat:auth-token', pageToken);
  history.replaceState(null, '', `${location.pathname}${location.hash}`);
}
export const webAuthToken = sessionStorage.getItem('karat:auth-token') || '';

async function req<T>(input: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  if (webAuthToken) headers.set('Authorization', `Bearer ${webAuthToken}`);
  const res = await fetch(input, {
    ...init,
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  return data as T;
}

const post = <T,>(url: string, body: unknown) =>
  req<T>(url, { method: 'POST', body: JSON.stringify(body) });

export const api = {
  list: (path = ''): Promise<Entry[]> =>
    isTauri
      ? invoke('list_dir', { path })
      : req(`/api/list?path=${encodeURIComponent(path)}`),

  read: (path: string): Promise<{ content: string }> =>
    isTauri
      ? invoke<string>('read_file', { path }).then((content) => ({ content }))
      : req(`/api/file?path=${encodeURIComponent(path)}`),

  save: (path: string, content: string): Promise<{ ok: boolean }> =>
    isTauri
      ? invoke('save_file', { path, content }).then(() => ({ ok: true }))
      : post('/api/save', { path, content }),

  mkdir: (path: string): Promise<{ ok: boolean }> =>
    isTauri ? invoke('make_dir', { path }).then(() => ({ ok: true })) : post('/api/mkdir', { path }),

  remove: (path: string): Promise<{ ok: boolean }> =>
    isTauri
      ? invoke('delete_path', { path }).then(() => ({ ok: true }))
      : post('/api/delete', { path }),

  rename: (from: string, to: string): Promise<{ ok: boolean }> =>
    isTauri
      ? invoke('rename_path', { from, to }).then(() => ({ ok: true }))
      : post('/api/rename', { from, to }),

  search: (q: string, path = ''): Promise<{ results: Hit[]; truncated: boolean }> =>
    isTauri
      ? invoke('search_files', { q, path })
      : req(`/api/search?q=${encodeURIComponent(q)}&path=${encodeURIComponent(path)}`),

  gitStatus: (): Promise<GitStatus> =>
    isTauri ? invoke('git_status', { path: '' }) : req('/api/git'),

  gitAdd: (paths: string[]): Promise<{ ok: boolean; output: string }> =>
    isTauri ? invoke('git_add', { paths }) : post('/api/git/add', { paths }),

  gitCommit: (message: string): Promise<{ ok: boolean; output: string }> =>
    isTauri ? invoke('git_commit', { message }) : post('/api/git/commit', { message }),

  gitDiff: (path: string, staged: boolean): Promise<GitDiff> =>
    isTauri
      ? invoke('git_diff', { path, staged })
      : req(`/api/git/diff?path=${encodeURIComponent(path)}&staged=${staged}`),

  gitPull: (): Promise<{ ok: boolean; output: string }> =>
    isTauri ? invoke('git_pull') : post('/api/git/pull', {}),

  gitPush: (): Promise<{ ok: boolean; output: string }> =>
    isTauri ? invoke('git_push') : post('/api/git/push', {}),
};
