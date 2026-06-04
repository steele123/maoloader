use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};

#[derive(Debug, Clone, Serialize)]
pub struct NativeCoreStatus {
    pub path: String,
    pub loadable: bool,
    pub plugin_count: usize,
    pub datastore_len: usize,
    pub process_kind: u32,
    pub libcef_version: i32,
    pub supported_libcef_major: i32,
    pub libcef_supported: bool,
    pub hook_ready: bool,
    pub browser_hook_symbols: usize,
    pub renderer_hook_symbols: usize,
    pub command_line_mutations: usize,
    pub plugins_scheme_registrations: usize,
    pub riotclient_scheme_registrations: usize,
    pub riotclient_credential_captures: usize,
    pub riotclient_scheme_creates: usize,
    pub riotclient_proxy_targets: usize,
    pub riotclient_proxy_requests: usize,
    pub riotclient_urlrequest_launches: usize,
    pub riotclient_urlrequest_completes: usize,
    pub riotclient_urlrequest_data_bytes: usize,
    pub riotclient_credentials_ready: bool,
    pub plugins_scheme_creates: usize,
    pub plugins_asset_resolves: usize,
    pub renderer_main_contexts: usize,
    pub renderer_preload_executes: usize,
    pub renderer_native_exposes: usize,
    pub browser_main_client_hooks: usize,
    pub browser_native_messages: usize,
    pub browser_background_patches: usize,
    pub devtools_open_attempts: usize,
    pub devtools_open_successes: usize,
    pub diagnostics_trace_records: usize,
    pub diagnostics_rotated: bool,
    pub diagnostics_latest_event: String,
    pub diagnostics_latest_session: String,
    pub diagnostics_latest_pid: u32,
    pub diagnostics_latest_ts: u128,
    pub error: String,
}

#[derive(Debug, Clone, Deserialize)]
struct LatestDiagnosticRecord {
    #[serde(default)]
    ts: u128,
    #[serde(default)]
    session: String,
    #[serde(default)]
    pid: u32,
    #[serde(default)]
    event: String,
}

type PluginCount = unsafe extern "system" fn() -> usize;
type DatastoreLen = unsafe extern "system" fn() -> usize;
type ProcessKind = unsafe extern "system" fn() -> u32;
type LibcefVersion = unsafe extern "system" fn() -> i32;
type HookReady = unsafe extern "system" fn() -> bool;
type HookSymbolCount = unsafe extern "system" fn() -> usize;

