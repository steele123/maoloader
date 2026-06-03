#![cfg_attr(not(windows), allow(unused_variables))]

mod assets;
mod cef;
mod cef_types;
mod config;
mod core;
mod datastore;
mod dllproxy;
mod dylib;
mod hook;
mod inject;
mod platform;
mod plugins;
mod process_hook;
mod riotclient;
mod trace;
mod v8_native;

use std::ffi::{c_char, c_void};

#[cfg(windows)]
type Bool = i32;

#[cfg(windows)]
type Hinstance = isize;

#[cfg(windows)]
const DLL_PROCESS_ATTACH: u32 = 1;

#[cfg(windows)]
const TRUE: Bool = 1;

/// Rundll32-compatible entry point used by IFEO activation.
#[unsafe(no_mangle)]
pub extern "system" fn entry(
    hwnd: isize,
    hinst: isize,
    command_line: *mut c_char,
    show_command: i32,
) {
    let _ = (hwnd, hinst, command_line, show_command);

    #[cfg(windows)]
    {
        if let Some(command_line) = ifeo_command_line_from_ptr(command_line) {
            let _ = bootstrap_ifeo_target(&command_line);
        }
    }
}

#[unsafe(no_mangle)]
pub extern "system" fn _BootstrapEntry(
    hwnd: isize,
    hinst: isize,
    command_line: *mut c_char,
    show_command: i32,
) {
    entry(hwnd, hinst, command_line, show_command);
}

