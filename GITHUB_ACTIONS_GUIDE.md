# 🚀 GitHub Actions - Karat DLL Build Guide

## File yang ditambahkan untuk DLL build:

### 1. `src/c_api.rs`
C ABI exports:
- `karat_free_string`
- `karat_version`, `karat_health`, `karat_init`, `karat_shutdown`
- `karat_list_dir`, `karat_read_file`, `karat_save_file`, `karat_make_dir`, `karat_delete_path`, `karat_rename_path`, `karat_search`

### 2. `Cargo.toml` modif
```toml
[lib]
name = "karat"
crate-type = ["cdylib", "rlib", "staticlib"]
```

### 3. `.github/workflows/` (4 workflows)

#### `build-dll.yml` - Build DLL tiap push
- Windows x64: `karat.dll` + `karat.lib` + `karat.h`
- Windows x86: `karat_x86.dll`
- Linux: `libkarat.so`
- macOS: `libkarat.dylib`
- Artifacts bisa didownload di Actions tab, retention 30 hari

#### `ci.yml` - Check & Test
- `cargo fmt --check`
- `cargo clippy`
- `cargo test`
- Build frontend
- Smoke build DLL

#### `tauri.yml` - Build Tauri App
- Windows: `.exe` NSIS + `.msi` WiX
- Linux: `.deb`, `.AppImage`
- macOS: `.dmg`
- Menggunakan `tauri-apps/tauri-action@v0`

#### `release.yml` - Release otomatis
Trigger:
- `git tag v0.2.0 && git push origin v0.2.0`
- atau manual via workflow_dispatch

Hasil: GitHub Release dengan:
- `karat-dll-windows.zip`
- `Karat_0.2.0_x64-setup.exe`
- `Karat_0.2.0_x64_en-US.msi`
- `libkarat.so`, `libkarat.dylib`

### 4. Scripts
- `scripts/build-dll.ps1` - PowerShell build
- `scripts/build-dll.sh` - Bash build

### 5. Examples
- `examples/test_dll.py` - Python ctypes
- `examples/test_dll.cs` - C# P/Invoke
- `examples/test_dll.cpp` - C++ LoadLibrary

### 6. Header
- `karat.h` - C header untuk include di C/C++

## Cara pakai GitHub Actions:

1. Buat repo baru di GitHub (jangan pakai token lama yang bocor!)
2. Push:
```bash
cd karat-final
git init
git add .
git commit -m "feat: DLL build + GitHub Actions"
git branch -M main
git remote add origin https://github.com/USERNAME/karat.git
git push -u origin main
```

3. Cek tab Actions → lihat build-dll jalan
4. Download artifact `karat-windows-x64-dll`

5. Untuk release:
```bash
git tag v0.2.0
git push origin v0.2.0
```

## Build lokal (tanpa GitHub Actions):

Windows:
```powershell
cargo build --release --lib
# atau
.\scripts\build-dll.ps1 -Release
```

Linux/macOS:
```bash
cargo build --release --lib
./scripts/build-dll.sh release
```

Test:
```bash
python3 examples/test_dll.py
```

## Secrets yang dibutuhkan:
- `GITHUB_TOKEN` - otomatis ada, tidak perlu setting

Tidak perlu token lain! Jangan commit token sensitif.

## Troubleshooting:
- Jika build Windows gagal: cek `cargo build --release --lib` lokal dulu
- Jika Tauri build gagal di Ubuntu: pastikan deps `libwebkit2gtk-4.1-dev` terinstall (sudah ada di workflow)
- Jika artifact tidak muncul: cek `if-no-files-found: warn` dan pastikan path benar

## Next improvement:
- Tambah `cross` untuk build Windows dari Linux
- Tambah `cargo-auditable` untuk security
- Tambah `sccache` untuk faster build
