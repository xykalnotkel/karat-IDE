# Karat 🦀

**Karat** adalah IDE desktop ringan dan cepat yang ditulis dengan **Rust + Tauri** —
terinspirasi dari VS Code, tapi dengan backend native yang ramping.

> Status: **v0.1.0** — aplikasi desktop jadi. Build Windows menghasilkan
> `Karat-setup.exe` (NSIS) + `Karat.msi` (WiX).

---

## ✨ Fitur

| Area | Fitur |
|---|---|
| 📝 Editor | Monaco Editor (mesin yang sama dengan VS Code), 40+ bahasa, minimap, multi-tab, dirty indicator, sticky scroll |
| 📁 Explorer | Tree file, Open Folder (dialog native), new/rename/delete |
| 🔍 Search | Cari teks ke seluruh workspace |
| 💻 Terminal | PTY asli + xterm.js, profile PowerShell/cmd/WSL/Bash/Zsh/Fish/Nushell |
| ▶️ Run | "Run Active File" — otomatis `cargo run` / `npm run dev` / `python3` / `node` / … |
| ⎇ Git | Branch di statusbar, changes (staged/unstaged/untracked), stage, commit |
| ⌨️ Palette | Quick open fuzzy (`Ctrl+P`) + command palette (`Ctrl+Shift+P`) |
| 🎨 Tema | Dark & light mode |

---

## 🪟 Build untuk Windows (.exe + .msi)

### Prasyarat (sekali saja)