pub fn status() -> NativeCoreStatus {
    let path = crate::config::core_path();
    let mut status = NativeCoreStatus {
        path: path.display().to_string(),
        loadable: false,
        plugin_count: 0,
        datastore_len: 0,
        process_kind: 0,
        libcef_version: 0,
        supported_libcef_major: 0,
        libcef_supported: false,
        hook_ready: false,
        browser_hook_symbols: 0,
        renderer_hook_symbols: 0,
        command_line_mutations: 0,
        plugins_scheme_registrations: 0,
        riotclient_scheme_registrations: 0,
        riotclient_credential_captures: 0,
        riotclient_scheme_creates: 0,
        riotclient_proxy_targets: 0,
        riotclient_proxy_requests: 0,
        riotclient_urlrequest_launches: 0,
        riotclient_urlrequest_completes: 0,
        riotclient_urlrequest_data_bytes: 0,
        riotclient_credentials_ready: false,
        plugins_scheme_creates: 0,
        plugins_asset_resolves: 0,
        renderer_main_contexts: 0,
        renderer_preload_executes: 0,
        renderer_native_exposes: 0,
        browser_main_client_hooks: 0,
        browser_native_messages: 0,
        browser_background_patches: 0,
        devtools_open_attempts: 0,
        devtools_open_successes: 0,
        diagnostics_trace_records: 0,
        diagnostics_rotated: false,
        diagnostics_latest_event: String::new(),
        diagnostics_latest_session: String::new(),
        diagnostics_latest_pid: 0,
        diagnostics_latest_ts: 0,
        error: String::new(),
    };

    apply_diagnostics_status(&mut status);

    let library = match unsafe { libloading::Library::new(&path) } {
        Ok(library) => library,
        Err(error) => {
            status.error = error.to_string();
            return status;
        }
    };

    status.loadable = true;

    unsafe {
        status.plugin_count = call_symbol::<PluginCount>(&library, b"maoloader_plugin_count\0")
            .map(|symbol| symbol())
            .unwrap_or(0);
        status.datastore_len = call_symbol::<DatastoreLen>(&library, b"maoloader_datastore_len\0")
            .map(|symbol| symbol())
            .unwrap_or(0);
        status.process_kind = call_symbol::<ProcessKind>(&library, b"maoloader_process_kind\0")
            .map(|symbol| symbol())
            .unwrap_or(0);
        status.libcef_version =
            call_symbol::<LibcefVersion>(&library, b"maoloader_libcef_version\0")
                .map(|symbol| symbol())
                .unwrap_or(0);
        status.supported_libcef_major =
            call_symbol::<LibcefVersion>(&library, b"maoloader_supported_libcef_major\0")
                .map(|symbol| symbol())
                .unwrap_or(0);
        status.libcef_supported =
            call_symbol::<HookReady>(&library, b"maoloader_libcef_supported\0")
                .map(|symbol| symbol())
                .unwrap_or(false);
        status.hook_ready = call_symbol::<HookReady>(&library, b"maoloader_hook_ready\0")
            .map(|symbol| symbol())
            .unwrap_or(false);
        status.browser_hook_symbols =
            call_symbol::<HookSymbolCount>(&library, b"maoloader_browser_hook_symbol_count\0")
                .map(|symbol| symbol())
                .unwrap_or(0);
        status.renderer_hook_symbols =
            call_symbol::<HookSymbolCount>(&library, b"maoloader_renderer_hook_symbol_count\0")
                .map(|symbol| symbol())
                .unwrap_or(0);
        status.command_line_mutations =
            call_symbol::<HookSymbolCount>(&library, b"maoloader_command_line_mutation_count\0")
                .map(|symbol| symbol())
                .unwrap_or(0);
        status.plugins_scheme_registrations = call_symbol::<HookSymbolCount>(
            &library,
            b"maoloader_plugins_scheme_registration_count\0",
        )
        .map(|symbol| symbol())
        .unwrap_or(0);
        status.riotclient_scheme_registrations = call_symbol::<HookSymbolCount>(
            &library,
            b"maoloader_riotclient_scheme_registration_count\0",
        )
        .map(|symbol| symbol())
        .unwrap_or(0);
        status.riotclient_credential_captures = call_symbol::<HookSymbolCount>(
            &library,
            b"maoloader_riotclient_credential_capture_count\0",
        )
        .map(|symbol| symbol())
        .unwrap_or(0);
        status.riotclient_scheme_creates =
            call_symbol::<HookSymbolCount>(&library, b"maoloader_riotclient_scheme_create_count\0")
                .map(|symbol| symbol())
                .unwrap_or(0);
        status.riotclient_proxy_targets =
            call_symbol::<HookSymbolCount>(&library, b"maoloader_riotclient_proxy_target_count\0")
                .map(|symbol| symbol())
                .unwrap_or(0);
        status.riotclient_proxy_requests =
            call_symbol::<HookSymbolCount>(&library, b"maoloader_riotclient_proxy_request_count\0")
                .map(|symbol| symbol())
                .unwrap_or(0);
        status.riotclient_urlrequest_launches = call_symbol::<HookSymbolCount>(
            &library,
            b"maoloader_riotclient_urlrequest_launch_count\0",
        )
        .map(|symbol| symbol())
        .unwrap_or(0);
        status.riotclient_urlrequest_completes = call_symbol::<HookSymbolCount>(
            &library,
            b"maoloader_riotclient_urlrequest_complete_count\0",
        )
        .map(|symbol| symbol())
        .unwrap_or(0);
        status.riotclient_urlrequest_data_bytes = call_symbol::<HookSymbolCount>(
            &library,
            b"maoloader_riotclient_urlrequest_data_bytes\0",
        )
        .map(|symbol| symbol())
        .unwrap_or(0);
        status.riotclient_credentials_ready =
            call_symbol::<HookReady>(&library, b"maoloader_riotclient_credentials_ready\0")
                .map(|symbol| symbol())
                .unwrap_or(false);
        status.plugins_scheme_creates =
            call_symbol::<HookSymbolCount>(&library, b"maoloader_plugins_scheme_create_count\0")
                .map(|symbol| symbol())
                .unwrap_or(0);
        status.plugins_asset_resolves =
            call_symbol::<HookSymbolCount>(&library, b"maoloader_plugins_asset_resolve_count\0")
                .map(|symbol| symbol())
                .unwrap_or(0);
        status.renderer_main_contexts =
            call_symbol::<HookSymbolCount>(&library, b"maoloader_renderer_main_context_count\0")
                .map(|symbol| symbol())
                .unwrap_or(0);
        status.renderer_preload_executes =
            call_symbol::<HookSymbolCount>(&library, b"maoloader_renderer_preload_execute_count\0")
                .map(|symbol| symbol())
                .unwrap_or(0);
        status.renderer_native_exposes =
            call_symbol::<HookSymbolCount>(&library, b"maoloader_renderer_native_expose_count\0")
                .map(|symbol| symbol())
                .unwrap_or(0);
        status.browser_main_client_hooks =
            call_symbol::<HookSymbolCount>(&library, b"maoloader_browser_main_client_hook_count\0")
                .map(|symbol| symbol())
                .unwrap_or(0);
        status.browser_native_messages =
            call_symbol::<HookSymbolCount>(&library, b"maoloader_browser_native_message_count\0")
                .map(|symbol| symbol())
                .unwrap_or(0);
        status.browser_background_patches =
            call_symbol::<HookSymbolCount>(&library, b"maoloader_browser_background_patch_count\0")
                .map(|symbol| symbol())
                .unwrap_or(0);
        status.devtools_open_attempts =
            call_symbol::<HookSymbolCount>(&library, b"maoloader_devtools_open_attempt_count\0")
                .map(|symbol| symbol())
                .unwrap_or(0);
        status.devtools_open_successes =
            call_symbol::<HookSymbolCount>(&library, b"maoloader_devtools_open_success_count\0")
                .map(|symbol| symbol())
                .unwrap_or(0);
    }

    status
}

