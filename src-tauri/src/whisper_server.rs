use std::process::{Child, Command};
use std::sync::Mutex;

use tauri::State;

/// Хэндл запущенного whisper-server процесса (запускается из UI кнопкой).
#[derive(Default)]
pub struct WhisperServerState(pub Mutex<Option<Child>>);

const HOST: &str = "127.0.0.1";
const PORT: &str = "8868"; // совпадает с transcribe_local в transcription.rs
const INFERENCE_PATH: &str = "/v1/audio/transcriptions";

#[tauri::command]
pub fn whisper_server_start(
    state: State<'_, WhisperServerState>,
    exe: String,
    model: String,
) -> Result<bool, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;

    // Уже запущен?
    if let Some(child) = guard.as_mut() {
        match child.try_wait() {
            Ok(None) => return Ok(true),
            _ => *guard = None,
        }
    }

    if exe.trim().is_empty() || model.trim().is_empty() {
        return Err("Укажите путь к whisper-server.exe и к файлу модели".into());
    }

    let mut cmd = Command::new(exe.trim());
    cmd.args([
        "-m",
        model.trim(),
        "--host",
        HOST,
        "--port",
        PORT,
        "--inference-path",
        INFERENCE_PATH,
        "-l",
        "auto",
    ]);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW — без всплывающей консоли
    }

    let child = cmd
        .spawn()
        .map_err(|e| format!("Не удалось запустить whisper-server: {e}"))?;
    *guard = Some(child);
    Ok(true)
}

#[tauri::command]
pub fn whisper_server_stop(state: State<'_, WhisperServerState>) -> Result<bool, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    Ok(false)
}

#[tauri::command]
pub fn whisper_server_status(state: State<'_, WhisperServerState>) -> Result<bool, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    match guard.as_mut() {
        Some(child) => match child.try_wait() {
            Ok(None) => Ok(true),
            _ => {
                *guard = None;
                Ok(false)
            }
        },
        None => Ok(false),
    }
}
