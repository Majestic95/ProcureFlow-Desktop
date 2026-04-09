use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Get the base storage directory: AppData/Local/ProcureFlow/storage/
fn storage_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_local_data_dir()
        .map_err(|e| e.to_string())?;
    let storage = base.join("storage");
    fs::create_dir_all(&storage).map_err(|e| e.to_string())?;
    Ok(storage)
}

/// Resolve a storage path from a relative path like "rfps/abc123/doc.pdf".
/// Enforces path confinement: the resolved path must stay within the storage directory.
fn resolve_path(app: &AppHandle, relative_path: &str) -> Result<PathBuf, String> {
    // Reject obviously malicious patterns
    if relative_path.contains("..") || relative_path.starts_with('/') || relative_path.starts_with('\\') {
        return Err("Path traversal denied: relative path must not contain '..' or start with '/' or '\\'".to_string());
    }

    let base = storage_dir(app)?;
    let full = base.join(relative_path);

    // Create parent directories
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // Canonicalize both paths and verify confinement
    let canonical_base = base.canonicalize().unwrap_or(base);
    let canonical_full = if full.exists() {
        full.canonicalize().map_err(|e| e.to_string())?
    } else {
        // For new files, canonicalize the parent and append the filename
        let parent = full.parent().ok_or("Invalid path: no parent")?;
        let file_name = full.file_name().ok_or("Invalid path: no filename")?;
        parent.canonicalize().map_err(|e| e.to_string())?.join(file_name)
    };

    if !canonical_full.starts_with(&canonical_base) {
        return Err("Path traversal denied: resolved path is outside storage directory".to_string());
    }

    Ok(canonical_full)
}

/// Maximum file size: 50MB
const MAX_FILE_SIZE: usize = 50 * 1024 * 1024;

/// Save a file from raw bytes. Returns the relative storage path (used as the "URL").
#[tauri::command]
pub fn file_save(
    app: AppHandle,
    relative_path: String,
    data: Vec<u8>,
) -> Result<String, String> {
    if data.len() > MAX_FILE_SIZE {
        return Err("File exceeds maximum size of 50MB".to_string());
    }
    let full_path = resolve_path(&app, &relative_path)?;
    fs::write(&full_path, &data).map_err(|_| "Failed to write file".to_string())?;
    Ok(relative_path)
}

/// Read a file and return its bytes.
#[tauri::command]
pub fn file_read(
    app: AppHandle,
    relative_path: String,
) -> Result<Vec<u8>, String> {
    let full_path = resolve_path(&app, &relative_path)?;
    fs::read(&full_path).map_err(|_| "File not found or not readable".to_string())
}

/// Delete a file.
#[tauri::command]
pub fn file_delete(
    app: AppHandle,
    relative_path: String,
) -> Result<bool, String> {
    let full_path = resolve_path(&app, &relative_path)?;
    if full_path.exists() {
        fs::remove_file(&full_path).map_err(|e| e.to_string())?;
        Ok(true)
    } else {
        Ok(false)
    }
}

/// Check if a file exists and return metadata.
#[tauri::command]
pub fn file_metadata(
    app: AppHandle,
    relative_path: String,
) -> Result<Option<FileMetadata>, String> {
    let full_path = resolve_path(&app, &relative_path)?;
    if !full_path.exists() {
        return Ok(None);
    }

    let metadata = fs::metadata(&full_path).map_err(|e| e.to_string())?;
    let name = full_path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    // Guess content type from extension
    let content_type = match full_path.extension().and_then(|e| e.to_str()) {
        Some("pdf") => "application/pdf",
        Some("docx") => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        Some("xlsx") => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("svg") => "image/svg+xml",
        Some("csv") => "text/csv",
        Some("txt") => "text/plain",
        Some("zip") => "application/zip",
        _ => "application/octet-stream",
    };

    Ok(Some(FileMetadata {
        name,
        size: metadata.len(),
        content_type: content_type.to_string(),
        path: relative_path,
    }))
}

/// List all files in a directory (relative to storage root).
/// Uses resolve_path for path confinement.
#[tauri::command]
pub fn file_list(
    app: AppHandle,
    relative_dir: String,
) -> Result<Vec<String>, String> {
    // Use resolve_path for path traversal protection
    let dir = resolve_path(&app, &relative_dir)?;

    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().map_err(|e| e.to_string())?.is_file() {
            if let Some(name) = entry.file_name().to_str() {
                files.push(format!("{}/{}", relative_dir, name));
            }
        }
    }
    Ok(files)
}

#[derive(serde::Serialize)]
pub struct FileMetadata {
    pub name: String,
    pub size: u64,
    pub content_type: String,
    pub path: String,
}
