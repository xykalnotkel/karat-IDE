//! Git core via the `git` CLI (status / stage / commit).

use super::core_fs::{safe_join, CoreError};
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
pub struct GitFile {
    pub path: String,
    pub staged: String,
    pub unstaged: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitStatus {
    pub repo: bool,
    pub branch: String,
    pub files: Vec<GitFile>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitOutput {
    pub ok: bool,
    pub output: String,
}

async fn run_git(dir: &Path, args: &[&str]) -> Result<std::process::Output, CoreError> {
    tokio::process::Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .output()
        .await
        .map_err(|e| CoreError::Io(format!("failed to run git: {e}")))
}

fn combined_output(out: &std::process::Output) -> String {
    let mut s = String::from_utf8_lossy(&out.stdout).into_owned();
    let e = String::from_utf8_lossy(&out.stderr);
    if !e.trim().is_empty() {
        if !s.trim().is_empty() {
            s.push('\n');
        }
        s.push_str(&e);
    }
    s.chars().take(2000).collect()
}

/// Resolve the directory git should run in (a file path resolves to its parent).
pub fn repo_dir(root: &Path, rel: &str) -> PathBuf {
    let mut dir = safe_join(root, rel).unwrap_or_else(|_| root.to_path_buf());
    if dir.is_file() {
        dir = dir.parent().unwrap_or(root).to_path_buf();
    }
    dir
}

pub async fn status(dir: &Path) -> Result<GitStatus, CoreError> {
    let out = run_git(
        dir,
        &["status", "--porcelain=v1", "-b", "--untracked-files=normal"],
    )
    .await?;
    if !out.status.success() {
        return Ok(GitStatus {
            repo: false,
            branch: String::new(),
            files: vec![],
        });
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let mut branch = String::new();
    let mut files = Vec::new();
    for line in text.lines() {
        if let Some(b) = line.strip_prefix("## ") {
            branch = b.split("...").next().unwrap_or(b).to_string();
            if branch.starts_with("HEAD (no branch") {
                branch = "(detached)".to_string();
            }
        } else if line.len() >= 4 {
            let mut chars = line.chars();
            let staged = chars.next().unwrap_or(' ');
            let unstaged = chars.next().unwrap_or(' ');
            let mut path = line[3..].to_string();
            if let Some(idx) = path.find(" -> ") {
                path = path[idx + 4..].to_string();
            }
            files.push(GitFile {
                path: path.trim_matches('"').to_string(),
                staged: staged.to_string(),
                unstaged: unstaged.to_string(),
            });
        }
    }
    Ok(GitStatus {
        repo: true,
        branch,
        files,
    })
}

pub async fn add(root: &Path, paths: &[String]) -> Result<GitOutput, CoreError> {
    if paths.is_empty() {
        let out = run_git(root, &["add", "-A"]).await?;
        return Ok(GitOutput {
            ok: out.status.success(),
            output: combined_output(&out),
        });
    }
    for p in paths {
        safe_join(root, p)?;
    }
    let mut args: Vec<&str> = vec!["add", "--"];
    args.extend(paths.iter().map(|s| s.as_str()));
    let out = run_git(root, &args).await?;
    Ok(GitOutput {
        ok: out.status.success(),
        output: combined_output(&out),
    })
}

pub async fn commit(root: &Path, message: &str) -> Result<GitOutput, CoreError> {
    let msg = message.trim();
    if msg.is_empty() {
        return Err(CoreError::BadPath("commit message is empty".to_string()));
    }
    let mut out = run_git(root, &["commit", "-m", msg]).await?;
    let mut text = combined_output(&out);
    if !out.status.success() && text.contains("Author identity unknown") {
        // First-time convenience: fall back to a local Karat identity.
        out = run_git(
            root,
            &[
                "-c",
                "user.name=Karat",
                "-c",
                "user.email=karat@local",
                "commit",
                "-m",
                msg,
            ],
        )
        .await?;
        text = combined_output(&out);
    }
    Ok(GitOutput {
        ok: out.status.success(),
        output: text,
    })
}
