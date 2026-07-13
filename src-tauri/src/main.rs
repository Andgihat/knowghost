#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod constants;
mod hotkeys;
mod audio;
mod ollama;
mod tray;
mod transcription;
mod types;
mod whisper_install;
mod whisper_server;
mod db;

use std::sync::{Arc, Mutex};
use std::time::Duration;
use std::fs::OpenOptions;
use std::io::Write;

use config::ConfigState;
use crate::constants::{
    DEFAULT_WINDOW_HEIGHT, DEFAULT_WINDOW_MIN_HEIGHT, DEFAULT_WINDOW_MIN_WIDTH, DEFAULT_WINDOW_WIDTH,
};
use hotkeys::HotkeyManager;
use audio::AudioManager;
use once_cell::sync::Lazy;
use tauri::LogicalSize;
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use types::AppConfig;
use tray::set_tray_visible;

// ── File logger for debugging ────────────────────────────────────────

fn log_msg(app: &AppHandle, msg: &str) {
    if let Ok(dir) = app.path().app_data_dir() {
        let path = dir.join("knowghost.log");
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) {
            let _ = writeln!(file, "[{}] {}", chrono::Utc::now().to_rfc3339(), msg);
        }
    }
}

#[cfg(target_os = "windows")]
static ORIGINAL_WNDPROC_BY_HWND: Lazy<Mutex<std::collections::HashMap<isize, isize>>> =
    Lazy::new(|| Mutex::new(std::collections::HashMap::new()));

#[cfg(target_os = "windows")]
fn is_resize_hit_test(hit_test_code: u16) -> bool {
    matches!(hit_test_code, 4 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17)
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn force_arrow_cursor_wndproc(
    hwnd: windows::Win32::Foundation::HWND,
    msg: u32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
) -> windows::Win32::Foundation::LRESULT {
    use windows::Win32::Foundation::LRESULT;
    use windows::Win32::UI::WindowsAndMessaging::{
        CallWindowProcW, DefWindowProcW, GWLP_WNDPROC, IDC_ARROW, LoadCursorW, SetCursor, SetWindowLongPtrW,
        WM_NCDESTROY, WM_SETCURSOR, WNDPROC,
    };

    if msg == WM_SETCURSOR {
        let hit_test = (lparam.0 & 0xFFFF) as u16;
        if is_resize_hit_test(hit_test) {
            if let Ok(cursor) = unsafe { LoadCursorW(None, IDC_ARROW) } {
                let _ = unsafe { SetCursor(Some(cursor)) };
            }
            return LRESULT(1);
        }
    }

    let hwnd_key = hwnd.0 as isize;
    let original_ptr = ORIGINAL_WNDPROC_BY_HWND
        .lock()
        .ok()
        .and_then(|map| map.get(&hwnd_key).copied())
        .unwrap_or(0);

    if msg == WM_NCDESTROY && original_ptr != 0 {
        let _ = unsafe { SetWindowLongPtrW(hwnd, GWLP_WNDPROC, original_ptr) };
        if let Ok(mut map) = ORIGINAL_WNDPROC_BY_HWND.lock() {
            map.remove(&hwnd_key);
        }
    }

    if original_ptr == 0 {
        return unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) };
    }

    let original_fn: unsafe extern "system" fn(
        windows::Win32::Foundation::HWND,
        u32,
        windows::Win32::Foundation::WPARAM,
        windows::Win32::Foundation::LPARAM,
    ) -> windows::Win32::Foundation::LRESULT = unsafe { std::mem::transmute(original_ptr) };
    let original: WNDPROC = Some(original_fn);
    unsafe { CallWindowProcW(original, hwnd, msg, wparam, lparam) }
}