#[unsafe(no_mangle)]
pub extern "system" fn _GetCefVersion() -> i32 {
    core::libcef_version()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_plugin_count() -> usize {
    plugins::entries().map(|entries| entries.len()).unwrap_or(0)
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_super_potato_enabled() -> bool {
    config::option_bool("super_potato", false)
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_disabled_plugins_len() -> usize {
    config::disabled_plugins().len()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_plugin_hash_len(entry: *const c_char) -> usize {
    if entry.is_null() {
        return 0;
    }

    let entry = unsafe { std::ffi::CStr::from_ptr(entry) };
    plugins::fnv1a_hex(&entry.to_string_lossy()).len()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_process_kind() -> u32 {
    core::process_kind_code()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_libcef_version() -> i32 {
    core::libcef_version()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_supported_libcef_major() -> i32 {
    core::supported_libcef_major()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_libcef_supported() -> bool {
    core::libcef_supported_current()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_hook_ready() -> bool {
    core::hook_ready()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_browser_hook_symbol_count() -> usize {
    core::browser_hook_symbol_count()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_renderer_hook_symbol_count() -> usize {
    core::renderer_hook_symbol_count()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_command_line_mutation_count() -> usize {
    cef::command_line_mutation_count()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_plugins_scheme_registration_count() -> usize {
    cef::plugins_scheme_registration_count()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_riotclient_scheme_registration_count() -> usize {
    cef::riotclient_scheme_registration_count()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_riotclient_credential_capture_count() -> usize {
    cef::riotclient_credential_capture_count()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_riotclient_scheme_create_count() -> usize {
    cef::riotclient_scheme_create_count()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_riotclient_proxy_target_count() -> usize {
    cef::riotclient_proxy_target_count()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_riotclient_proxy_request_count() -> usize {
    cef::riotclient_proxy_request_count()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_riotclient_urlrequest_launch_count() -> usize {
    cef::riotclient_urlrequest_launch_count()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_riotclient_urlrequest_complete_count() -> usize {
    cef::riotclient_urlrequest_complete_count()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_riotclient_urlrequest_data_bytes() -> usize {
    cef::riotclient_urlrequest_data_bytes()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_riotclient_credentials_ready() -> bool {
    cef::riotclient_credentials_ready()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_plugins_scheme_create_count() -> usize {
    cef::plugins_scheme_create_count()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_plugins_asset_resolve_count() -> usize {
    cef::plugins_asset_resolve_count()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_renderer_main_context_count() -> usize {
    cef::renderer_main_context_count()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_renderer_preload_execute_count() -> usize {
    cef::renderer_preload_execute_count()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_renderer_native_expose_count() -> usize {
    cef::renderer_native_expose_count()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_renderer_early_inject_count() -> usize {
    process_hook::renderer_early_inject_count()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_create_process_hook_count() -> usize {
    process_hook::create_process_hook_count()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_browser_main_client_hook_count() -> usize {
    cef::browser_main_client_hook_count()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_browser_native_message_count() -> usize {
    cef::browser_native_message_count()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_browser_background_patch_count() -> usize {
    cef::browser_background_patch_count()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_devtools_open_attempt_count() -> usize {
    cef::devtools_open_attempt_count()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_devtools_open_success_count() -> usize {
    cef::devtools_open_success_count()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_datastore_len() -> usize {
    datastore::len()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_trace_path_len() -> usize {
    trace::trace_path().display().to_string().len()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_save_datastore(data: *const c_char) -> bool {
    if data.is_null() {
        return false;
    }

    let data = unsafe { std::ffi::CStr::from_ptr(data) };
    datastore::save(&data.to_string_lossy()).is_ok()
}

#[unsafe(no_mangle)]
pub extern "system" fn maoloader_inject_self_into(process: isize) -> bool {
    inject::inject_dll(process, &config::core_path()).is_ok()
}

#[cfg(windows)]
fn ifeo_command_line_from_ptr(command_line: *mut c_char) -> Option<String> {
    if command_line.is_null() {
        return None;
    }

    let command_line = unsafe { std::ffi::CStr::from_ptr(command_line) }
        .to_string_lossy()
        .trim()
        .to_string();
    (!command_line.is_empty()).then_some(command_line)
}

#[cfg(windows)]
fn bootstrap_ifeo_target(command_line: &str) -> std::io::Result<()> {
    use std::{ffi::c_void, os::windows::ffi::OsStrExt};

    const CREATE_SUSPENDED: u32 = 0x0000_0004;
    const DEBUG_ONLY_THIS_PROCESS: u32 = 0x0000_0002;
    const PROCESS_DEBUG_OBJECT_HANDLE: u32 = 30;
    const WAIT_INFINITE: u32 = 0xffff_ffff;

    type Handle = isize;

    #[repr(C)]
    struct StartupInfoW {
        cb: u32,
        reserved: *mut u16,
        desktop: *mut u16,
        title: *mut u16,
        x: u32,
        y: u32,
        x_size: u32,
        y_size: u32,
        x_count_chars: u32,
        y_count_chars: u32,
        fill_attribute: u32,
        flags: u32,
        show_window: u16,
        reserved2: u16,
        reserved2_ptr: *mut u8,
        std_input: Handle,
        std_output: Handle,
        std_error: Handle,
    }

    #[repr(C)]
    struct ProcessInformation {
        process: Handle,
        thread: Handle,
        process_id: u32,
        thread_id: u32,
    }

    unsafe extern "system" {
        fn CreateProcessW(
            application_name: *const u16,
            command_line: *mut u16,
            process_attributes: *mut c_void,
            thread_attributes: *mut c_void,
            inherit_handles: i32,
            creation_flags: u32,
            environment: *mut c_void,
            current_directory: *const u16,
            startup_info: *mut StartupInfoW,
            process_information: *mut ProcessInformation,
        ) -> i32;
        fn ResumeThread(thread: Handle) -> u32;
        fn WaitForSingleObject(handle: Handle, milliseconds: u32) -> u32;
        fn CloseHandle(handle: Handle) -> i32;
    }

    let mut startup_info = StartupInfoW {
        cb: std::mem::size_of::<StartupInfoW>() as u32,
        reserved: std::ptr::null_mut(),
        desktop: std::ptr::null_mut(),
        title: std::ptr::null_mut(),
        x: 0,
        y: 0,
        x_size: 0,
        y_size: 0,
        x_count_chars: 0,
        y_count_chars: 0,
        fill_attribute: 0,
        flags: 0,
        show_window: 0,
        reserved2: 0,
        reserved2_ptr: std::ptr::null_mut(),
        std_input: 0,
        std_output: 0,
        std_error: 0,
    };
    let mut process_information = ProcessInformation {
        process: 0,
        thread: 0,
        process_id: 0,
        thread_id: 0,
    };
    let command_line_text = command_line.to_string();
    let mut command_line = std::ffi::OsStr::new(&command_line_text)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();

    trace::record(
        "ifeo.bootstrap.start",
        &[(
            "renderer_command",
            platform::contains_ignore_ascii_case(&command_line_text, "--type=renderer").to_string(),
        )],
    );

    let created = unsafe {
        CreateProcessW(
            std::ptr::null(),
            command_line.as_mut_ptr(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            0,
            CREATE_SUSPENDED | DEBUG_ONLY_THIS_PROCESS,
            std::ptr::null_mut(),
            std::ptr::null(),
            &mut startup_info,
            &mut process_information,
        )
    };

    if created == 0 {
        trace::record(
            "ifeo.bootstrap.create_failed",
            &[("error", std::io::Error::last_os_error().to_string())],
        );
        return Err(std::io::Error::last_os_error());
    }

    unsafe {
        detach_debug_object(process_information.process, PROCESS_DEBUG_OBJECT_HANDLE);
    }

    let injection = inject::inject_dll(process_information.process, &config::core_path());
    trace::record(
        "ifeo.bootstrap.inject",
        &[
            ("pid", process_information.process_id.to_string()),
            ("success", injection.is_ok().to_string()),
            (
                "error",
                injection
                    .as_ref()
                    .err()
                    .map(ToString::to_string)
                    .unwrap_or_default(),
            ),
        ],
    );

    unsafe {
        ResumeThread(process_information.thread);
        WaitForSingleObject(process_information.process, WAIT_INFINITE);
        CloseHandle(process_information.thread);
        CloseHandle(process_information.process);
    }

    injection
}

#[cfg(windows)]
unsafe fn detach_debug_object(process: isize, information_class: u32) {
    type NtQueryInformationProcess =
        unsafe extern "system" fn(isize, u32, *mut isize, u32, *mut u32) -> i32;
    type NtRemoveProcessDebug = unsafe extern "system" fn(isize, isize) -> i32;
    type NtClose = unsafe extern "system" fn(isize) -> i32;

    unsafe extern "system" {
        fn GetModuleHandleA(name: *const i8) -> *mut c_void;
        fn GetProcAddress(module: *mut c_void, name: *const i8) -> *mut c_void;
    }

    let ntdll = unsafe { GetModuleHandleA(c"ntdll.dll".as_ptr()) };
    if ntdll.is_null() {
        return;
    }

    let query = unsafe { GetProcAddress(ntdll, c"NtQueryInformationProcess".as_ptr()) };
    let remove = unsafe { GetProcAddress(ntdll, c"NtRemoveProcessDebug".as_ptr()) };
    let close = unsafe { GetProcAddress(ntdll, c"NtClose".as_ptr()) };
    if query.is_null() || remove.is_null() || close.is_null() {
        return;
    }

    let query: NtQueryInformationProcess = unsafe { std::mem::transmute(query) };
    let remove: NtRemoveProcessDebug = unsafe { std::mem::transmute(remove) };
    let close: NtClose = unsafe { std::mem::transmute(close) };
    let mut debug_handle = 0;

    if unsafe {
        query(
            process,
            information_class,
            &mut debug_handle,
            std::mem::size_of::<isize>() as u32,
            std::ptr::null_mut(),
        )
    } >= 0
    {
        unsafe {
            remove(process, debug_handle);
            close(debug_handle);
        }
    }
}

#[cfg(windows)]
#[unsafe(no_mangle)]
pub extern "system" fn DllMain(instance: Hinstance, reason: u32, reserved: *mut c_void) -> Bool {
    if reason == DLL_PROCESS_ATTACH {
        config::set_module_handle(instance);
        core::initialize();
    }

    let _ = reserved;
    TRUE
}
