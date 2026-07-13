use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use anyhow::{anyhow, Result};
use futures_util::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;
use zip::ZipArchive;

// Пребилды whisper.cpp v1.9.1 (Windows x64): (имя варианта, имя zip, URL).
// cpu — универсально; cublas — NVIDIA (CUDA 12.4, на Blackwell sm_120 под вопросом).
const VARIANTS: &[(&str, &str, &str)] = &[
    (
        "cpu",
        "whisper-bin-x64.zip",
        "https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.1/whisper-bin-x64.zip",
    ),
    (
        "cublas",
        "whisper-cublas-12.4.0-bin-x64.zip",
        "https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.1/whisper-cublas-12.4.0-bin-x64.zip",
    ),
];
const MODEL_BASE_URL: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/";
const SERVER_EXE: &str = "whisper-server.exe";

fn variant_url(variant: &str) -> Option<(&'static str, &'static str)> {
    VARIANTS
        .iter()
        .find(|(name, _, _)| *name == variant)
        .map(|(_, zip, url)| (*zip, *url))
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstalledVariant {
    pub name: String,
    pub exe_path: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WhisperManagedStatus {
    pub dir: String,
    pub models: Vec<String>,
    pub variants: Vec<InstalledVariant>,
}

#[derive(Serialize, Clone)]
struct InstallProgress {
    phase: String, // "binary" | "model"
    file: String,
    downloaded: u64,
    total: u64, // 0 если сервер не отдал длину
}

fn whisper_dir(app: &AppHandle) -> Result<PathBuf> {
    let mut dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| anyhow!("Не удалось определить папку данных: {e}"))?;
    dir.push("whisper");
    Ok(dir)
}

fn models_dir(app: &AppHandle) -> Result<PathBuf> {
    Ok(whisper_dir(app)?.join("models"))
}

fn variant_dir(app: &AppHandle, variant: &str) -> Result<PathBuf> {
    Ok(whisper_dir(app)?.join(variant))
}

fn find_server_exe(dir: &Path) -> Option<PathBuf> {
    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = find_server_exe(&path) {
                return Some(found);
            }
        } else if path
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.eq_ignore_ascii_case(SERVER_EXE))
            .unwrap_or(false)
        {
            return Some(path);
        }
    }
    None
}

/// Глобальная блокировка установки — предотвращает двойное скачивание при клике.
fn install_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn build_status(app: &AppHandle) -> Result<WhisperManagedStatus> {
    let dir = whisper_dir(app)?;
    let mut variants = Vec::new();
    for (name, _, _) in VARIANTS {
        if let Ok(vdir) = variant_dir(app, name) {
            if let Some(exe) = find_server_exe(&vdir) {
                variants.push(InstalledVariant {
                    name: (*name).to_string(),
                    exe_path: exe.to_string_lossy().to_string(),
                });
            }
        }
    }
    let mut models = Vec::new();
    if let Ok(entries) = std::fs::read_dir(models_dir(app)?) {
        for entry in entries.flatten() {
            if let Some(name) = entry.file_name().to_str() {
                if name.ends_with(".bin") {
                    models.push(name.to_string());
                }
            }
        }
    }
    models.sort();
    Ok(WhisperManagedStatus {
        dir: dir.to_string_lossy().to_string(),
        models,
        variants,
    })
}

async fn download_to_file(
    app: &AppHandle,
    url: &str,
    dest: &Path,
    phase: &str,
    file: &str,
) -> Result<()> {
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    // reqwest по умолчанию уважает переменные окружения HTTP_PROXY/HTTPS_PROXY.
    let client = reqwest::Client::builder().build()?;
    let response = client.get(url).send().await?;
    if !response.status().is_success() {
        return Err(anyhow!("Загрузка {file} не удалась: HTTP {}", response.status()));
    }
    let total = response.content_length().unwrap_or(0);
    let tmp = dest.with_extension("part");
    let mut out = tokio::fs::File::create(&tmp).await?;
    let mut downloaded: u64 = 0;
    let mut last_emit: u64 = 0;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        out.write_all(&chunk).await?;
        downloaded += chunk.len() as u64;
        if downloaded - last_emit >= 1_000_000 || (total > 0 && downloaded >= total) {
            last_emit = downloaded;
            let _ = app.emit(
                "whisper-install:progress",
                InstallProgress {
                    phase: phase.to_string(),
                    file: file.to_string(),
                    downloaded,
                    total,
                },
            );
        }
    }
    out.flush().await?;
    drop(out);
    tokio::fs::rename(&tmp, dest).await?;
    Ok(())
}

fn extract_zip(zip_path: &Path, dest_dir: &Path) -> Result<()> {
    let bytes = std::fs::read(zip_path)?;
    let mut archive = ZipArchive::new(Cursor::new(bytes))?;
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        let out_path = match file.enclosed_name() {
            Some(p) => dest_dir.join(p),
            None => continue,
        };
        if file.is_dir() {
            std::fs::create_dir_all(&out_path)?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut out = std::fs::File::create(&out_path)?;
            std::io::copy(&mut file, &mut out)?;
        }
    }
    Ok(())
}

async fn setup_inner(
    app: &AppHandle,
    model_file: &str,
    variant: &str,
) -> Result<WhisperManagedStatus> {
    let model_file = model_file.trim();
    if model_file.is_empty() || !model_file.ends_with(".bin") || model_file.contains(['/', '\\']) {
        return Err(anyhow!("Некорректное имя модели"));
    }
    let (zip_name, url) = variant_url(variant).ok_or_else(|| anyhow!("Неизвестный вариант: {variant}"))?;

    // 1. Бинарь whisper.cpp выбранного варианта (в свою подпапку).
    let vdir = variant_dir(app, variant)?;
    tokio::fs::create_dir_all(&vdir).await?;
    if find_server_exe(&vdir).is_none() {
        let zip = vdir.join(zip_name);
        download_to_file(app, url, &zip, "binary", zip_name).await?;
        let vdir_clone = vdir.clone();
        let zip_clone = zip.clone();
        tokio::task::spawn_blocking(move || extract_zip(&zip_clone, &vdir_clone))
            .await
            .map_err(|e| anyhow!("Ошибка распаковки: {e}"))??;
        let _ = tokio::fs::remove_file(&zip).await;
        if find_server_exe(&vdir).is_none() {
            return Err(anyhow!("whisper-server.exe не найден в архиве"));
        }
    }

    // 2. Модель (общая для всех вариантов).
    let model_path = models_dir(app)?.join(model_file);
    if tokio::fs::metadata(&model_path).await.is_err() {
        let url = format!("{MODEL_BASE_URL}{model_file}");
        download_to_file(app, &url, &model_path, "model", model_file).await?;
    }

    build_status(app)
}

#[tauri::command]
pub async fn whisper_managed_status(app: AppHandle) -> Result<WhisperManagedStatus, String> {
    build_status(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn whisper_managed_setup(
    app: AppHandle,
    model_file: String,
    variant: String,
) -> Result<WhisperManagedStatus, String> {
    let _guard = install_lock().lock().await;
    setup_inner(&app, &model_file, &variant)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn whisper_managed_delete(app: AppHandle) -> Result<WhisperManagedStatus, String> {
    let dir = whisper_dir(&app).map_err(|e| e.to_string())?;
    if dir.exists() {
        tokio::fs::remove_dir_all(&dir)
            .await
            .map_err(|e| e.to_string())?;
    }
    build_status(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn whisper_managed_open_dir(app: AppHandle) -> Result<(), String> {
    let dir = whisper_dir(&app).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    {
        std::process::Command::new("explorer.exe")
            .arg(&dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
