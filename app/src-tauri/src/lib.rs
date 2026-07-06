mod config;
mod league_client;
mod native_core;
mod plugins;
mod runtime;
mod shell;
mod store;
mod windows;

use config::{LoaderConfig, LoaderPaths};
use native_core::NativeCoreStatus;
use plugins::{PluginEntry, PluginToggle};
use runtime::RuntimeStatus;
use serde::Serialize;
use std::{
    fs, io,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};
use store::{StoreInstallResult, StorePlugin, StorePluginInstall, StoreUninstallResult};
use tauri::{Manager, Runtime};
use windows::ActivationStatus;

#[derive(Debug, Clone, Serialize)]
struct AppStatus {
    app_name: &'static str,
    version: &'static str,
    injector: &'static str,
    core_exists: bool,
    paths: LoaderPaths,
}

#[derive(Debug, Clone, Serialize)]
struct DiagnosticsBundle {
    created_at: u128,
    app: AppStatus,
    config: LoaderConfig,
    runtime: RuntimeStatus,
    native_core: NativeCoreStatus,
    activation: ActivationStatus,
    plugins: Vec<PluginEntry>,
    diagnostics: DiagnosticsFiles,
}

#[derive(Debug, Clone, Serialize)]
struct DiagnosticsFiles {
    directory: String,
    latest_json: String,
    core_trace_tail: Vec<String>,
}

#[tauri::command]
fn app_status() -> AppStatus {
    AppStatus {
        app_name: "maoloader",
        version: env!("CARGO_PKG_VERSION"),
        injector: "scaffolded",
        core_exists: config::core_exists(),
        paths: config::loader_paths(),
    }
}

fn current_epoch_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

#[tauri::command]
fn loader_paths() -> LoaderPaths {
    config::loader_paths()
}

#[tauri::command]
fn ensure_base_layout() -> Result<LoaderPaths, String> {
    ensure_loader_layout().map_err(|error| error.to_string())
}

#[tauri::command]
fn read_loader_config() -> Result<LoaderConfig, String> {
    config::read_config().map_err(|error| error.to_string())
}

#[tauri::command]
fn write_loader_config(config: LoaderConfig) -> Result<(), String> {
    if let Ok(current) = config::read_config() {
        let current_mode = windows::ActivationMode::from_config(&current.app.activation_mode);
        let next_mode = windows::ActivationMode::from_config(&config.app.activation_mode);
        if current_mode != next_mode && windows::status().activated {
            return Err("Deactivate maoloader before changing activation mode".into());
        }
    }

    config::write_config(&config).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_plugins() -> Result<Vec<PluginEntry>, String> {
    plugins::list_plugins().map_err(|error| error.to_string())
}

#[tauri::command]
fn set_plugin_enabled(toggle: PluginToggle) -> Result<Vec<PluginEntry>, String> {
    plugins::set_plugin_enabled(toggle).map_err(|error| error.to_string())
}

#[tauri::command]
fn open_plugins_folder() -> Result<String, String> {
    let path = plugins::ensure_plugins_dir().map_err(|error| error.to_string())?;
    let path = path.display().to_string();
    shell::open_path(&path).map_err(|error| error.to_string())?;
    Ok(path)
}

#[tauri::command]
fn validate_league_dir(path: String) -> bool {
    league_client::validate_dir(path)
}

#[tauri::command]
fn find_league_dir() -> Result<Option<String>, String> {
    league_client::find_league_path()
        .map(|path| path.map(|path| path.display().to_string()))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn runtime_status() -> RuntimeStatus {
    runtime::status()
}

#[tauri::command]
fn sync_runtime_assets() -> Result<RuntimeStatus, String> {
    runtime::sync_assets().map_err(|error| error.to_string())
}

#[tauri::command]
fn native_core_status() -> NativeCoreStatus {
    native_core::status()
}

#[tauri::command]
fn activation_status() -> ActivationStatus {
    windows::status()
}

#[tauri::command]
fn set_activation(active: bool) -> ActivationStatus {
    if active {
        if let Err(error) = ensure_loader_layout() {
            let mut status = windows::status();
            status.message = format!("SyncRuntime ({})", error.kind());
            return status;
        }
    }
    windows::set_active(active)
}

fn ensure_loader_layout() -> io::Result<LoaderPaths> {
    let paths = config::ensure_base_layout()?;
    runtime::sync_assets()?;
    Ok(paths)
}

fn sync_bundled_core<R: Runtime>(app: &tauri::App<R>) -> io::Result<()> {
    let dest = config::core_path();
    let Some(source) = bundled_core_candidates(app)?
        .into_iter()
        .find(|path| path.exists() && path != &dest)
    else {
        return Ok(());
    };

    if binary_files_match(&source, &dest)? {
        return Ok(());
    }

    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::copy(source, dest)?;
    Ok(())
}

fn bundled_core_candidates<R: Runtime>(app: &tauri::App<R>) -> io::Result<Vec<PathBuf>> {
    let mut candidates = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("core.dll"));
        candidates.push(resource_dir.join("bin").join("core.dll"));
    }

    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("bin/core.dll"));

    Ok(candidates)
}