#[cfg(target_os = "windows")]
fn install_force_default_cursor(window: &tauri::WebviewWindow) {
    use windows::Win32::Foundation::{GetLastError, HWND, SetLastError, WIN32_ERROR};
    use windows::Win32::UI::WindowsAndMessaging::{GWLP_WNDPROC, SetWindowLongPtrW};

    let Ok(raw_hwnd) = window.hwnd() else {
        return;
    };
    let hwnd = HWND(raw_hwnd.0);
    let hwnd_key = hwnd.0 as isize;

    if ORIGINAL_WNDPROC_BY_HWND
        .lock()
        .map(|map| map.contains_key(&hwnd_key))
        .unwrap_or(false)
    {
        return;
    }

    unsafe { SetLastError(WIN32_ERROR(0)) };
    let previous = unsafe { SetWindowLongPtrW(hwnd, GWLP_WNDPROC, force_arrow_cursor_wndproc as usize as isize) };
    if previous == 0 {
        let error = unsafe { GetLastError() };
        if error.0 != 0 {
            eprintln!("[window] failed to install cursor override hook: {}", error.0);
            return;
        }
    }

    if let Ok(mut map) = ORIGINAL_WNDPROC_BY_HWND.lock() {
        map.insert(hwnd_key, previous);
    }
}

#[tauri::command]
async fn config_get(state: State<'_, Arc<ConfigState>>) -> Result<AppConfig, String> {
    Ok(state.get().await)
}

#[tauri::command]
async fn config_update(
    app: tauri::AppHandle,
    state: State<'_, Arc<ConfigState>>,
    hotkeys: State<'_, Arc<HotkeyManager>>,
    payload: serde_json::Value,
) -> Result<AppConfig, String> {
    let apply_window_size = payload.get("windowWidth").is_some() || payload.get("windowHeight").is_some();
    let updated = state
        .update(payload)
        .await
        .map_err(|error| error.to_string())?;
    app.emit("config:updated", &updated)
        .map_err(|error| error.to_string())?;
    handle_config_effects(&app, &updated, hotkeys.inner().clone(), apply_window_size);
    Ok(updated)
}

#[tauri::command]
async fn config_reset(
    app: tauri::AppHandle,
    state: State<'_, Arc<ConfigState>>,
    hotkeys: State<'_, Arc<HotkeyManager>>,
) -> Result<AppConfig, String> {
    let updated = state
        .reset()
        .await
        .map_err(|error| error.to_string())?;
    app.emit("config:updated", &updated)
        .map_err(|error| error.to_string())?;
    handle_config_effects(&app, &updated, hotkeys.inner().clone(), true);
    Ok(updated)
}

#[tauri::command]
async fn config_path(state: State<'_, Arc<ConfigState>>) -> Result<String, String> {
    Ok(state.path().await.to_string_lossy().to_string())
}

