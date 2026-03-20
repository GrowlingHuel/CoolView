mod config;
mod monitor;
mod sensors;

use std::{fs, io::Write, path::PathBuf, sync::{Arc, Mutex}, time::Duration};
use chrono::{Duration as ChronoDuration, Local};
use config::Config;
use monitor::Monitor;
use sensors::SensorReader;
use sysinfo::{System, ProcessesToUpdate};
use serde::{Deserialize, Serialize};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, PhysicalPosition, Runtime, WebviewWindow,
};

struct AppState { config: Config, monitor: Monitor, visible: bool }
type SharedState = Arc<Mutex<AppState>>;

#[derive(Clone, Serialize, Deserialize)]
struct ProcessInfo { name: String, cpu_percent: f32, pid: u32 }

#[derive(Clone, Serialize, Deserialize)]
struct TempPayload {
    cpu: f32, gpu: Option<f32>, motherboard: Option<f32>,
    is_warning: bool, history: Vec<f32>, top_processes: Vec<ProcessInfo>,
}

#[derive(Clone, Serialize, Deserialize)]
struct HistoryEntry {
    timestamp: String, cpu: f32, gpu: Option<f32>, motherboard: Option<f32>, top_processes: Vec<ProcessInfo>,
}

fn config_path(app: &AppHandle) -> PathBuf { app.path().app_config_dir().unwrap_or_default().join("config.toml") }
fn log_path(app: &AppHandle) -> PathBuf { app.path().app_log_dir().unwrap_or_default().join("warnings.log") }
fn history_path(app: &AppHandle) -> PathBuf { app.path().app_data_dir().unwrap_or_default().join("history.csv") }
fn processes_path(app: &AppHandle) -> PathBuf { app.path().app_data_dir().unwrap_or_default().join("history_processes.json") }

fn load_config(app: &AppHandle) -> Config {
    let path = config_path(app);
    if let Ok(contents) = fs::read_to_string(&path) { toml::from_str(&contents).unwrap_or_default() } else { Config::default() }
}

fn save_config(app: &AppHandle, config: &Config) -> anyhow::Result<()> {
    let path = config_path(app);
    if let Some(parent) = path.parent() { fs::create_dir_all(parent)?; }
    fs::write(path, toml::to_string_pretty(config)?)?;
    Ok(())
}

fn append_history(app: &AppHandle, cpu: f32, gpu: Option<f32>, mb: Option<f32>) {
    let path = history_path(app);
    let write_header = !path.exists();
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(&path) {
        if write_header { let _ = writeln!(f, "timestamp,cpu,gpu,motherboard"); }
        let g_s = gpu.map(|v| format!("{:.1}", v)).unwrap_or_default();
        let m_s = mb.map(|v| format!("{:.1}", v)).unwrap_or_default();
        let _ = writeln!(f, "{},{:.1},{},{}", Local::now().format("%Y-%m-%dT%H:%M:%S"), cpu, g_s, m_s);
    }
}

fn position_window<R: Runtime>(window: &WebviewWindow<R>, position: &str) {
    if let (Ok(Some(monitor)), Ok(win_size)) = (window.current_monitor(), window.outer_size()) {
        let screen = monitor.size();
        let scale  = monitor.scale_factor();
        let pad    = (12.0 * scale) as u32;
        let (x, y) = match position {
            "top-left"     => (pad as i32, pad as i32),
            "bottom-right" => (screen.width.saturating_sub(win_size.width + pad) as i32, screen.height.saturating_sub(win_size.height + pad) as i32),
            "bottom-left"  => (pad as i32, screen.height.saturating_sub(win_size.height + pad) as i32),
            _              => (screen.width.saturating_sub(win_size.width + pad) as i32, pad as i32),
        };
        let _ = window.set_position(PhysicalPosition::new(x, y));
    }
}

#[tauri::command]
fn get_config(state: tauri::State<SharedState>) -> Config { state.lock().unwrap().config.clone() }

#[tauri::command]
fn set_config(app: AppHandle, state: tauri::State<SharedState>, new_config: Config) -> Result<(), String> {
    let old_pos = state.lock().unwrap().config.display.position.clone();
    state.lock().unwrap().config = new_config.clone();
    save_config(&app, &new_config).map_err(|e| e.to_string())?;
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_always_on_top(new_config.display.always_on_top);
        if new_config.display.position != old_pos { position_window(&w, &new_config.display.position); }
    }
    Ok(())
}

#[tauri::command]
async fn open_panel(app: AppHandle, label: String) {
    if let Some(old) = app.get_webview_window("panel") { let _ = old.close(); }
    if let Some(hud) = app.get_webview_window("main") {
        let pos = hud.outer_position().unwrap_or_default();
        let size = hud.outer_size().unwrap_or_default();
        let mon = hud.current_monitor().unwrap().unwrap();
        let spawn_y = if pos.y > (mon.size().height / 2) as i32 { pos.y - 470 } else { pos.y + size.height as i32 + 10 };
        let _ = tauri::WebviewWindowBuilder::new(&app, "panel", tauri::WebviewUrl::App(format!("index.html#{}", label).into()))
            .position(pos.x as f64, spawn_y as f64).inner_size(350.0, 480.0)
            .decorations(false).always_on_top(true).transparent(false).build().unwrap();
    }
}

fn start_poll_loop(app: AppHandle, state: SharedState) {
    std::thread::spawn(move || {
        let mut reader = SensorReader::new();
        let mut last_cpu: f32 = 0.0;
        loop {
            let (cfg, m_cfg) = { let s = state.lock().unwrap(); (s.config.clone(), s.config.monitor.clone()) };
            let reading = reader.read();
            let cpu = if m_cfg.cpu { reading.cpu } else { 0.0 };
            let gpu = if m_cfg.gpu { reading.gpu } else { None };
            let mb = if m_cfg.motherboard { reading.motherboard } else { None };
            last_cpu = cpu;

            let (is_warning, _st, history) = { let mut s = state.lock().unwrap(); s.monitor.tick(cpu, &cfg.thresholds) };
            
            append_history(&app, cpu, gpu, mb);
            let _ = app.emit("temp-update", &TempPayload { cpu, gpu, motherboard: mb, is_warning, history, top_processes: vec![] });
            
            std::thread::sleep(Duration::from_secs(if cpu >= 80.0 { 10 } else { cfg.thresholds.poll_interval_seconds }));
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let cfg = load_config(app.handle());
            let state: SharedState = Arc::new(Mutex::new(AppState { monitor: Monitor::new(), config: cfg.clone(), visible: true }));
            app.manage(state.clone());
            if let Some(w) = app.get_webview_window("main") { position_window(&w, &cfg.display.position); }
            
            let tray_state = state.clone();
            let show = MenuItemBuilder::with_id("show", "Show / Hide HUD").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let menu = MenuBuilder::new(app).items(&[&show, &quit]).build()?;
            let _ = TrayIconBuilder::new().icon(app.default_window_icon().unwrap().clone()).menu(&menu).on_menu_event(move |app, e| {
                if e.id() == "show" {
                    if let Some(w) = app.get_webview_window("main") {
                        let mut s = tray_state.lock().unwrap();
                        if s.visible { let _ = w.hide(); s.visible = false; } else { let _ = w.show(); s.visible = true; }
                    }
                } else if e.id() == "quit" { app.exit(0); }
            }).build(app)?;

            start_poll_loop(app.handle().clone(), state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_config, set_config, open_panel])
        .run(tauri::generate_context!())
        .expect("error while running CoolView");
}
