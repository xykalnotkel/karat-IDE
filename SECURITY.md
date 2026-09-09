# Security Policy

## Reporting a vulnerability

Please do not open a public issue for an unpatched vulnerability. Report it privately through GitHub Security Advisories for this repository.

Include affected versions, reproduction steps, impact, and a suggested fix when possible.

## Security model

- Desktop and Android builds use Tauri IPC; they do not expose the Axum HTTP server.
- Web mode listens on `127.0.0.1` by default.
- Binding web mode to a non-loopback address requires `KARAT_AUTH_TOKEN` with at least 16 URL-safe characters.
- Filesystem operations are restricted to the workspace root and reject path traversal and symbolic-link escapes.
- Extension installation rejects symbolic links and limits copied content. Declarative terminal commands still execute with the user's permissions, but only after an explicit action; review manifests before running them.
- Never commit API keys, signing material, or environment files. Use repository/environment secrets in CI.

## Supported versions

Only the latest release and the current `main` branch receive security fixes while Karat is pre-1.0.