#[tauri::command]
async fn open_config_folder(
    app: tauri::AppHandle,
    state: State<'_, Arc<ConfigState>>,
) -> Result<(), String> {
    let dir = state.directory().await;
    tauri_plugin_opener::OpenerExt::opener(&app)
        .open_path(dir.to_string_lossy(), None::<String>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn open_external_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;

    let normalized = url.trim();
    if normalized.is_empty() {
        return Err("URL is empty".to_string());
    }
    if !(normalized.starts_with("https://") || normalized.starts_with("http://")) {
        return Err("Only http(s) URLs are allowed".to_string());
    }

    app.opener()
        .open_url(normalized.to_string(), None::<String>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn ollama_check_installed() -> Result<bool, String> {
    crate::ollama::check_installed()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn ollama_list_models() -> Result<Vec<String>, String> {
    crate::ollama::list_models()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn ollama_pull_model(model: String) -> Result<(), String> {
    crate::ollama::pull_model(&model)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn ollama_warmup_model(model: String) -> Result<(), String> {
    crate::ollama::warmup_model(&model)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn audio_list_devices(manager: State<'_, Arc<AudioManager>>) -> Result<Vec<audio::AudioDeviceInfo>, String> {
    manager.list_devices().map_err(|e| e.to_string())
}

#[tauri::command]
async fn audio_start_capture(
    app: tauri::AppHandle,
    manager: State<'_, Arc<AudioManager>>,
    source: String,
    device_id: Option<String>,
) -> Result<(), String> {
    manager.start(app, &source, device_id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn audio_stop_capture(manager: State<'_, Arc<AudioManager>>) -> Result<(), String> {
    manager.stop().map_err(|e| e.to_string())
}

// ── API Key management ──────────────────────────────────────────────

#[tauri::command]
async fn api_keys_list(
    state: State<'_, Arc<ConfigState>>,
) -> Result<Vec<types::SavedApiKey>, String> {
    let cfg = state.get().await;
    Ok(cfg.saved_api_keys)
}

#[tauri::command]
async fn api_keys_save(
    app: tauri::AppHandle,
    state: State<'_, Arc<ConfigState>>,
    key: types::SavedApiKey,
) -> Result<AppConfig, String> {
    let mut cfg = state.get().await;
    // Заменяем существующий или добавляем новый
    if let Some(existing) = cfg.saved_api_keys.iter_mut().find(|k| k.id == key.id) {
        *existing = key;
    } else {
        cfg.saved_api_keys.push(key);
    }
    // Сохраняем через update
    let patch = serde_json::to_value(&cfg).map_err(|e| e.to_string())?;
    let updated = state.update(patch).await.map_err(|e| e.to_string())?;
    app.emit("config:updated", &updated).map_err(|e| e.to_string())?;
    Ok(updated)
}

#[tauri::command]
async fn api_keys_remove(
    app: tauri::AppHandle,
    state: State<'_, Arc<ConfigState>>,
    id: String,
) -> Result<AppConfig, String> {
    let mut cfg = state.get().await;
    cfg.saved_api_keys.retain(|k| k.id != id);
    if cfg.active_api_key_id.as_deref() == Some(&id) {
        cfg.active_api_key_id = None;
    }
    let patch = serde_json::to_value(&cfg).map_err(|e| e.to_string())?;
    let updated = state.update(patch).await.map_err(|e| e.to_string())?;
    app.emit("config:updated", &updated).map_err(|e| e.to_string())?;
    Ok(updated)
}

#[tauri::command]
async fn api_keys_activate(
    app: tauri::AppHandle,
    state: State<'_, Arc<ConfigState>>,
    id: String,
) -> Result<AppConfig, String> {
    let mut cfg = state.get().await;
    let key = cfg.saved_api_keys.iter().find(|k| k.id == id)
        .cloned()
        .ok_or_else(|| format!("Key {} not found", id))?;
    cfg.active_api_key_id = Some(id);
    // Копируем ключ в активные поля для обратной совместимости
    match key.provider.as_str() {
        "google" => {
            cfg.google_api_key = Some(key.api_key.clone());
        }
        _ => {
            // OpenAI-совместимые: openai, deepseek, openrouter, custom
            cfg.openai_api_key = Some(key.api_key.clone());
            cfg.api_base_url = key.base_url.clone();
        }
    }
    let patch = serde_json::to_value(&cfg).map_err(|e| e.to_string())?;
    let updated = state.update(patch).await.map_err(|e| e.to_string())?;
    app.emit("config:updated", &updated).map_err(|e| e.to_string())?;
    Ok(updated)
}

#[tauri::command]
async fn ollama_http_request(
    url: String,
    method: String,
    headers: serde_json::Value,
    body: Option<String>,
    timeout_secs: Option<u64>,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_secs.unwrap_or(600)))
        .build()
        .map_err(|e| e.to_string())?;

    let mut request = match method.as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        _ => return Err(format!("Unsupported method: {}", method)),
    };

    // Добавляем заголовки
    if let serde_json::Value::Object(map) = headers {
        for (key, value) in map {
            if let Some(val_str) = value.as_str() {
                request = request.header(&key, val_str);
            }
        }
    }

    // Добавляем тело запроса
    if let Some(body_str) = body {
        request = request.body(body_str);
    }

    let response = request.send().await.map_err(|e| e.to_string())?;
    let status = response.status();
    let text = response.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format!("HTTP {}: {}", status.as_u16(), text));
    }

    Ok(text)
}

fn handle_config_effects(
    app: &AppHandle,
    config: &AppConfig,
    hotkeys: Arc<HotkeyManager>,
    apply_window_size: bool,
) {
    hotkeys.apply_config(app, config);
    if let Err(error) = apply_window_preferences(app, config, apply_window_size) {
        eprintln!("[window] failed to apply preferences: {error}");
    }
}

fn apply_window_preferences(app: &AppHandle, config: &AppConfig, apply_window_size: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let scale = config.window_scale.clamp(0.5, 3.0);
        
        // Применяем размер окна БЕЗ масштабирования
        // Масштабирование контента происходит через CSS font-size на html
        if apply_window_size {
            let base_width = config
                .window_width
                .max(DEFAULT_WINDOW_MIN_WIDTH)
                .min(4000) as f64;
            let base_height = config
                .window_height
                .max(DEFAULT_WINDOW_MIN_HEIGHT)
                .min(4000) as f64;
            
            // Используем базовый размер окна без масштабирования
            window
                .set_size(LogicalSize::new(base_width, base_height))
                .map_err(|error| error.to_string())?;
            window
                .set_min_size(Some(LogicalSize::new(
                    DEFAULT_WINDOW_MIN_WIDTH as f64,
                    DEFAULT_WINDOW_MIN_HEIGHT as f64,
                )))
                .map_err(|error| error.to_string())?;
        }
        
        window
            .set_always_on_top(config.always_on_top)
            .map_err(|error| error.to_string())?;
        #[cfg(not(target_os = "linux"))]
        {
            window
                .set_skip_taskbar(config.hide_app)
                .map_err(|error| error.to_string())?;
        }
        set_tray_visible(!config.hide_app);
        
        window.show().map_err(|error| error.to_string())?;
        
        // Применяем opacity и скрытие от записи экрана (Windows) после показа окна
        #[cfg(target_os = "windows")]
        {
            // Используем таймер для применения opacity после того, как окно полностью готово
            let app_clone = app.clone();
            let opacity_value = config.window_opacity.clamp(10, 100);
            let hide_app_value = config.hide_app;
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(200));
                if let Some(w) = app_clone.get_webview_window("main") {
                    if let Ok(hwnd) = w.hwnd() {
                        use windows::Win32::Foundation::HWND;
                        use windows::Win32::UI::WindowsAndMessaging::{
                            SetWindowDisplayAffinity, SetLayeredWindowAttributes, WDA_EXCLUDEFROMCAPTURE, WDA_NONE,
                            GWL_EXSTYLE, WS_EX_LAYERED, LWA_ALPHA, GetWindowLongPtrW, SetWindowLongPtrW
                        };
                        
                        let hwnd_handle = HWND(hwnd.0);
                        
                        // Применяем opacity через SetLayeredWindowAttributes
                        let alpha = ((opacity_value as f32 / 100.0) * 255.0) as u8;
                        unsafe {
                            // Устанавливаем WS_EX_LAYERED стиль
                            let ex_style = GetWindowLongPtrW(hwnd_handle, GWL_EXSTYLE);
                            let layered_flag = WS_EX_LAYERED.0 as isize;
                            SetWindowLongPtrW(hwnd_handle, GWL_EXSTYLE, ex_style | layered_flag);
                            // Устанавливаем opacity
                            let _ = SetLayeredWindowAttributes(hwnd_handle, windows::Win32::Foundation::COLORREF(0), alpha, LWA_ALPHA);
                        }
                        
                        // Применяем скрытие от записи экрана
                        unsafe {
                            if hide_app_value {
                                let _ = SetWindowDisplayAffinity(hwnd_handle, WDA_EXCLUDEFROMCAPTURE);
                            } else {
                                let _ = SetWindowDisplayAffinity(hwnd_handle, WDA_NONE);
                            }
                        }
                    }
                }
            });
        }
        
        // Применяем scale через CSS переменную и font-size на html
        // Это масштабирует все элементы, использующие rem единицы
        let scale_script = format!(
            r#"
            (function() {{
                const html = document.documentElement;
                if (!html) return;
                
                // Устанавливаем CSS переменную для масштаба
                html.style.setProperty('--app-scale', '{}');
                
                // Устанавливаем font-size на html для масштабирования через rem
                // Базовый размер 16px, умножаем на scale
                const baseFontSize = 16;
                const scaledFontSize = baseFontSize * {};
                html.style.fontSize = scaledFontSize + 'px';
            }})();
            "#,
            scale, scale
        );
        // Применяем scale после небольшой задержки
        let app_clone = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(300));
            if let Some(w) = app_clone.get_webview_window("main") {
                let _ = w.eval(&scale_script);
            }
        });
    }
    Ok(())
}