1. **Rust** — install via [rustup](https://rustup.rs).
2. **Microsoft C++ Build Tools** — hanya toolchain/linker untuk **mengompilasi** aplikasi Rust target Windows. Karat tidak dibuat dengan Visual Studio dan pengguna installer tidak perlu memasang Visual Studio.
3. **Node.js 20+** — hanya untuk proses build frontend.

Karat menggunakan Tauri WebView2, tetapi seluruh UI, Monaco, CSS, dan JavaScript dibundel lokal. Installer Windows menyertakan WebView2 Offline Installer sehingga instalasi dan penggunaan editor tidak membutuhkan internet.

> WiX & NSIS otomatis diunduh oleh Tauri saat build pertama. Signing/publish
> ke Microsoft Store butuh sertifikat (opsional, nanti saja).

### Build installer

```powershell
git clone <repo-karat>
cd karat

npm run setup        # install deps root + frontend (sekali saja)
npm run tauri:build  # → .exe + .msi
```

Hasilnya ada di:

```
src-tauri\target\release\bundle\nsis\Karat_0.1.0_x64-setup.exe
src-tauri\target\release\bundle\msi\Karat_0.1.0_x64_en-US.msi
```

### Mode dev di Windows (hot-reload UI)

```powershell
npm run tauri:dev
```

---

## 🐧 Build Linux

Prasyarat Debian/Ubuntu:

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

Lalu jalankan `npm run setup` → `npm run tauri:build`. Build Linux menghasilkan `.deb`, `.rpm`, dan `.AppImage`.

## 🤖 Build Android

Android membutuhkan Android Studio/SDK, NDK 27, Java 17, dan target Rust Android. Setelah environment Android siap:

```bash
npm run setup
npm run android:init       # hanya jika src-tauri/gen/android belum ada
npm run android:build      # APK + AAB untuk ARM 32-bit dan ARM 64-bit
```

CI menghasilkan universal APK/AAB self-signed yang memuat `armeabi-v7a` (32-bit) dan `arm64-v8a` (64-bit). `minSdk 24` berarti perangkat Android 7 hingga Android terbaru—termasuk Android API 32—didukung.

Build mobile menggunakan private app storage. Editor, explorer, save, dan search tersedia; Git CLI, PTY terminal, serta runner disembunyikan karena tidak tersedia secara native di Android.

## 🌐 Mode web (opsional, buat dev/preview)

Backend yang sama tetap bisa jalan sebagai server web:

```bash
cargo run                  # backend :3000 (single-port, serve frontend/dist)
# atau frontend terpisah:
cd frontend && npm run dev # UI :5173 (proxy /api + /ws ke backend)
```

| Env var | Default | Fungsi |
|---|---|---|
| `KARAT_ROOT` | `./workspace` | Folder workspace web |
| `KARAT_HOST` | `127.0.0.1` | IP listener backend web |
| `KARAT_PORT` | `3000` | Port backend web |
| `KARAT_AUTH_TOKEN` | kosong | Wajib (minimal 16 karakter URL-safe) jika host bukan loopback |

Web mode aman secara default karena hanya menerima koneksi localhost. Untuk akses LAN/container:

```bash
KARAT_HOST=0.0.0.0 KARAT_AUTH_TOKEN='ganti-dengan-token-random-panjang' cargo run
```

Buka `http://server:3000/?token=ganti-dengan-token-random-panjang`. Token disimpan hanya di `sessionStorage` dan langsung dihapus dari address bar. Jangan mengekspos web mode langsung ke internet; tetap gunakan HTTPS/reverse proxy.

## 📂 Lokasi workspace

Pada first run, Karat membuat lokasi writable milik user:

- Windows: `C:\\Users\\<user>\\Documents\\Karat Workspace`
- Linux: `~/Documents/Karat Workspace`
- Android: private app storage

Desktop tetap bisa membuka folder lain melalui **File → Open Folder**.

## 🧩 Extension API v1

Karat memuat extension deklaratif dari `.karat/extensions.json` di workspace. Extension v1 dapat menambahkan command terminal tanpa mengeksekusi JavaScript asing secara otomatis:

```json
{
  "extensions": [
    {
      "id": "project-tools",
      "name": "Project Tools",
      "version": "1.0.0",
      "commands": [
        { "id": "test", "title": "Run tests", "terminal": "npm test" }
      ]
    }
  ]
}
```

Command muncul di Command Palette. Dukungan themes, snippets, language grammars, dan adapter subset VS Code direncanakan bertahap; kompatibilitas seluruh VS Code Extension Host bukan klaim v1.

## 💻 Terminal profiles

Karat mendeteksi shell yang benar-benar terpasang dan menyediakan selector profile. Kandidatnya mencakup PowerShell 7, Windows PowerShell, Command Prompt, WSL, Bash, Zsh, Fish, Nushell, dan POSIX shell. Android tidak menyediakan PTY native.

---

## 🏗️ Arsitektur

```
karat/
├── src/                      # karat-core (Rust lib, dipakai web + desktop)
│   ├── core_fs.rs            # Filesystem + search (path selalu divalidasi)
│   ├── core_git.rs           # Git via CLI: status --porcelain, add, commit
│   ├── core_term.rs          # Terminal: PTY native (portable-pty)
│   ├── main.rs / fs_api.rs / git_api.rs / term.rs   # Server web Axum (opsional)
├── src-tauri/                # Aplikasi desktop
│   ├── src/lib.rs            # 16 Tauri commands (IPC, tanpa HTTP)
│   ├── tauri.conf.json       # Konfig bundle: NSIS + MSI + updater-ready
│   ├── capabilities/         # Izin minimal (dialog open-folder)
│   └── icons/                # Icon installer (ico/icns/png, via `tauri icon`)
├── frontend/                 # UI web (TypeScript + Vite, tanpa framework)
│   └── src/
│       ├── transport.ts      # Otomatis: Tauri IPC di desktop, HTTP di web
│       ├── main.ts           # Wiring: menu, shortcut, Open Folder, tema
│       ├── editorView.ts     # Monaco + tab management
│       └── terminalView.ts / explorer.ts / searchView.ts / gitView.ts / …
└── workspace/                # Folder demo
```

**Kenapa satu core untuk dua target?** Seluruh logika (file, git, terminal)
ditulis sekali di `karat-core`. Versi desktop memanggilnya via Tauri IPC
(tanpa overhead HTTP), versi web via Axum — UI-nya 100% sama.

### Tauri commands (desktop IPC)

| Command | Fungsi |
|---|---|
| `get_root` / `set_root` | Workspace aktif |
| `list_dir`, `read_file`, `save_file` | Baca/tulis file |
| `make_dir`, `delete_path`, `rename_path` | Kelola file/folder |
| `search_files` | Grep rekursif |
| `git_status`, `git_add`, `git_commit` | Git |
| `term_spawn`, `term_input`, `term_resize`, `term_kill` | Terminal PTY (output via `Channel`) |

---

## 🗺️ Roadmap

- **v0.2 — Jadi IDE beneran**
  - [ ] Language Server Protocol (autocomplete, diagnostics, hover, go-to-definition)
  - [ ] Debug Adapter Protocol (breakpoint, step, variables)
  - [ ] Panel Problems/Output, multi-terminal, diff view
  - [ ] Settings UI + keybinding editor
- **v0.3 — Ekosistem**
  - [ ] Extension API (plugin JS/WASM)
  - [ ] Auto-update (Tauri updater + signing)
  - [ ] Git lanjutan: branch, push/pull
  - [ ] Microsoft Store / Winget publish

---

## ⌨️ Shortcut

| Shortcut | Aksi |
|---|---|
| `Ctrl+S` | Save |
| `Ctrl+P` | Quick open |
| `Ctrl+Shift+P` | Command palette |
| `Ctrl+Shift+F` | Search in files |
| `Ctrl+B` | Toggle sidebar |
| ``Ctrl+` `` | Toggle terminal |
| `Ctrl+F` | Find in file |

Lisensi: MIT.
