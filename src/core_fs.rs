//! Filesystem core: pure logic shared by the Axum backend and Tauri commands.
//! All paths are relative to the workspace root and validated by [`safe_join`].

use serde::Serialize;
use std::path::{Component, Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Hit {
    pub path: String,
    pub line: usize,
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SearchResults {
    pub results: Vec<Hit>,
    pub truncated: bool,
}

#[derive(Debug, Clone)]
pub enum CoreError {
    BadPath(String),
    NotFound(String),
    Io(String),
    TooLarge(String),
    Binary(String),
}

impl CoreError {
    pub fn message(&self) -> String {
        match self {
            Self::BadPath(m)
            | Self::NotFound(m)
            | Self::Io(m)
            | Self::TooLarge(m)
            | Self::Binary(m) => m.clone(),
        }
    }
}

impl std::fmt::Display for CoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message())
    }
}

impl std::error::Error for CoreError {}

/// Resolve a client-supplied relative path against the workspace root,
/// rejecting anything that would escape it (`..` tricks included).
pub fn safe_join(root: &Path, rel: &str) -> Result<PathBuf, CoreError> {
    let rel = rel.trim().trim_start_matches(['/', '\\']);
    if rel.is_empty() {
        return Ok(root.to_path_buf());
    }
    let mut norm = root.to_path_buf();
    for comp in Path::new(rel).components() {
        match comp {
            Component::ParentDir => {
                norm.pop();
                if !norm.starts_with(root) {
                    return Err(CoreError::BadPath("path escapes workspace".to_string()));
                }
            }
            Component::CurDir | Component::RootDir | Component::Prefix(_) => {}
            Component::Normal(c) => norm.push(c),
        }
    }
    if !norm.starts_with(root) {
        return Err(CoreError::BadPath("path escapes workspace".to_string()));
    }
    Ok(norm)
}

fn rel_path(root: &Path, p: &Path) -> String {
    p.strip_prefix(root)
        .unwrap_or(p)
        .to_string_lossy()
        .replace('\\', "/")
}

fn mtime_secs(p: &Path) -> u64 {
    std::fs::metadata(p)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn list_dir(root: &Path, rel: &str) -> Result<Vec<Entry>, CoreError> {
    let dir = safe_join(root, rel)?;
    let rd = std::fs::read_dir(&dir).map_err(|e| CoreError::NotFound(e.to_string()))?;
    let mut entries = Vec::new();
    for e in rd.flatten() {
        let p = e.path();
        let md = e.metadata().ok();
        entries.push(Entry {
            name: e.file_name().to_string_lossy().into_owned(),
            path: rel_path(root, &p),
            is_dir: md.as_ref().map(|m| m.is_dir()).unwrap_or(false),
            size: md.as_ref().map(|m| m.len()).unwrap_or(0),
            modified: mtime_secs(&p),
        });
    }
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

const MAX_READ: u64 = 5 * 1024 * 1024;

pub fn read_file(root: &Path, rel: &str) -> Result<String, CoreError> {
    let p = safe_join(root, rel)?;
    let md = std::fs::metadata(&p).map_err(|e| CoreError::NotFound(e.to_string()))?;
    if md.is_dir() {
        return Err(CoreError::BadPath("not a file".to_string()));
    }
    if md.len() > MAX_READ {
        return Err(CoreError::TooLarge(
            "file too large to open (>5 MB)".to_string(),
        ));
    }
    let bytes = std::fs::read(&p).map_err(|e| CoreError::Io(e.to_string()))?;
    String::from_utf8(bytes)
        .map_err(|_| CoreError::Binary("binary file — cannot open as text".to_string()))
}

pub fn save_file(root: &Path, rel: &str, content: &str) -> Result<(), CoreError> {
    let p = safe_join(root, rel)?;
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| CoreError::Io(e.to_string()))?;
    }
    std::fs::write(&p, content).map_err(|e| CoreError::Io(e.to_string()))?;
    Ok(())
}

pub fn make_dir(root: &Path, rel: &str) -> Result<(), CoreError> {
    let p = safe_join(root, rel)?;
    std::fs::create_dir_all(&p).map_err(|e| CoreError::Io(e.to_string()))?;
    Ok(())
}

pub fn delete_path(root: &Path, rel: &str) -> Result<(), CoreError> {
    let p = safe_join(root, rel)?;
    if p == root {
        return Err(CoreError::BadPath(
            "cannot delete workspace root".to_string(),
        ));
    }
    if p.is_dir() {
        std::fs::remove_dir_all(&p).map_err(|e| CoreError::Io(e.to_string()))?;
    } else {
        std::fs::remove_file(&p).map_err(|e| CoreError::NotFound(e.to_string()))?;
    }
    Ok(())
}

pub fn rename_path(root: &Path, from: &str, to: &str) -> Result<(), CoreError> {
    let from = safe_join(root, from)?;
    let to = safe_join(root, to)?;
    if from == root {
        return Err(CoreError::BadPath(
            "cannot rename workspace root".to_string(),
        ));
    }
    if let Some(parent) = to.parent() {
        std::fs::create_dir_all(parent).map_err(|e| CoreError::Io(e.to_string()))?;
    }
    std::fs::rename(&from, &to).map_err(|e| CoreError::Io(e.to_string()))?;
    Ok(())
}

const SKIP_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    "out",
    ".venv",
    "venv",
    "__pycache__",
    ".next",
    ".nuxt",
    "coverage",
];
const MAX_FILE_BYTES: u64 = 512 * 1024;
const MAX_RESULTS: usize = 300;
const MAX_VISITED: u32 = 30_000;

pub fn search(root: &Path, rel: &str, query: &str) -> Result<SearchResults, CoreError> {
    if query.trim().is_empty() {
        return Ok(SearchResults {
            results: vec![],
            truncated: false,
        });
    }
    let base = safe_join(root, rel)?;
    let needle = query.to_lowercase();
    let mut results: Vec<Hit> = Vec::new();
    let mut visited: u32 = 0;
    let mut truncated = false;

    let mut stack = vec![base];
    'walk: while let Some(dir) = stack.pop() {
        let rd = match std::fs::read_dir(&dir) {
            Ok(r) => r,
            Err(_) => continue,
        };
        for entry in rd.flatten() {
            visited += 1;
            if visited > MAX_VISITED {
                truncated = true;
                break 'walk;
            }
            let p = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
            if is_dir {
                if name.starts_with('.') || SKIP_DIRS.contains(&name.as_str()) {
                    continue;
                }
                stack.push(p);
            } else {
                if name.starts_with('.') {
                    continue;
                }
                if entry.metadata().map(|m| m.len()).unwrap_or(0) > MAX_FILE_BYTES {
                    continue;
                }
                let content = match std::fs::read_to_string(&p) {
                    Ok(c) => c,
                    Err(_) => continue,
                };
                for (i, line) in content.lines().enumerate() {
                    if line.to_lowercase().contains(&needle) {
                        results.push(Hit {
                            path: rel_path(root, &p),
                            line: i + 1,
                            text: line.chars().take(240).collect(),
                        });
                        if results.len() >= MAX_RESULTS {
                            truncated = true;
                            break 'walk;
                        }
                    }
                }
            }
        }
    }
    Ok(SearchResults {
        results,
        truncated,
    })
}
