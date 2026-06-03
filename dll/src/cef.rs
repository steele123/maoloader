use std::{
    ffi::c_void,
    sync::{
        OnceLock,
        atomic::{AtomicUsize, Ordering},
    },
};

use crate::cef_types::{
    self, CefApp, CefBrowserPrefix, CefClientPrefix, CefCommandLine, CefDictionaryValuePrefix,
    CefFramePrefix, CefKeyEvent, CefKeyboardHandlerPrefix, CefLifeSpanHandlerPrefix,
    CefProcessMessagePrefix, CefRenderProcessHandler, CefString,
};

#[derive(Debug, Clone, Copy, Default)]
pub struct CefHookState {
    pub initialize: bool,
    pub create_browser: bool,
    pub create_context: bool,
    pub execute_process: bool,
}

static HOOK_STATE: OnceLock<CefHookState> = OnceLock::new();
static COMMAND_LINE_MUTATION_COUNT: AtomicUsize = AtomicUsize::new(0);
static PLUGINS_SCHEME_REGISTRATION_COUNT: AtomicUsize = AtomicUsize::new(0);
static RIOTCLIENT_SCHEME_REGISTRATION_COUNT: AtomicUsize = AtomicUsize::new(0);
static RIOTCLIENT_CREDENTIAL_CAPTURE_COUNT: AtomicUsize = AtomicUsize::new(0);
static RIOTCLIENT_SCHEME_CREATE_COUNT: AtomicUsize = AtomicUsize::new(0);
static RIOTCLIENT_PROXY_TARGET_COUNT: AtomicUsize = AtomicUsize::new(0);
static RIOTCLIENT_PROXY_REQUEST_COUNT: AtomicUsize = AtomicUsize::new(0);
static RIOTCLIENT_URLREQUEST_LAUNCH_COUNT: AtomicUsize = AtomicUsize::new(0);
static RIOTCLIENT_URLREQUEST_COMPLETE_COUNT: AtomicUsize = AtomicUsize::new(0);
static RIOTCLIENT_URLREQUEST_DATA_BYTES: AtomicUsize = AtomicUsize::new(0);
static PLUGINS_SCHEME_CREATE_COUNT: AtomicUsize = AtomicUsize::new(0);
static PLUGINS_ASSET_RESOLVE_COUNT: AtomicUsize = AtomicUsize::new(0);
static RENDERER_MAIN_CONTEXT_COUNT: AtomicUsize = AtomicUsize::new(0);
static RENDERER_PRELOAD_EXECUTE_COUNT: AtomicUsize = AtomicUsize::new(0);
static RENDERER_NATIVE_EXPOSE_COUNT: AtomicUsize = AtomicUsize::new(0);
static BROWSER_MAIN_CLIENT_HOOK_COUNT: AtomicUsize = AtomicUsize::new(0);
static BROWSER_NATIVE_MESSAGE_COUNT: AtomicUsize = AtomicUsize::new(0);
static BROWSER_BACKGROUND_PATCH_COUNT: AtomicUsize = AtomicUsize::new(0);
static DEVTOOLS_OPEN_ATTEMPT_COUNT: AtomicUsize = AtomicUsize::new(0);
static DEVTOOLS_OPEN_SUCCESS_COUNT: AtomicUsize = AtomicUsize::new(0);

#[cfg(windows)]
static mut CEF_INITIALIZE_HOOK: Option<crate::hook::InlineHook> = None;
#[cfg(windows)]
static mut CEF_CREATE_BROWSER_HOOK: Option<crate::hook::InlineHook> = None;
#[cfg(windows)]
static mut CEF_CREATE_CONTEXT_HOOK: Option<crate::hook::InlineHook> = None;
#[cfg(windows)]
static mut CEF_EXECUTE_PROCESS_HOOK: Option<crate::hook::InlineHook> = None;

static mut ON_BEFORE_COMMAND_LINE_PROCESSING: Option<cef_types::OnBeforeCommandLineProcessing> =
    None;
static mut GET_RENDER_PROCESS_HANDLER: Option<cef_types::GetRenderProcessHandler> = None;
static mut ON_BROWSER_CREATED: Option<cef_types::OnBrowserCreated> = None;
static mut ON_CONTEXT_CREATED: Option<cef_types::OnContextCreated> = None;
static mut CLIENT_ON_PROCESS_MESSAGE_RECEIVED: Option<cef_types::ClientOnProcessMessageReceived> =
    None;