fn binary_files_match(source: &std::path::Path, dest: &std::path::Path) -> io::Result<bool> {
    match (fs::metadata(source), fs::metadata(dest)) {
        (Ok(source_metadata), Ok(dest_metadata))
            if source_metadata.len() == dest_metadata.len() =>
        {
            Ok(fs::read(source)? == fs::read(dest)?)
        }
        (_, Err(error)) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        (Ok(_), Ok(_)) => Ok(false),
        (Err(error), _) => Err(error),
        (_, Err(error)) => Err(error),
    }
}

#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    shell::open_path(&path).map_err(|error| error.to_string())
}

#[tauri::command]
fn reveal_path(path: String) -> Result<(), String> {
    shell::reveal_path(&path).map_err(|error| error.to_string())
}

#[tauri::command]
fn install_store_plugin(plugin: StorePluginInstall) -> Result<StoreInstallResult, String> {
    store::install_plugin(plugin).map_err(|error| error.to_string())
}

#[tauri::command]
fn uninstall_store_plugin(plugin: StorePluginInstall) -> Result<StoreUninstallResult, String> {
    store::uninstall_plugin(plugin).map_err(|error| error.to_string())
}

#[tauri::command]
fn fetch_store_plugins() -> Result<Vec<StorePlugin>, String> {
    store::fetch_plugins().map_err(|error| error.to_string())
}

#[tauri::command]
fn create_diagnostics_bundle() -> Result<String, String> {
    let created_at = current_epoch_millis();
    let diagnostics_dir = config::base_dir().join("diagnostics");
    fs::create_dir_all(&diagnostics_dir).map_err(|error| error.to_string())?;

    let bundle = DiagnosticsBundle {
        created_at,
        app: app_status(),
        config: config::read_config().unwrap_or_default(),
        runtime: runtime::status(),
        native_core: native_core::status(),
        activation: windows::status(),
        plugins: plugins::list_plugins().unwrap_or_default(),
        diagnostics: DiagnosticsFiles {
            directory: diagnostics_dir.display().to_string(),
            latest_json: fs::read_to_string(diagnostics_dir.join("latest.json"))
                .unwrap_or_default(),
            core_trace_tail: read_tail_lines(diagnostics_dir.join("core-trace.log"), 120),
        },
    };

    let path = diagnostics_dir.join(format!("maoloader-diagnostics-{created_at}.json"));
    let content = serde_json::to_string_pretty(&bundle).map_err(|error| error.to_string())?;
    fs::write(&path, content).map_err(|error| error.to_string())?;
    Ok(path.display().to_string())
}

fn read_tail_lines(path: PathBuf, limit: usize) -> Vec<String> {
    let Ok(content) = fs::read_to_string(path) else {
        return Vec::new();
    };
    let lines = content
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();
    let start = lines.len().saturating_sub(limit);
    lines[start..].to_vec()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    windows::handle_activation_entrypoint();

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            sync_bundled_core(app)?;
            ensure_loader_layout()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_status,
            loader_paths,
            ensure_base_layout,
            read_loader_config,
            write_loader_config,
            list_plugins,
            set_plugin_enabled,
            open_plugins_folder,
            validate_league_dir,
            find_league_dir,
            runtime_status,
            sync_runtime_assets,
            native_core_status,
            activation_status,
            set_activation,
            open_path,
            reveal_path,
            install_store_plugin,
            uninstall_store_plugin,
            fetch_store_plugins,
            create_diagnostics_bundle,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::binary_files_match;

    #[test]
    fn binary_files_match_detects_missing_and_changed_destinations() {
        let root = std::env::temp_dir().join(format!("maoloader-core-sync-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();

        let source = root.join("source.dll");
        let dest = root.join("dest.dll");
        std::fs::write(&source, b"core-v1").unwrap();

        assert!(!binary_files_match(&source, &dest).unwrap());
        std::fs::write(&dest, b"core-v0").unwrap();
        assert!(!binary_files_match(&source, &dest).unwrap());
        std::fs::write(&dest, b"core-v1").unwrap();
        assert!(binary_files_match(&source, &dest).unwrap());

        let _ = std::fs::remove_dir_all(root);
    }
}
