# Contributing to Karat

Karat is a community-first IDE developed by **XySpace**. Bug fixes, platform testing, documentation, translations, UI improvements, and extension contributions are welcome.

## Start locally

```bash
git clone https://github.com/xykalnotkel/karat-IDE.git
cd karat-IDE
npm run setup
npm run web:build
cargo test --all-targets
npm run tauri:dev
```

See the README for Windows, Linux, Android, and web prerequisites.

## Pull requests

1. Open an issue for large architectural changes.
2. Keep a pull request focused and include tests where practical.
3. Run `cargo fmt --all`, `cargo clippy --all-targets -- -D warnings`, `cargo test --all-targets`, and `npm run web:build`.
4. Never commit credentials, signing keys, generated installers, or personal workspace files.
5. Explain user-visible behavior and attach before/after screenshots for UI work.

## Extension contributions

Extensions live in a named folder containing `extension.json`. Use lowercase IDs with letters, numbers, `-`, or `_`. Extension commands must be explicit user actions; hidden background command execution is not accepted.

## Attribution

Copyright remains with each contributor. By contributing, you agree to license your contribution under the MIT License. Project branding and official releases are coordinated by XySpace.