static mut CLIENT_GET_KEYBOARD_HANDLER: Option<cef_types::GetKeyboardHandler> = None;
static mut KEYBOARD_ON_PRE_KEY_EVENT: Option<cef_types::OnPreKeyEvent> = None;
static mut CLIENT_GET_LIFE_SPAN_HANDLER: Option<cef_types::GetLifeSpanHandler> = None;
static mut LIFE_SPAN_ON_AFTER_CREATED: Option<cef_types::OnAfterCreated> = None;
static mut RENDERER_IS_MAIN: bool = false;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum HotkeyAction {
    OpenDevtools,
    ReloadClient,
    RestartClient,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BrowserNativeMessage {
    OpenDevtools,
    ReloadClient,
    SetWindowVibrancy,
    SetWindowTheme,
}

impl BrowserNativeMessage {
    fn from_name(name: &str) -> Option<Self> {
        match name {
            "@open-devtools" => Some(Self::OpenDevtools),
            "@reload-client" => Some(Self::ReloadClient),
            "@set-window-vibrancy" => Some(Self::SetWindowVibrancy),
            "@set-window-theme" => Some(Self::SetWindowTheme),
            _ => None,
        }
    }
}

#[allow(dead_code)]
pub fn install_for_browser_process() -> CefHookState {
    install_browser_background_patch();
    crate::process_hook::install_browser_child_process_hooks();

    install_hooks(&[
        ("cef_initialize", hooked_cef_initialize as *const c_void),
        (
            "cef_browser_host_create_browser",
            hooked_cef_browser_host_create_browser as *const c_void,
        ),
        (
            "cef_request_context_create_context",
            hooked_cef_request_context_create_context as *const c_void,
        ),
    ])
}

#[allow(dead_code)]
pub fn install_for_renderer_process() -> CefHookState {
    install_hooks(&[(
        "cef_execute_process",
        hooked_cef_execute_process as *const c_void,
    )])
}

pub fn probe_symbols() -> CefHookState {
    #[cfg(windows)]
    {
        let Some(libcef) = crate::dylib::find_lib("libcef.dll") else {
            return CefHookState::default();
        };

        let state = CefHookState {
            initialize: crate::dylib::find_proc(libcef, "cef_initialize").is_some(),
            create_browser: crate::dylib::find_proc(libcef, "cef_browser_host_create_browser")
                .is_some(),
            create_context: crate::dylib::find_proc(libcef, "cef_request_context_create_context")
                .is_some(),
            execute_process: crate::dylib::find_proc(libcef, "cef_execute_process").is_some(),
        };

        let _ = HOOK_STATE.set(state);
        return state;
    }

    #[cfg(not(windows))]
    {
        CefHookState::default()
    }
}

pub fn command_line_mutation_count() -> usize {
    COMMAND_LINE_MUTATION_COUNT.load(Ordering::Relaxed)
}

pub fn plugins_scheme_registration_count() -> usize {
    PLUGINS_SCHEME_REGISTRATION_COUNT.load(Ordering::Relaxed)
}

pub fn riotclient_scheme_registration_count() -> usize {
    RIOTCLIENT_SCHEME_REGISTRATION_COUNT.load(Ordering::Relaxed)
}

pub fn riotclient_credential_capture_count() -> usize {
    RIOTCLIENT_CREDENTIAL_CAPTURE_COUNT.load(Ordering::Relaxed)
}

pub fn riotclient_scheme_create_count() -> usize {
    RIOTCLIENT_SCHEME_CREATE_COUNT.load(Ordering::Relaxed)
}

pub fn riotclient_proxy_target_count() -> usize {
    RIOTCLIENT_PROXY_TARGET_COUNT.load(Ordering::Relaxed)
}

pub fn riotclient_proxy_request_count() -> usize {
    RIOTCLIENT_PROXY_REQUEST_COUNT.load(Ordering::Relaxed)
}

pub fn riotclient_urlrequest_launch_count() -> usize {
    RIOTCLIENT_URLREQUEST_LAUNCH_COUNT.load(Ordering::Relaxed)
}

pub fn riotclient_urlrequest_complete_count() -> usize {
    RIOTCLIENT_URLREQUEST_COMPLETE_COUNT.load(Ordering::Relaxed)
}

pub fn riotclient_urlrequest_data_bytes() -> usize {
    RIOTCLIENT_URLREQUEST_DATA_BYTES.load(Ordering::Relaxed)
}

pub fn riotclient_credentials_ready() -> bool {
    crate::riotclient::credentials_ready()
}

pub fn plugins_scheme_create_count() -> usize {
    PLUGINS_SCHEME_CREATE_COUNT.load(Ordering::Relaxed)
}

pub fn plugins_asset_resolve_count() -> usize {
    PLUGINS_ASSET_RESOLVE_COUNT.load(Ordering::Relaxed)
}

pub fn renderer_main_context_count() -> usize {
    RENDERER_MAIN_CONTEXT_COUNT.load(Ordering::Relaxed)
}

pub fn renderer_preload_execute_count() -> usize {
    RENDERER_PRELOAD_EXECUTE_COUNT.load(Ordering::Relaxed)
}

pub fn renderer_native_expose_count() -> usize {
    RENDERER_NATIVE_EXPOSE_COUNT.load(Ordering::Relaxed)
}

pub fn browser_main_client_hook_count() -> usize {
    BROWSER_MAIN_CLIENT_HOOK_COUNT.load(Ordering::Relaxed)
}

pub fn browser_native_message_count() -> usize {
    BROWSER_NATIVE_MESSAGE_COUNT.load(Ordering::Relaxed)
}

pub fn browser_background_patch_count() -> usize {
    BROWSER_BACKGROUND_PATCH_COUNT.load(Ordering::Relaxed)
}

pub fn devtools_open_attempt_count() -> usize {
    DEVTOOLS_OPEN_ATTEMPT_COUNT.load(Ordering::Relaxed)
}

pub fn devtools_open_success_count() -> usize {
    DEVTOOLS_OPEN_SUCCESS_COUNT.load(Ordering::Relaxed)
}

fn open_devtools(browser: *mut CefBrowserPrefix) -> bool {
    DEVTOOLS_OPEN_ATTEMPT_COUNT.fetch_add(1, Ordering::Relaxed);
    let opened = unsafe { cef_types::browser_open_devtools(browser) };
    if opened {
        DEVTOOLS_OPEN_SUCCESS_COUNT.fetch_add(1, Ordering::Relaxed);
    }
    opened
}

#[cfg(windows)]
fn install_browser_background_patch() {
    const GET_BACKGROUND_COLOR_PATTERN: &str = "41 83 F8 01 74 0B 41 83 F8 02 75 0A 45 31 C0";

    let Some(libcef) = crate::dylib::find_lib("libcef.dll") else {
        return;
    };
    let Some(version_info) = crate::dylib::find_proc(libcef, "cef_version_info") else {
        return;
    };
    let Some(target) =
        crate::dylib::find_memory(version_info.cast_const(), GET_BACKGROUND_COLOR_PATTERN)
    else {
        return;
    };

    let Ok(hook) = (unsafe {
        crate::hook::InlineHook::install(target, transparent_browser_background as *const c_void)
    }) else {
        return;
    };

    Box::leak(Box::new(hook));
    BROWSER_BACKGROUND_PATCH_COUNT.fetch_add(1, Ordering::Relaxed);
}

#[cfg(not(windows))]
fn install_browser_background_patch() {}

#[cfg(windows)]
unsafe extern "system" fn transparent_browser_background(
    _context: *mut c_void,
    _browser_settings: *mut c_void,
    _state: i32,
) -> u32 {
    0
}

pub fn record_plugins_scheme_create() {
    PLUGINS_SCHEME_CREATE_COUNT.fetch_add(1, Ordering::Relaxed);
}

pub fn record_plugins_asset_resolve() {
    PLUGINS_ASSET_RESOLVE_COUNT.fetch_add(1, Ordering::Relaxed);
}

pub fn record_riotclient_scheme_create(target_resolved: bool) {
    RIOTCLIENT_SCHEME_CREATE_COUNT.fetch_add(1, Ordering::Relaxed);
    if target_resolved {
        RIOTCLIENT_PROXY_TARGET_COUNT.fetch_add(1, Ordering::Relaxed);
    }
}

pub fn record_riotclient_proxy_request() {
    RIOTCLIENT_PROXY_REQUEST_COUNT.fetch_add(1, Ordering::Relaxed);
}

pub fn record_riotclient_urlrequest_launch() {
    RIOTCLIENT_URLREQUEST_LAUNCH_COUNT.fetch_add(1, Ordering::Relaxed);
}

pub fn record_riotclient_urlrequest_complete(bytes: usize) {
    let _ = bytes;
    RIOTCLIENT_URLREQUEST_COMPLETE_COUNT.fetch_add(1, Ordering::Relaxed);
}

pub fn record_riotclient_urlrequest_data(bytes: usize) {
    RIOTCLIENT_URLREQUEST_DATA_BYTES.fetch_add(bytes, Ordering::Relaxed);
}

fn install_hooks(symbols: &[(&str, *const c_void)]) -> CefHookState {
    #[cfg(windows)]
    {
        let Some(libcef) = crate::dylib::find_lib("libcef.dll") else {
            return CefHookState::default();
        };

        let mut state = CefHookState::default();

        for (symbol, replacement) in symbols {
            let Some(target) = crate::dylib::find_proc(libcef, symbol) else {
                continue;
            };

            let installed = unsafe { crate::hook::InlineHook::install(target, *replacement).ok() };
            let Some(hook) = installed else {
                continue;
            };

            match *symbol {
                "cef_initialize" => {
                    state.initialize = true;
                    unsafe { CEF_INITIALIZE_HOOK = Some(hook) };
                }
                "cef_browser_host_create_browser" => {
                    state.create_browser = true;
                    unsafe { CEF_CREATE_BROWSER_HOOK = Some(hook) };
                }
                "cef_request_context_create_context" => {
                    state.create_context = true;
                    unsafe { CEF_CREATE_CONTEXT_HOOK = Some(hook) };
                }
                "cef_execute_process" => {
                    state.execute_process = true;
                    unsafe { CEF_EXECUTE_PROCESS_HOOK = Some(hook) };
                }
                _ => {}
            }
        }

        let _ = HOOK_STATE.set(state);
        return state;
    }

    #[cfg(not(windows))]
    {
        let _ = symbols;
        CefHookState::default()
    }
}

unsafe extern "C" fn hooked_cef_initialize(
    args: *const c_void,
    settings: *const c_void,
    app: *mut c_void,
    sandbox_info: *mut c_void,
) -> i32 {
    type Fn = unsafe extern "C" fn(*const c_void, *const c_void, *mut c_void, *mut c_void) -> i32;

    #[cfg(windows)]
    unsafe {
        prepare_cef_initialize(settings, app);

        return call_original(&raw mut CEF_INITIALIZE_HOOK, |target| {
            let original: Fn = std::mem::transmute(target);
            original(args, settings, app, sandbox_info)
        })
        .unwrap_or(0);
    }

    #[cfg(not(windows))]
    {
        let _ = (args, settings, app, sandbox_info);
        0
    }
}

unsafe fn prepare_cef_initialize(settings: *const c_void, app: *mut c_void) {
    let cache_dir = crate::config::cache_dir().display().to_string();
    unsafe {
        cef_types::set_settings_cache_paths(settings, &cache_dir);
    }

    if app.is_null() {
        return;
    }

    let app = app.cast::<CefApp>();
    unsafe {
        ON_BEFORE_COMMAND_LINE_PROCESSING = (*app).on_before_command_line_processing;
        (*app).on_before_command_line_processing = Some(hooked_on_before_command_line_processing);
    }
}

unsafe extern "system" fn hooked_on_before_command_line_processing(
    app: *mut CefApp,
    process_type: *const CefString,
    command_line: *mut CefCommandLine,
) {
    capture_riotclient_credentials(command_line);

    unsafe {
        if let Some(original) = ON_BEFORE_COMMAND_LINE_PROCESSING {
            original(app, process_type, command_line);
        }
    }

    apply_command_line_options(command_line);
}

fn apply_command_line_options(command_line: *mut CefCommandLine) {
    let mut applied = 0;

    unsafe {
        if crate::config::option_bool("use_proxy", false) {
            if let Some(command_line_string) = cef_types::command_line_string(command_line) {
                let cleaned = remove_no_proxy_server_switch(&command_line_string);
                if cleaned != command_line_string
                    && cef_types::reset_command_line_from_string(command_line, &cleaned)
                {
                    applied += 1;
                }
            }
            cef_types::append_switch(command_line, "proxy-auto-detect");
            applied += 1;
        }

        let debug_port = crate::config::option_int("debug_port", 0);
        if debug_port > 0 && debug_port < u16::MAX.into() {
            cef_types::append_switch_with_value(
                command_line,
                "remote-debugging-port",
                &debug_port.to_string(),
            );
            applied += 1;
        }

        if crate::config::option_bool_alias("isecure_mode", "insecure_mode", false) {
            cef_types::append_switch(command_line, "disable-web-security");
            applied += 1;
        }

        if crate::config::option_bool("optimized_client", true) {
            for switch in [
                "disable-background-timer-throttling",
                "disable-backgrounding-occluded-windows",
                "disable-renderer-backgrounding",
                "disable-metrics",
                "disable-component-update",
                "disable-domain-reliability",
                "disable-translate",
                "disable-gpu-watchdog",
                "disable-renderer-accessibility",
                "no-sandbox",
            ] {
                cef_types::append_switch(command_line, switch);
                applied += 1;
            }
        }

        if crate::config::option_bool("super_potato", false) {
            cef_types::append_switch(command_line, "disable-smooth-scrolling");
            cef_types::append_switch(command_line, "wm-window-animations-disabled");
            cef_types::append_switch_with_value(command_line, "animation-duration-scale", "0");
            applied += 3;
        }
    }

    COMMAND_LINE_MUTATION_COUNT.fetch_add(applied, Ordering::Relaxed);
}

fn capture_riotclient_credentials(command_line: *mut CefCommandLine) {
    if !crate::config::option_bool("use_riotclient", false) {
        return;
    }

    unsafe {
        if let (Some(port), Some(token)) = (
            cef_types::switch_value(command_line, "riotclient-app-port"),
            cef_types::switch_value(command_line, "riotclient-auth-token"),
        ) {
            crate::riotclient::set_credentials(&port, &token);
            RIOTCLIENT_CREDENTIAL_CAPTURE_COUNT.fetch_add(1, Ordering::Relaxed);
        }
    }
}

fn remove_no_proxy_server_switch(command_line: &str) -> String {
    let Some(position) = command_line.find("--no-proxy-server") else {
        return command_line.into();
    };

    let mut cleaned = command_line.to_string();
    cleaned.replace_range(position..position + "--no-proxy-server".len(), "");
    cleaned
}

unsafe extern "C" fn hooked_cef_browser_host_create_browser(
    window_info: *const c_void,
    client: *mut c_void,
    url: *const c_void,
    settings: *const c_void,
    extra_info: *mut c_void,
    request_context: *mut c_void,
) -> i32 {
    type Fn = unsafe extern "C" fn(
        *const c_void,
        *mut c_void,
        *const c_void,
        *const c_void,
        *mut c_void,
        *mut c_void,
    ) -> i32;

    #[cfg(windows)]
    unsafe {
        let mut extra_info = extra_info;
        if cef_types::borrowed_cef_string(url.cast::<CefString>())
            .is_some_and(|url| url.starts_with("https://riot:") && url.ends_with("/bootstrap.html"))
        {
            if extra_info.is_null() {
                extra_info = cef_types::dictionary_create().cast();
            }

            if cef_types::dictionary_set_null(
                extra_info.cast::<CefDictionaryValuePrefix>(),
                "is_main",
            ) {
                hook_main_browser_client(client.cast::<CefClientPrefix>());
            }
        }

        return call_original(&raw mut CEF_CREATE_BROWSER_HOOK, |target| {
            let original: Fn = std::mem::transmute(target);
            original(
                window_info,
                client,
                url,
                settings,
                extra_info,
                request_context,
            )
        })
        .unwrap_or(0);
    }

    #[cfg(not(windows))]
    {
        let _ = (
            window_info,
            client,
            url,
            settings,
            extra_info,
            request_context,
        );
        0
    }
}

unsafe fn hook_main_browser_client(client: *mut CefClientPrefix) {
    if client.is_null() {
        return;
    }

    unsafe {
        hook_keyboard_handler(client);
        hook_life_span_handler(client);
        CLIENT_ON_PROCESS_MESSAGE_RECEIVED = (*client).on_process_message_received;
        (*client).on_process_message_received = Some(hooked_client_on_process_message_received);
    }

    BROWSER_MAIN_CLIENT_HOOK_COUNT.fetch_add(1, Ordering::Relaxed);
}

unsafe fn hook_life_span_handler(client: *mut CefClientPrefix) {
    unsafe {
        CLIENT_GET_LIFE_SPAN_HANDLER = (*client).get_life_span_handler;
        (*client).get_life_span_handler = Some(hooked_get_life_span_handler);
    }
}

unsafe extern "system" fn hooked_get_life_span_handler(
    client: *mut CefClientPrefix,
) -> *mut CefLifeSpanHandlerPrefix {
    let handler = unsafe {
        CLIENT_GET_LIFE_SPAN_HANDLER
            .map(|original| original(client))
            .unwrap_or(std::ptr::null_mut())
    };

    if !handler.is_null() {
        unsafe {
            LIFE_SPAN_ON_AFTER_CREATED = (*handler).on_after_created;
            (*handler).on_after_created = Some(hooked_life_span_on_after_created);
        }
    }

    handler
}

unsafe extern "system" fn hooked_life_span_on_after_created(
    handler: *mut CefLifeSpanHandlerPrefix,
    browser: *mut CefBrowserPrefix,
) {
    unsafe {
        if let Some(original) = LIFE_SPAN_ON_AFTER_CREATED {
            original(handler, browser);
        }
        cef_types::browser_setup_window(browser);
    }
}

unsafe fn hook_keyboard_handler(client: *mut CefClientPrefix) {
    if !crate::config::option_bool("use_hotkeys", true) {
        return;
    }

    unsafe {
        CLIENT_GET_KEYBOARD_HANDLER = (*client).get_keyboard_handler;
        (*client).get_keyboard_handler = Some(hooked_get_keyboard_handler);
    }
}

unsafe extern "system" fn hooked_get_keyboard_handler(
    client: *mut CefClientPrefix,
) -> *mut CefKeyboardHandlerPrefix {
    let handler = unsafe {
        CLIENT_GET_KEYBOARD_HANDLER
            .map(|original| original(client))
            .unwrap_or(std::ptr::null_mut())
    };

    if !handler.is_null() {
        unsafe {
            KEYBOARD_ON_PRE_KEY_EVENT = (*handler).on_pre_key_event;
            (*handler).on_pre_key_event = Some(hooked_keyboard_on_pre_key_event);
        }
    }

    handler
}

unsafe extern "system" fn hooked_keyboard_on_pre_key_event(
    handler: *mut CefKeyboardHandlerPrefix,
    browser: *mut CefBrowserPrefix,
    event: *const CefKeyEvent,
    os_event: *mut c_void,
    is_keyboard_shortcut: *mut i32,
) -> i32 {
    if !event.is_null() && unsafe { handle_hotkey(browser, &*event) } {
        return 1;
    }

    unsafe {
        KEYBOARD_ON_PRE_KEY_EVENT
            .map(|original| original(handler, browser, event, os_event, is_keyboard_shortcut))
            .unwrap_or(0)
    }
}

unsafe fn handle_hotkey(browser: *mut CefBrowserPrefix, event: &CefKeyEvent) -> bool {
    match hotkey_action(event) {
        Some(HotkeyAction::OpenDevtools) => {
            crate::config::option_bool("use_devtools", false) && open_devtools(browser)
        }
        Some(HotkeyAction::ReloadClient) => unsafe {
            cef_types::browser_reload_ignore_cache(browser)
        },
        Some(HotkeyAction::RestartClient) => {
            cef_types::confirm_restart_client()
                && unsafe {
                    cef_types::browser_execute_main_frame_script(
                        browser,
                        "fetch('/riotclient/kill-and-restart-ux', { method: 'POST' })",
                        "https://plugins/@/restart-client",
                    )
                }
        }
        None => false,
    }
}

fn hotkey_action(event: &CefKeyEvent) -> Option<HotkeyAction> {
    if event.focus_on_editable_field != 0 {
        return None;
    }

    const VK_F12: i32 = 0x7b;
    const VK_RETURN: i32 = 0x0d;

    let chord = primary_hotkey_chord(event.modifiers);
    let key = normalized_key_code(event.windows_key_code);

    if event.windows_key_code == VK_F12 || (chord && key == 'I' as i32) {
        return Some(HotkeyAction::OpenDevtools);
    }

    if chord && key == 'R' as i32 {
        return Some(HotkeyAction::ReloadClient);
    }

    if chord && event.windows_key_code == VK_RETURN {
        return Some(HotkeyAction::RestartClient);
    }

    None
}

fn normalized_key_code(key: i32) -> i32 {
    if (b'a' as i32..=b'z' as i32).contains(&key) {
        key - 32
    } else {
        key
    }
}

fn primary_hotkey_chord(modifiers: u32) -> bool {
    #[cfg(target_os = "macos")]
    {
        const EVENTFLAG_ALT_DOWN: u32 = 1 << 0;
        const EVENTFLAG_COMMAND_DOWN: u32 = 1 << 7;

        modifiers & (EVENTFLAG_COMMAND_DOWN | EVENTFLAG_ALT_DOWN)
            == (EVENTFLAG_COMMAND_DOWN | EVENTFLAG_ALT_DOWN)
    }

    #[cfg(not(target_os = "macos"))]
    {
        const EVENTFLAG_SHIFT_DOWN: u32 = 1 << 1;
        const EVENTFLAG_CONTROL_DOWN: u32 = 1 << 2;

        modifiers & (EVENTFLAG_CONTROL_DOWN | EVENTFLAG_SHIFT_DOWN)
            == (EVENTFLAG_CONTROL_DOWN | EVENTFLAG_SHIFT_DOWN)
    }
}

unsafe extern "system" fn hooked_client_on_process_message_received(
    client: *mut CefClientPrefix,
    browser: *mut CefBrowserPrefix,
    frame: *mut c_void,
    source_process: i32,
    message: *mut CefProcessMessagePrefix,
) -> i32 {
    const PID_RENDERER: i32 = 1;

    if source_process == PID_RENDERER {
        let handled = unsafe { handle_browser_native_message(browser, message) };
        if handled {
            BROWSER_NATIVE_MESSAGE_COUNT.fetch_add(1, Ordering::Relaxed);
            return 1;
        }
    }

    unsafe {
        CLIENT_ON_PROCESS_MESSAGE_RECEIVED
            .map(|original| original(client, browser, frame, source_process, message))
            .unwrap_or(0)
    }
}

unsafe fn handle_browser_native_message(
    browser: *mut CefBrowserPrefix,
    message: *mut CefProcessMessagePrefix,
) -> bool {
    let Some(message_kind) = unsafe { cef_types::process_message_name(message) }
        .as_deref()
        .and_then(BrowserNativeMessage::from_name)
    else {
        return false;
    };

    match message_kind {
        BrowserNativeMessage::ReloadClient => {
            unsafe { cef_types::browser_reload_ignore_cache(browser) };
        }
        BrowserNativeMessage::OpenDevtools => {
            if crate::config::option_bool("use_devtools", false) {
                open_devtools(browser);
            }
        }
        BrowserNativeMessage::SetWindowVibrancy => {
            unsafe { handle_window_vibrancy_message(browser, message) };
        }
        BrowserNativeMessage::SetWindowTheme => {
            unsafe { handle_window_theme_message(browser, message) };
        }
    }

    true
}

unsafe fn handle_window_theme_message(
    browser: *mut CefBrowserPrefix,
    message: *mut CefProcessMessagePrefix,
) -> bool {
    let arguments = unsafe { cef_types::process_message_argument_list(message) };
    let Some(dark) = (unsafe { cef_types::list_bool(arguments, 0) }) else {
        return false;
    };

    unsafe { cef_types::browser_set_window_theme(browser, dark) }
}

unsafe fn handle_window_vibrancy_message(
    browser: *mut CefBrowserPrefix,
    message: *mut CefProcessMessagePrefix,
) -> bool {
    const VTYPE_NULL: i32 = 1;

    let arguments = unsafe { cef_types::process_message_argument_list(message) };
    match unsafe { cef_types::list_value_type(arguments, 0) } {
        Some(VTYPE_NULL) => unsafe { cef_types::browser_clear_window_vibrancy(browser) },
        Some(_) => {
            let Some(kind) = (unsafe { cef_types::list_double(arguments, 0) }) else {
                return false;
            };
            let state = unsafe { cef_types::list_double(arguments, 1) }.unwrap_or(0.0);
            unsafe { cef_types::browser_apply_window_vibrancy(browser, kind as u32, state as u32) }
        }
        None => false,
    }
}

unsafe extern "C" fn hooked_cef_request_context_create_context(
    settings: *const c_void,
    handler: *mut c_void,
) -> *mut c_void {
    type Fn = unsafe extern "C" fn(*const c_void, *mut c_void) -> *mut c_void;

    #[cfg(windows)]
    unsafe {
        let cache_dir = crate::config::cache_dir().display().to_string();
        cef_types::set_request_context_cache_path(settings, &cache_dir);

        let context = call_original(&raw mut CEF_CREATE_CONTEXT_HOOK, |target| {
            let original: Fn = std::mem::transmute(target);
            original(settings, handler)
        })
        .unwrap_or(std::ptr::null_mut());

        if cef_types::register_plugins_scheme(context) {
            PLUGINS_SCHEME_REGISTRATION_COUNT.fetch_add(1, Ordering::Relaxed);
        }

        if crate::config::option_bool("use_riotclient", false)
            && cef_types::register_riotclient_scheme(context)
        {
            RIOTCLIENT_SCHEME_REGISTRATION_COUNT.fetch_add(1, Ordering::Relaxed);
        }

        return context;
    }

    #[cfg(not(windows))]
    {
        let _ = (settings, handler);
        std::ptr::null_mut()
    }
}

unsafe extern "C" fn hooked_cef_execute_process(
    args: *const c_void,
    app: *mut c_void,
    sandbox_info: *mut c_void,
) -> i32 {
    type Fn = unsafe extern "C" fn(*const c_void, *mut c_void, *mut c_void) -> i32;

    #[cfg(windows)]
    unsafe {
        prepare_cef_execute_process(app);

        return call_original(&raw mut CEF_EXECUTE_PROCESS_HOOK, |target| {
            let original: Fn = std::mem::transmute(target);
            original(args, app, sandbox_info)
        })
        .unwrap_or(0);
    }

    #[cfg(not(windows))]
    {
        let _ = (args, app, sandbox_info);
        0
    }
}

unsafe fn prepare_cef_execute_process(app: *mut c_void) {
    if app.is_null() {
        return;
    }

    let app = app.cast::<CefApp>();
    unsafe {
        GET_RENDER_PROCESS_HANDLER = (*app).get_render_process_handler;
        (*app).get_render_process_handler = Some(hooked_get_render_process_handler);
    }
}

unsafe extern "system" fn hooked_get_render_process_handler(
    app: *mut CefApp,
) -> *mut CefRenderProcessHandler {
    let handler = unsafe {
        GET_RENDER_PROCESS_HANDLER
            .map(|original| original(app))
            .unwrap_or(std::ptr::null_mut())
    };

    if !handler.is_null() {
        unsafe {
            ON_BROWSER_CREATED = (*handler).on_browser_created;
            (*handler).on_browser_created = Some(hooked_on_browser_created);

            ON_CONTEXT_CREATED = (*handler).on_context_created;
            (*handler).on_context_created = Some(hooked_on_context_created);
        }
    }

    handler
}

unsafe extern "system" fn hooked_on_browser_created(
    handler: *mut CefRenderProcessHandler,
    browser: *mut c_void,
    extra_info: *mut CefDictionaryValuePrefix,
) {
    unsafe {
        RENDERER_IS_MAIN = cef_types::dictionary_has_key(extra_info, "is_main");

        if let Some(original) = ON_BROWSER_CREATED {
            original(handler, browser, extra_info);
        }
    }
}

unsafe extern "system" fn hooked_on_context_created(
    handler: *mut CefRenderProcessHandler,
    browser: *mut c_void,
    frame: *mut CefFramePrefix,
    context: *mut c_void,
) {
    unsafe {
        let should_inject = RENDERER_IS_MAIN
            && cef_types::frame_is_main(frame)
            && cef_types::frame_url(frame).is_some_and(|url| {
                url.starts_with("https://riot:") && url.ends_with("/index.html")
            });

        if should_inject {
            RENDERER_MAIN_CONTEXT_COUNT.fetch_add(1, Ordering::Relaxed);
            inject_renderer_runtime(frame, context);
        }

        if let Some(original) = ON_CONTEXT_CREATED {
            original(handler, browser, frame, context);
        }
    }
}

unsafe fn inject_renderer_runtime(frame: *mut CefFramePrefix, context: *mut c_void) {
    if unsafe { crate::v8_native::expose(context) } {
        RENDERER_NATIVE_EXPOSE_COUNT.fetch_add(1, Ordering::Relaxed);
    }

    let bootstrap = renderer_bootstrap_script();
    unsafe {
        cef_types::execute_java_script(frame, &bootstrap, "https://plugins/@/maoloader-bootstrap");
    }

    let preload_path = crate::config::loader_dir()
        .join("runtime")
        .join("preload.js");
    if let Ok(preload) = std::fs::read_to_string(preload_path) {
        unsafe {
            cef_types::execute_java_script(frame, &preload, "https://plugins/@/preload");
        }
        RENDERER_PRELOAD_EXECUTE_COUNT.fetch_add(1, Ordering::Relaxed);
        crate::trace::record("renderer.preload.execute", &[]);
    }
}

fn renderer_bootstrap_script() -> String {
    let entries = crate::plugins::entries().unwrap_or_default();
    crate::trace::record(
        "renderer.bootstrap",
        &[
            ("plugin_count", entries.len().to_string()),
            ("plugins", entries.join(",")),
        ],
    );
    let payload = serde_json::json!({
        "os": {
            "name": platform_name(),
            "version": crate::platform::os_version(),
            "build": crate::platform::os_build(),
        },
        "pengu": {
            "version": "",
            "superPotato": crate::config::option_bool("super_potato", false),
            "isMac": cfg!(target_os = "macos"),
            "plugins": entries,
            "disabledPlugins": crate::config::disabled_plugins(),
        }
    });

    format!(
        r#"(function() {{
  const payload = {payload};
  Object.defineProperty(window, "os", {{
    value: Object.freeze(payload.os),
    configurable: false,
    enumerable: true,
    writable: false
  }});
  Object.defineProperty(window, "Pengu", {{
    value: payload.pengu,
    configurable: false,
    enumerable: true,
    writable: false
  }});
}})();"#
    )
}

