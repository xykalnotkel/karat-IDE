# Security Policy

## Reporting a vulnerability

Please do not open a public issue for an unpatched vulnerability. Report it privately through GitHub Security Advisories for this repository.

Include affected versions, reproduction steps, impact, and a suggested fix when possible.

## Security model

- Desktop and Android builds use Tauri IPC; they do not expose the Axum HTTP server.
- Web mode listens on `127.0.0.1` by default.
- Binding web mode to a non-loopback address requires `KARAT_AUTH_TOKEN` with at least 16 URL-safe characters.
- Filesystem operations are restricted to the workspace root and reject path traversal and symbolic-link escapes.
- Extension installation rejects symbolic links, unsafe VSIX archive paths, oversized downloads, and excessive file counts. Imported VSIX JavaScript is never executed by an Extension Host. Declarative terminal commands still run with the user's permissions only after an explicit action; review manifests first.
- GitHub tokens are kept in WebView session storage, are never written to a workspace, and are cleared with the session. Prefer a least-privilege fine-grained token.
- Android shell commands start in the private workspace, remain subject to the Android application sandbox, are capped at 30 seconds and 256 KB of returned output, and run without root privileges.
- Never commit API keys, signing material, or environment files. Use repository/environment secrets in CI.

## Supported versions

Only the latest release and the current `main` branch receive security fixes while Karat is pre-1.0.
