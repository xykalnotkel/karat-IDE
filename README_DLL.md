# Karat DLL Build - Panduan Lengkap

> Build Karat core sebagai DLL (Windows) / .so (Linux) / .dylib (macOS) + GitHub Actions auto compile.

## 🎯 Apa yang sudah ditambahkan?

### 1. Core DLL support
- `Cargo.toml` sekarang punya `[lib] crate-type = ["cdylib", "rlib", "staticlib"]`
- `src/c_api.rs` → export C ABI:
  - `karat_version()`, `karat_health()`, `karat_init()`, `karat_shutdown()`
  - `karat_list_dir(root, rel) -> JSON`
  - `karat_read_file(root, rel) -> JSON`
  - `karat_save_file(root, rel, content) -> JSON`
  - `karat_make_dir`, `karat_delete_path`, `karat_rename_path`
  - `karat_search(root, rel, query) -> JSON`
  - `karat_free_string(ptr)` → **wajib** dipanggil untuk free memory

Semua return JSON format:
```json
{"ok": true, "data": [...]}
{"ok": false, "error": "pesan error"}
```

### 2. GitHub Actions (`.github/workflows/`)

| Workflow | Fungsi |
|----------|--------|
| `build-dll.yml` | Build DLL Windows x64 + x86, SO Linux, Dylib macOS tiap push |
| `ci.yml` | fmt, clippy, test, build frontend + smoke DLL |
| `tauri.yml` | Build Tauri app (exe, msi, deb, dmg) cross-platform |
| `release.yml` | Trigger saat push tag `v*` → buat GitHub Release dengan DLL + installer |

### 3. Scripts & Examples
- `scripts/build-dll.ps1` → build di Windows PowerShell
- `scripts/build-dll.sh` → build di Linux/macOS
- `examples/test_dll.py` → test via Python ctypes
- `examples/test_dll.cs` → test via C#
- `examples/test_dll.cpp` → test via C++

---

## 🔨 Cara Build Lokal

### Windows (PowerShell)
```powershell
cd karat
cargo build --release --lib
# hasil: target/release/karat.dll + karat.lib

# atau pakai script
.\scripts\build-dll.ps1 -Release

# test dengan Python
python examples/test_dll.py
```

### Linux
```bash
cd karat
cargo build --release --lib
# hasil: target/release/libkarat.so

./scripts/build-dll.sh release
python3 examples/test_dll.py
```

### macOS
```bash
cd karat
cargo build --release --lib
# hasil: target/release/libkarat.dylib
```

### Build untuk x86 32-bit (Windows)
```powershell
rustup target add i686-pc-windows-msvc
cargo build --release --lib --target i686-pc-windows-msvc
# hasil: target/i686-pc-windows-msvc/release/karat.dll
```

---

## 🚀 GitHub Actions Setup

### Langkah 1: Push ke GitHub
```bash
git init
git add .
git commit -m "feat: add DLL build + github actions"
git branch -M main
git remote add origin https://github.com/USERNAME/karat.git
git push -u origin main
```

### Langkah 2: Otomatis Build
- Setiap push ke `main` → `build-dll.yml` jalan, hasil DLL bisa didownload di tab **Actions → Artifacts**
- Push tag untuk release:
```bash
git tag v0.2.0
git push origin v0.2.0
# → release.yml akan buat GitHub Release dengan DLL + .exe + .msi
```

### Artifacts yang dihasilkan:
- `karat-windows-x64-dll.zip` → berisi `karat.dll`, `karat.lib`, `karat.h`
- `karat-windows-x86-dll.zip` → `karat_x86.dll`
- `karat-linux-x64-so` → `libkarat.so`
- `karat-macos-dylib` → `libkarat.dylib`
- Tauri bundles → `Karat_0.2.0_x64-setup.exe`, `Karat_0.2.0_x64_en-US.msi`, dll

---

## 📦 Cara Pakai DLL

### Python
```python
import ctypes, json
lib = ctypes.CDLL("./karat.dll")
lib.karat_list_dir.argtypes = [ctypes.c_char_p, ctypes.c_char_p]
lib.karat_list_dir.restype = ctypes.c_void_p
lib.karat_free_string.argtypes = [ctypes.c_void_p]

ptr = lib.karat_list_dir(b"C:/myproject", b"")
json_str = ctypes.cast(ptr, ctypes.c_char_p).value.decode()
lib.karat_free_string(ptr)
data = json.loads(json_str)
print(data)
```

### C#
```csharp
[DllImport("karat.dll", CallingConvention = CallingConvention.Cdecl)]
static extern IntPtr karat_list_dir(string root, string rel);
[DllImport("karat.dll", CallingConvention = CallingConvention.Cdecl)]
static extern void karat_free_string(IntPtr s);

IntPtr ptr = karat_list_dir(@"C:\myproject", "");
string json = Marshal.PtrToStringUTF8(ptr);
karat_free_string(ptr);
```

### C++
```cpp
HMODULE h = LoadLibraryA("karat.dll");
auto fn = (char*(*)(const char*, const char*))GetProcAddress(h, "karat_list_dir");
auto freeFn = (void(*)(char*))GetProcAddress(h, "karat_free_string");
char* result = fn("C:/myproject", "");
std::cout << result << std::endl;
freeFn(result);
```

---

## 🔐 Keamanan Token

> File `uploads/my-binimbg.txt` yang kamu share berisi token sensitif (GitHub, Cloudflare, Vercel, dll). 
> **Segera rotate/revoke semua token tersebut di dashboard masing-masing!**
> File tersebut sudah gue exclude dari build dan tidak ikut di-commit.

Tambahkan ke `.gitignore`:
```
uploads/
*.txt
dist/
dist-dll/
release-dll/
```

---

## 📝 Next Steps

- [ ] Tambah export untuk git: `karat_git_status`, `karat_git_commit`
- [ ] Tambah terminal PTY via DLL (butuh callback)
- [ ] Buat NuGet package untuk C# (`dotnet pack`)
- [ ] Buat Python wheel dengan `maturin`
- [ ] Signing DLL dengan sertifikat untuk distribusi

---

## 🆘 Troubleshooting

**Q: DLL tidak ke-load di C#?**
A: Pastikan `karat.dll` di folder yang sama dengan `.exe` atau di PATH. Cek dependency dengan `Dependencies.exe` (lucasg).

**Q: GitHub Actions gagal di Windows?**
A: Cek `rust-cache` dan pastikan `cargo build --lib` berhasil lokal dulu.

**Q: Ukuran DLL besar?**
A: Build release sudah strip, tapi masih ~5-10MB karena static linking Tokio. Bisa kecilkan dengan `lto = true` dan `strip = true` di Cargo.toml (sudah default release).

---

Lisensi: MIT - sama dengan Karat.