pub fn show_main_window(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        #[cfg(target_os = "windows")]
        install_force_default_cursor(&window);

        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        Ok(())
    } else {
        tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()))
            .title("XexamAI")
            .inner_size(DEFAULT_WINDOW_WIDTH as f64, DEFAULT_WINDOW_HEIGHT as f64)
            .min_inner_size(
                DEFAULT_WINDOW_MIN_WIDTH as f64,
                DEFAULT_WINDOW_MIN_HEIGHT as f64,
            )
            .decorations(false)
            .transparent(true)
            .build()
            .map_err(|error| error.to_string())?;
        if let Some(window) = app.get_webview_window("main") {
            #[cfg(target_os = "windows")]
            install_force_default_cursor(&window);

            window.show().map_err(|error| error.to_string())?;
            window.set_focus().map_err(|error| error.to_string())?;
        }
        Ok(())
    }
}


// ── Database commands ─────────────────────────────────────────────────

#[tauri::command]
async fn list_cards(app: AppHandle, state: State<'_, Arc<db::Database>>) -> Result<Vec<db::Card>, String> {
    let result = state.list_cards().map_err(|e| {
        let msg = format!("list_cards error: {e}");
        log_msg(&app, &msg);
        e.to_string()
    });
    log_msg(&app, &format!("list_cards: {} cards", result.as_ref().map(|v| v.len()).unwrap_or(0)));
    result
}

