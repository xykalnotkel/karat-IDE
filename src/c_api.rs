//! C ABI exports for building Karat as DLL / cdylib / .so / .dylib
//!
//! This module exposes safe C-compatible functions that return JSON strings.
//! Caller must free returned strings with `karat_free_string`.
//!
//! Build DLL:
//!   cargo build --release --lib
//!   -> target/release/karat.dll (Windows)
//!   -> target/release/libkarat.so (Linux)
//!   -> target/release/libkarat.dylib (macOS)

use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::path::PathBuf;

use crate::core_fs;

// --- Helpers for C string handling ---

fn c_str_to_rust<'a>(ptr: *const c_char) -> Result<&'a str, String> {
    if ptr.is_null() {
        return Err("null pointer".to_string());
    }
    unsafe {
        CStr::from_ptr(ptr)
            .to_str()
            .map_err(|e| format!("invalid utf8: {e}"))
    }
}

fn rust_string_to_c_ptr(s: String) -> *mut c_char {
    match CString::new(s) {
        Ok(c) => c.into_raw(),
        Err(_) => CString::new("string contains null byte")
            .unwrap()
            .into_raw(),
    }
}

fn json_ok<T: serde::Serialize>(value: T) -> *mut c_char {
    let json = serde_json::to_string(&serde_json::json!({
        "ok": true,
        "data": value
    }))
    .unwrap_or_else(|_| r#"{"ok":false,"error":"json serialize error"}"#.to_string());
    rust_string_to_c_ptr(json)
}

fn json_err(msg: String) -> *mut c_char {
    let json = serde_json::to_string(&serde_json::json!({
        "ok": false,
        "error": msg
    }))
    .unwrap_or_else(|_| r#"{"ok":false,"error":"json error"}"#.to_string());
    rust_string_to_c_ptr(json)
}

// --- Exported C ABI ---

/// Free a string returned by Karat DLL. MUST be called for every non-null string returned.
///
/// # Safety
/// `s` must be null or a pointer returned by a Karat function, and it must not
/// have been freed previously.
#[no_mangle]
pub unsafe extern "C" fn karat_free_string(s: *mut c_char) {
    if s.is_null() {
        return;
    }
    unsafe {
        let _ = CString::from_raw(s);
    }
}

/// Get Karat version
#[no_mangle]
pub extern "C" fn karat_version() -> *mut c_char {
    rust_string_to_c_ptr(env!("CARGO_PKG_VERSION").to_string())
}

/// Health check
#[no_mangle]
pub extern "C" fn karat_health() -> *mut c_char {
    rust_string_to_c_ptr("ok".to_string())
}

/// List directory: root and rel path as C strings, returns JSON
/// Example return: {"ok":true,"data":[{"name":"main.rs","path":"src/main.rs","is_dir":false,...}]}
#[no_mangle]
pub extern "C" fn karat_list_dir(root: *const c_char, rel: *const c_char) -> *mut c_char {
    let root_str = match c_str_to_rust(root) {
        Ok(s) => s,
        Err(e) => return json_err(e),
    };
    let rel_str = match c_str_to_rust(rel) {
        Ok(s) => s,
        Err(e) => return json_err(e),
    };
    let root_path = PathBuf::from(root_str);
    match core_fs::list_dir(&root_path, rel_str) {
        Ok(entries) => json_ok(entries),
        Err(e) => json_err(e.message()),
    }
}

/// Read file
#[no_mangle]
pub extern "C" fn karat_read_file(root: *const c_char, rel: *const c_char) -> *mut c_char {
    let root_str = match c_str_to_rust(root) {
        Ok(s) => s,
        Err(e) => return json_err(e),
    };
    let rel_str = match c_str_to_rust(rel) {
        Ok(s) => s,
        Err(e) => return json_err(e),
    };
    let root_path = PathBuf::from(root_str);
    match core_fs::read_file(&root_path, rel_str) {
        Ok(content) => json_ok(content),
        Err(e) => json_err(e.message()),
    }
}

/// Save file
#[no_mangle]
pub extern "C" fn karat_save_file(
    root: *const c_char,
    rel: *const c_char,
    content: *const c_char,
) -> *mut c_char {
    let root_str = match c_str_to_rust(root) {
        Ok(s) => s,
        Err(e) => return json_err(e),
    };
    let rel_str = match c_str_to_rust(rel) {
        Ok(s) => s,
        Err(e) => return json_err(e),
    };
    let content_str = match c_str_to_rust(content) {
        Ok(s) => s,
        Err(e) => return json_err(e),
    };
    let root_path = PathBuf::from(root_str);
    match core_fs::save_file(&root_path, rel_str, content_str) {
        Ok(_) => json_ok(true),
        Err(e) => json_err(e.message()),
    }
}

/// Make dir
#[no_mangle]
pub extern "C" fn karat_make_dir(root: *const c_char, rel: *const c_char) -> *mut c_char {
    let root_str = match c_str_to_rust(root) {
        Ok(s) => s,
        Err(e) => return json_err(e),
    };
    let rel_str = match c_str_to_rust(rel) {
        Ok(s) => s,
        Err(e) => return json_err(e),
    };
    let root_path = PathBuf::from(root_str);
    match core_fs::make_dir(&root_path, rel_str) {
        Ok(_) => json_ok(true),
        Err(e) => json_err(e.message()),
    }
}

/// Delete path
#[no_mangle]
pub extern "C" fn karat_delete_path(root: *const c_char, rel: *const c_char) -> *mut c_char {
    let root_str = match c_str_to_rust(root) {
        Ok(s) => s,
        Err(e) => return json_err(e),
    };
    let rel_str = match c_str_to_rust(rel) {
        Ok(s) => s,
        Err(e) => return json_err(e),
    };
    let root_path = PathBuf::from(root_str);
    match core_fs::delete_path(&root_path, rel_str) {
        Ok(_) => json_ok(true),
        Err(e) => json_err(e.message()),
    }
}

/// Rename path
#[no_mangle]
pub extern "C" fn karat_rename_path(
    root: *const c_char,
    from: *const c_char,
    to: *const c_char,
) -> *mut c_char {
    let root_str = match c_str_to_rust(root) {
        Ok(s) => s,
        Err(e) => return json_err(e),
    };
    let from_str = match c_str_to_rust(from) {
        Ok(s) => s,
        Err(e) => return json_err(e),
    };
    let to_str = match c_str_to_rust(to) {
        Ok(s) => s,
        Err(e) => return json_err(e),
    };
    let root_path = PathBuf::from(root_str);
    match core_fs::rename_path(&root_path, from_str, to_str) {
        Ok(_) => json_ok(true),
        Err(e) => json_err(e.message()),
    }
}

/// Search files
#[no_mangle]
pub extern "C" fn karat_search(
    root: *const c_char,
    rel: *const c_char,
    query: *const c_char,
) -> *mut c_char {
    let root_str = match c_str_to_rust(root) {
        Ok(s) => s,
        Err(e) => return json_err(e),
    };
    let rel_str = match c_str_to_rust(rel) {
        Ok(s) => s,
        Err(e) => return json_err(e),
    };
    let query_str = match c_str_to_rust(query) {
        Ok(s) => s,
        Err(e) => return json_err(e),
    };
    let root_path = PathBuf::from(root_str);
    match core_fs::search(&root_path, rel_str, query_str) {
        Ok(res) => json_ok(res),
        Err(e) => json_err(e.message()),
    }
}

/// Init / deinit hooks for DLL (Windows DllMain calls this indirectly)
#[no_mangle]
pub extern "C" fn karat_init() -> i32 {
    // Placeholder for future init logic (logging, etc)
    1
}

#[no_mangle]
pub extern "C" fn karat_shutdown() {
    // Placeholder for cleanup
}