fn apply_diagnostics_status(status: &mut NativeCoreStatus) {
    let dir = diagnostics_dir();
    let trace_path = dir.join("core-trace.log");
    let rotated_path = dir.join("core-trace.1.log");
    let latest_path = dir.join("latest.json");

    status.diagnostics_trace_records = count_non_empty_lines(&trace_path);
    status.diagnostics_rotated = rotated_path.is_file();

    let Ok(latest) = fs::read_to_string(latest_path) else {
        return;
    };
    let Ok(record) = serde_json::from_str::<LatestDiagnosticRecord>(&latest) else {
        return;
    };

    status.diagnostics_latest_event = record.event;
    status.diagnostics_latest_session = record.session;
    status.diagnostics_latest_pid = record.pid;
    status.diagnostics_latest_ts = record.ts;
}

fn diagnostics_dir() -> PathBuf {
    crate::config::base_dir().join("diagnostics")
}

fn count_non_empty_lines(path: &PathBuf) -> usize {
    let Ok(content) = fs::read_to_string(path) else {
        return 0;
    };

    content
        .lines()
        .filter(|line| !line.trim().is_empty())
        .count()
}

unsafe fn call_symbol<'lib, T>(
    library: &'lib libloading::Library,
    name: &[u8],
) -> Result<libloading::Symbol<'lib, T>, libloading::Error> {
    unsafe { library.get(name) }
}