#[tauri::command]
async fn get_card(app: AppHandle, state: State<'_, Arc<db::Database>>, id: String) -> Result<Option<db::Card>, String> {
    log_msg(&app, &format!("get_card: id={id}"));
    state.get_card(&id).map_err(|e| {
        log_msg(&app, &format!("get_card error: {e}"));
        e.to_string()
    })
}

#[tauri::command]
async fn create_card(app: AppHandle, state: State<'_, Arc<db::Database>>, req: db::CreateCardRequest) -> Result<db::Card, String> {
    log_msg(&app, &format!("create_card: title={}", req.title));
    let result = state.create_card(req).map_err(|e| {
        log_msg(&app, &format!("create_card error: {e}"));
        e.to_string()
    });
    if let Ok(ref card) = result {
        log_msg(&app, &format!("create_card OK: id={}", card.id));
    }
    result
}

#[tauri::command]
async fn update_card(state: State<'_, Arc<db::Database>>, req: db::UpdateCardRequest) -> Result<db::Card, String> {
    state.update_card(req).map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_card(state: State<'_, Arc<db::Database>>, id: String) -> Result<(), String> {
    state.delete_card(&id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn search_cards(state: State<'_, Arc<db::Database>>, query: String) -> Result<Vec<db::Card>, String> {
    state.search_cards(&query).map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_messages(app: AppHandle, state: State<'_, Arc<db::Database>>, card_id: String) -> Result<Vec<db::Message>, String> {
    log_msg(&app, &format!("list_messages: card_id={card_id}"));
    let result = state.list_messages(&card_id).map_err(|e| {
        let msg = format!("list_messages error: {e}");
        log_msg(&app, &msg);
        e.to_string()
    });
    if let Ok(ref msgs) = result {
        log_msg(&app, &format!("list_messages: {} messages for card_id={card_id}", msgs.len()));
    }
    result
}

#[tauri::command]
async fn create_message(app: AppHandle, state: State<'_, Arc<db::Database>>, req: db::CreateMessageRequest) -> Result<db::Message, String> {
    log_msg(&app, &format!("create_message: card_id={}, role={}, content_len={}", req.card_id, req.role, req.content.len()));
    let result = state.create_message(req).map_err(|e| {
        log_msg(&app, &format!("create_message error: {e}"));
        e.to_string()
    });
    log_msg(&app, &format!("create_message OK: id={}", result.as_ref().map(|m| m.id.as_str()).unwrap_or("?")));
    result
}

#[tauri::command]
async fn delete_messages(state: State<'_, Arc<db::Database>>, card_id: String) -> Result<(), String> {
    state.delete_messages(&card_id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn debug_log(app: AppHandle, msg: String) -> Result<(), String> {
    log_msg(&app, &format!("[DEBUG] {msg}"));
    Ok(())
}

#[tauri::command]
async fn list_prompts(state: State<'_, Arc<db::Database>>, prompt_type: Option<String>) -> Result<Vec<db::Prompt>, String> {
    state.list_prompts(prompt_type.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
async fn create_prompt(state: State<'_, Arc<db::Database>>, req: db::CreatePromptRequest) -> Result<db::Prompt, String> {
    state.create_prompt(req).map_err(|e| e.to_string())
}

#[tauri::command]
async fn update_prompt(state: State<'_, Arc<db::Database>>, id: String, name: Option<String>, content: Option<String>) -> Result<(), String> {
    state.update_prompt(&id, name.as_deref(), content.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_active_prompt(state: State<'_, Arc<db::Database>>, id: String, prompt_type: String) -> Result<(), String> {
    state.set_active_prompt(&id, &prompt_type).map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_prompt(state: State<'_, Arc<db::Database>>, id: String) -> Result<(), String> {
    state.delete_prompt(&id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_active_prompt(state: State<'_, Arc<db::Database>>, prompt_type: String) -> Result<Option<db::Prompt>, String> {
    state.get_active_prompt(&prompt_type).map_err(|e| e.to_string())
}


fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = show_main_window(app);
        }))
        .setup(|app| {
            let app_handle = app.handle();
            let config_state =
                Arc::new(tauri::async_runtime::block_on(ConfigState::initialize(&app_handle))?);
            let initial_config = tauri::async_runtime::block_on(config_state.get());

            let hotkeys = Arc::new(HotkeyManager::new());
            let audio_manager = Arc::new(AudioManager::new());

            app.manage(config_state.clone());
            app.manage(hotkeys.clone());
            app.manage(audio_manager.clone());
            app.manage(whisper_server::WhisperServerState::default());
            // Initialize SQLite database
            let app_dir = app_handle.path().app_data_dir().expect("failed to get app data dir");
            let database = db::Database::new(&app_dir).expect("failed to initialize database");
            app.manage(Arc::new(database));

            tray::setup(&app_handle)?;
            handle_config_effects(&app_handle, &initial_config, hotkeys, true);

            if let Some(main_window) = app.get_webview_window("main") {
                #[cfg(target_os = "windows")]
                install_force_default_cursor(&main_window);

                let app_handle = app_handle.clone();
                main_window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        // Не оставлять запущенный whisper-server осиротевшим.
                        let _ = whisper_server::whisper_server_stop(
                            app_handle.state::<whisper_server::WhisperServerState>(),
                        );
                        app_handle.exit(0);
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            config_get,
            config_update,
            config_reset,
            config_path,
            open_config_folder,
            open_external_url,
            ollama_http_request,
            ollama_check_installed,
            ollama_list_models,
            ollama_pull_model,
            ollama_warmup_model,
            audio_list_devices,
            audio_start_capture,
            audio_stop_capture,
            transcription::transcribe_audio,
            whisper_server::whisper_server_start,
            whisper_server::whisper_server_stop,
            whisper_server::whisper_server_status,
            whisper_install::whisper_managed_status,
            whisper_install::whisper_managed_setup,
            whisper_install::whisper_managed_delete,
            whisper_install::whisper_managed_open_dir,
            api_keys_list,
            api_keys_save,
            api_keys_remove,
            api_keys_activate,
            list_cards,
            get_card,
            create_card,
            update_card,
            delete_card,
            search_cards,
            list_messages,
            create_message,
            delete_messages,
            debug_log,
            list_prompts,
            create_prompt,
            update_prompt,
            set_active_prompt,
            delete_prompt,
            get_active_prompt,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}