fn platform_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "win"
    } else if cfg!(target_os = "macos") {
        "mac"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "unknown"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn proxy_cleanup_matches_upstream_substring_removal() {
        assert_eq!(
            remove_no_proxy_server_switch(
                r#"LeagueClientUx.exe "--quoted=value with spaces" --no-proxy-server --flag"#
            ),
            r#"LeagueClientUx.exe "--quoted=value with spaces"  --flag"#
        );
        assert_eq!(
            remove_no_proxy_server_switch("LeagueClientUx.exe --flag"),
            "LeagueClientUx.exe --flag"
        );
    }

    #[test]
    fn renderer_bootstrap_exposes_upstream_global_shapes() {
        let script = renderer_bootstrap_script();

        assert!(script.contains(r#""name":"#));
        assert!(script.contains(r#"Object.defineProperty(window, "os""#));
        assert!(script.contains(r#"Object.defineProperty(window, "Pengu""#));
        assert!(script.contains(r#""version":"""#));
        assert!(!script.contains(r#"Object.defineProperty(window, "__llver""#));

        if cfg!(target_os = "windows") {
            assert!(script.contains(r#""name":"win""#));
        } else if cfg!(target_os = "macos") {
            assert!(script.contains(r#""name":"mac""#));
        }
    }

    fn key_event(windows_key_code: i32, modifiers: u32, editable: bool) -> CefKeyEvent {
        CefKeyEvent {
            type_: 0,
            modifiers,
            windows_key_code,
            native_key_code: 0,
            is_system_key: 0,
            character: 0,
            unmodified_character: 0,
            focus_on_editable_field: i32::from(editable),
        }
    }

    #[test]
    fn hotkey_actions_match_upstream_keyboard_shortcuts() {
        const VK_F12: i32 = 0x7b;
        const VK_RETURN: i32 = 0x0d;
        #[cfg(target_os = "macos")]
        const CHORD: u32 = (1 << 7) | (1 << 0);
        #[cfg(not(target_os = "macos"))]
        const CHORD: u32 = (1 << 2) | (1 << 1);

        assert_eq!(
            hotkey_action(&key_event(VK_F12, 0, false)),
            Some(HotkeyAction::OpenDevtools)
        );
        assert_eq!(
            hotkey_action(&key_event('i' as i32, CHORD, false)),
            Some(HotkeyAction::OpenDevtools)
        );
        assert_eq!(
            hotkey_action(&key_event('R' as i32, CHORD, false)),
            Some(HotkeyAction::ReloadClient)
        );
        assert_eq!(
            hotkey_action(&key_event(VK_RETURN, CHORD, false)),
            Some(HotkeyAction::RestartClient)
        );
        assert_eq!(hotkey_action(&key_event('R' as i32, CHORD, true)), None);
        assert_eq!(hotkey_action(&key_event('R' as i32, 0, false)), None);
    }

    #[test]
    fn browser_native_messages_match_upstream_handled_names() {
        assert_eq!(
            BrowserNativeMessage::from_name("@open-devtools"),
            Some(BrowserNativeMessage::OpenDevtools)
        );
        assert_eq!(
            BrowserNativeMessage::from_name("@reload-client"),
            Some(BrowserNativeMessage::ReloadClient)
        );
        assert_eq!(
            BrowserNativeMessage::from_name("@set-window-vibrancy"),
            Some(BrowserNativeMessage::SetWindowVibrancy)
        );
        assert_eq!(
            BrowserNativeMessage::from_name("@set-window-theme"),
            Some(BrowserNativeMessage::SetWindowTheme)
        );
        assert_eq!(BrowserNativeMessage::from_name("@riot-message"), None);
    }

    #[test]
    fn command_line_hook_captures_riotclient_credentials_before_original_handler() {
        let source = include_str!("cef.rs");
        let hook = source
            .split("unsafe extern \"system\" fn hooked_on_before_command_line_processing")
            .nth(1)
            .and_then(|tail| tail.split("fn apply_command_line_options").next())
            .unwrap();

        let capture = hook
            .find("capture_riotclient_credentials(command_line)")
            .unwrap();
        let original = hook
            .find("if let Some(original) = ON_BEFORE_COMMAND_LINE_PROCESSING")
            .unwrap();
        let apply = hook
            .find("apply_command_line_options(command_line)")
            .unwrap();

        assert!(capture < original);
        assert!(original < apply);
    }
}

#[cfg(windows)]
unsafe fn call_original<F, R>(hook_slot: *mut Option<crate::hook::InlineHook>, call: F) -> Option<R>
where
    F: FnOnce(*mut c_void) -> R,
{
    let hook = unsafe { &mut *hook_slot }.as_mut()?;
    Some(unsafe { hook.call_original(call) })
}
