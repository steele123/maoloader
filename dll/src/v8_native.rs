use std::{
    ffi::c_void,
    fs, io,
    path::{Component, Path, PathBuf},
    sync::atomic::{AtomicUsize, Ordering},
};

use crate::cef_types::{self, CefBaseRefCounted, CefString, CefV8Handler, CefV8Value};
use serde_json::json;

const V8_PROPERTY_ATTRIBUTE_READONLY: i32 = 1;

#[repr(C)]
struct NativeHandler {
    base: CefV8Handler,
    ref_count: AtomicUsize,
}

pub unsafe fn expose(context: *mut c_void) -> bool {
    if !unsafe { cef_types::v8_context_enter(context) } {
        return false;
    }

    let global = unsafe { cef_types::v8_context_global(context) };
    if global.is_null() {
        unsafe { cef_types::v8_context_exit(context) };
        return false;
    }

    let native = cef_types::v8_create_object();
    if native.is_null() {
        unsafe { cef_types::v8_context_exit(context) };
        return false;
    }

    let handler = native_handler();
    for name in [
        "LoadDataStore",
        "SaveDataStore",
        "OpenDevTools",
        "OpenPluginsFolder",
        "ReloadClient",
        "SetWindowTheme",
        "SetWindowVibrancy",
        "PluginFS",
    ] {
        let function = cef_types::v8_create_function(name, handler);
        unsafe {
            cef_types::v8_set_value_bykey(native, name, function, V8_PROPERTY_ATTRIBUTE_READONLY);
        }
    }

    let exposed = unsafe {
        cef_types::v8_set_value_bykey(global, "__native", native, V8_PROPERTY_ATTRIBUTE_READONLY)
    };
    unsafe { cef_types::v8_context_exit(context) };
    exposed
}

fn native_handler() -> *mut CefV8Handler {
    Box::into_raw(Box::new(NativeHandler {
        base: CefV8Handler {
            base: CefBaseRefCounted {
                size: std::mem::size_of::<NativeHandler>(),
                add_ref: Some(handler_add_ref),
                release: Some(handler_release),
                has_one_ref: Some(handler_has_one_ref),
                has_at_least_one_ref: Some(handler_has_at_least_one_ref),
            },
            execute: Some(handler_execute),
        },
        ref_count: AtomicUsize::new(1),
    }))
    .cast()
}

unsafe extern "system" fn handler_add_ref(base: *mut CefBaseRefCounted) {
    if !base.is_null() {
        unsafe {
            (*(base as *mut NativeHandler))
                .ref_count
                .fetch_add(1, Ordering::Relaxed)
        };
    }
}

unsafe extern "system" fn handler_release(base: *mut CefBaseRefCounted) -> i32 {
    if base.is_null() {
        return 0;
    }

    let handler = base as *mut NativeHandler;
    if unsafe { (*handler).ref_count.fetch_sub(1, Ordering::Release) } == 1 {
        std::sync::atomic::fence(Ordering::Acquire);
        unsafe { drop(Box::from_raw(handler)) };
        1
    } else {
        0
    }
}

unsafe extern "system" fn handler_has_one_ref(base: *mut CefBaseRefCounted) -> i32 {
    if base.is_null() {
        return 0;
    }

    (unsafe {
        (*(base as *mut NativeHandler))
            .ref_count
            .load(Ordering::Acquire)
    } == 1) as i32
}

unsafe extern "system" fn handler_has_at_least_one_ref(base: *mut CefBaseRefCounted) -> i32 {
    if base.is_null() {
        return 0;
    }

    (unsafe {
        (*(base as *mut NativeHandler))
            .ref_count
            .load(Ordering::Acquire)
    } >= 1) as i32
}

unsafe extern "system" fn handler_execute(
    self_: *mut CefV8Handler,
    name: *const CefString,
    object: *mut CefV8Value,
    arguments_count: usize,
    arguments: *const *mut CefV8Value,
    retval: *mut *mut CefV8Value,
    exception: *mut CefString,
) -> i32 {
    let _ = (self_, object, exception);
    let Some(name) = (unsafe { cef_string_ref_to_string(name) }) else {
        return 0;
    };

    match name.as_str() {
        "LoadDataStore" => {
            let data = crate::datastore::load().unwrap_or_else(|_| "{}".into());
            unsafe { set_retval(retval, cef_types::v8_create_string(&data)) };
            1
        }
        "SaveDataStore" => {
            if arguments_count > 0 && !arguments.is_null() {
                let value = unsafe { *arguments };
                if let Some(data) = unsafe { cef_types::v8_string_value(value) } {
                    let _ = crate::datastore::save(&data);
                }
            }
            1
        }
        "OpenPluginsFolder" => {
            let subpath = if arguments_count > 0 && !arguments.is_null() {
                unsafe { cef_types::v8_string_value(*arguments) }
            } else {
                None
            };
            let opened = open_plugins_folder(subpath.as_deref());
            unsafe { set_retval(retval, cef_types::v8_create_bool(opened)) };
            1
        }
        "OpenDevTools" => {
            send_browser_message("@open-devtools");
            1
        }
        "ReloadClient" => {
            send_browser_message("@reload-client");
            1
        }
        "SetWindowTheme" => {
            if arguments_count > 0 && !arguments.is_null() {
                let value = unsafe { *arguments };
                if let Some(dark) = unsafe { cef_types::v8_bool_value(value) } {
                    send_window_theme_message(dark);
                }
            }
            1
        }
        "SetWindowVibrancy" => {
            if arguments_count > 0 && !arguments.is_null() {
                send_window_vibrancy_message(arguments_count, arguments);
            }
            1
        }
        "PluginFS" => {
            let result = unsafe { plugin_fs_call(arguments_count, arguments) };
            unsafe { set_retval(retval, cef_types::v8_create_string(&result)) };
            1
        }
        _ => 0,
    }
}

unsafe fn set_retval(retval: *mut *mut CefV8Value, value: *mut CefV8Value) {
    if !retval.is_null() {
        unsafe { *retval = value };
    }
}

unsafe fn cef_string_ref_to_string(value: *const CefString) -> Option<String> {
    if value.is_null() {
        return None;
    }

    let value = unsafe { &*value };
    if value.str_.is_null() {
        return None;
    }

    let data = unsafe { std::slice::from_raw_parts(value.str_, value.length) };
    Some(String::from_utf16_lossy(data))
}

fn open_plugins_folder(subpath: Option<&str>) -> bool {
    let (path, found) = plugins_folder_target(crate::config::plugins_dir(), subpath);

    #[cfg(windows)]
    {
        let _ = std::process::Command::new("explorer.exe").arg(path).spawn();
        found
    }

    #[cfg(not(windows))]
    {
        let _ = path;
        found
    }
}

fn plugins_folder_target(base: PathBuf, subpath: Option<&str>) -> (PathBuf, bool) {
    let Some(subpath) = subpath.filter(|value| !value.is_empty()) else {
        return (base, true);
    };

    let Some(safe_subpath) = safe_plugins_subpath(subpath) else {
        return (base, true);
    };

    let path = base.join(safe_subpath);
    let found = Path::new(&path).is_dir();
    (path, found)
}

fn safe_plugins_subpath(subpath: &str) -> Option<PathBuf> {
    let normalized = subpath.trim().trim_start_matches(['/', '\\']);
    if normalized.is_empty() {
        return None;
    }

    let path = Path::new(normalized);
    let mut safe = PathBuf::new();

    for component in path.components() {
        match component {
            Component::Normal(part) => safe.push(part),
            Component::CurDir => {}
            _ => return None,
        }
    }

    (!safe.as_os_str().is_empty()).then_some(safe)
}

unsafe fn plugin_fs_call(arguments_count: usize, arguments: *const *mut CefV8Value) -> String {
    let operation = unsafe { argument_string(arguments_count, arguments, 0) };
    let root = unsafe { argument_string(arguments_count, arguments, 1) };
    let path = unsafe { argument_string(arguments_count, arguments, 2) }.unwrap_or_default();
    let content = unsafe { argument_string(arguments_count, arguments, 3) };
    let flag = unsafe { argument_bool(arguments_count, arguments, 4) }.unwrap_or(false);

    let result = match (operation.as_deref(), root.as_deref()) {
        (Some(operation), Some(root)) => plugin_fs_execute(operation, root, &path, content, flag),
        _ => Err(PluginFsError::invalid()),
    };

    match result {
        Ok(value) => json!({ "ok": true, "value": value }).to_string(),
        Err(error) => {
            json!({ "ok": false, "value": serde_json::Value::Null, "error": error.reason })
                .to_string()
        }
    }
}

unsafe fn argument_string(
    arguments_count: usize,
    arguments: *const *mut CefV8Value,
    index: usize,
) -> Option<String> {
    if index >= arguments_count || arguments.is_null() {
        return None;
    }

    unsafe { cef_types::v8_string_value(*arguments.add(index)) }
}

unsafe fn argument_bool(
    arguments_count: usize,
    arguments: *const *mut CefV8Value,
    index: usize,
) -> Option<bool> {
    if index >= arguments_count || arguments.is_null() {
        return None;
    }

    unsafe { cef_types::v8_bool_value(*arguments.add(index)) }
}

#[derive(Debug)]
struct PluginFsError {
    reason: &'static str,
}

impl PluginFsError {
    fn invalid() -> Self {
        Self { reason: "invalid" }
    }

    fn io(_: io::Error) -> Self {
        Self { reason: "io" }
    }
}

fn plugin_fs_execute(
    operation: &str,
    root: &str,
    path: &str,
    content: Option<String>,
    flag: bool,
) -> Result<serde_json::Value, PluginFsError> {
    let plugin_root = safe_plugins_subpath(root).ok_or_else(PluginFsError::invalid)?;
    let target = plugin_fs_target(crate::config::plugins_dir().join(plugin_root), path)
        .ok_or_else(PluginFsError::invalid)?;

    match operation {
        "read" => fs::read_to_string(target)
            .map(serde_json::Value::String)
            .map_err(PluginFsError::io),
        "write" => {
            let Some(content) = content else {
                return Err(PluginFsError::invalid());
            };
            let Some(parent) = target.parent().filter(|parent| parent.is_dir()) else {
                return Ok(json!(false));
            };
            let _ = parent;
            let mut options = fs::OpenOptions::new();
            options.create(true).write(true);
            if flag {
                options.append(true);
            } else {
                options.truncate(true);
            }
            options
                .open(target)
                .and_then(|mut file| {
                    use std::io::Write;
                    file.write_all(content.as_bytes())
                })
                .map(|_| json!(true))
                .map_err(PluginFsError::io)
        }
        "mkdir" => {
            if target.exists() {
                return Ok(json!(false));
            }
            fs::create_dir_all(target)
                .map(|_| json!(true))
                .map_err(PluginFsError::io)
        }
        "stat" => {
            let metadata = fs::metadata(&target).map_err(PluginFsError::io)?;
            Ok(json!({
                "fileName": target.file_name().and_then(|name| name.to_str()).unwrap_or_default(),
                "length": if metadata.is_dir() { 0 } else { metadata.len() },
                "isDir": metadata.is_dir(),
            }))
        }
        "ls" => {
            let entries = fs::read_dir(target)
                .map_err(PluginFsError::io)?
                .filter_map(Result::ok)
                .filter_map(|entry| entry.file_name().into_string().ok())
                .collect::<Vec<_>>();
            Ok(json!(entries))
        }
        "rm" => plugin_fs_remove(&target, flag).map(|count| json!(count)),
        _ => Err(PluginFsError::invalid()),
    }
}

fn plugin_fs_target(root: PathBuf, path: &str) -> Option<PathBuf> {
    let normalized = path.trim().trim_start_matches(['/', '\\']);
    if normalized.is_empty() {
        return Some(root);
    }

    let relative = safe_plugins_subpath(normalized)?;
    Some(root.join(relative))
}

fn plugin_fs_remove(path: &Path, recursively: bool) -> Result<usize, PluginFsError> {
    if path.is_file() {
        fs::remove_file(path).map_err(PluginFsError::io)?;
        return Ok(1);
    }

    if !path.is_dir() {
        return Ok(0);
    }

    if recursively {
        let count = count_entries(path)?;
        fs::remove_dir_all(path).map_err(PluginFsError::io)?;
        return Ok(count);
    }

    fs::remove_dir(path).map(|_| 1).map_err(PluginFsError::io)
}

fn count_entries(path: &Path) -> Result<usize, PluginFsError> {
    let mut count = 1;
    for entry in fs::read_dir(path).map_err(PluginFsError::io)? {
        let entry = entry.map_err(PluginFsError::io)?;
        let path = entry.path();
        if path.is_dir() {
            count += count_entries(&path)?;
        } else {
            count += 1;
        }
    }
    Ok(count)
}

fn send_browser_message(name: &str) -> bool {
    const PID_BROWSER: i32 = 0;

    let context = cef_types::v8_current_context();
    let frame = unsafe { cef_types::v8_context_frame(context) };
    let message = cef_types::process_message_create(name);

    unsafe { cef_types::frame_send_process_message(frame, PID_BROWSER, message) }
}

fn send_window_theme_message(dark: bool) -> bool {
    const PID_BROWSER: i32 = 0;

    let context = cef_types::v8_current_context();
    let frame = unsafe { cef_types::v8_context_frame(context) };
    let message = cef_types::process_message_create("@set-window-theme");
    let arguments = unsafe { cef_types::process_message_argument_list(message) };
    unsafe { cef_types::list_set_bool(arguments, 0, dark) };

    unsafe { cef_types::frame_send_process_message(frame, PID_BROWSER, message) }
}

fn send_window_vibrancy_message(arguments_count: usize, arguments: *const *mut CefV8Value) -> bool {
    const PID_BROWSER: i32 = 0;

    let context = cef_types::v8_current_context();
    let frame = unsafe { cef_types::v8_context_frame(context) };
    let message = cef_types::process_message_create("@set-window-vibrancy");
    let message_arguments = unsafe { cef_types::process_message_argument_list(message) };

    let first = unsafe { *arguments };
    if unsafe { cef_types::v8_is_null(first) } {
        unsafe { cef_types::list_set_null(message_arguments, 0) };
    } else if let Some(kind) = unsafe { cef_types::v8_double_value(first) } {
        unsafe { cef_types::list_set_double(message_arguments, 0, kind) };
    }

    if arguments_count >= 2 {
        let second = unsafe { *arguments.add(1) };
        if let Some(state) = unsafe { cef_types::v8_double_value(second) } {
            unsafe { cef_types::list_set_double(message_arguments, 1, state) };
        }
    }

    unsafe { cef_types::frame_send_process_message(frame, PID_BROWSER, message) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_v8_handler_reports_full_wrapper_size() {
        let handler = native_handler().cast::<NativeHandler>();

        unsafe {
            assert_eq!(
                (*handler).base.base.size,
                std::mem::size_of::<NativeHandler>()
            );
            assert!(std::mem::size_of::<NativeHandler>() > std::mem::size_of::<CefV8Handler>());
            handler_release((&mut (*handler).base.base) as *mut CefBaseRefCounted);
        }
    }

    #[test]
    fn plugins_folder_target_reports_optional_subfolder_existence() {
        let base =
            std::env::temp_dir().join(format!("maoloader-v8-native-test-{}", std::process::id()));
        let child = base.join("existing");
        std::fs::create_dir_all(&child).unwrap();

        let (root_path, root_found) = plugins_folder_target(base.clone(), None);
        assert_eq!(root_path, base);
        assert!(root_found);

        let (child_path, child_found) = plugins_folder_target(base.clone(), Some("existing"));
        assert_eq!(child_path, child);
        assert!(child_found);

        let (missing_path, missing_found) = plugins_folder_target(base.clone(), Some("missing"));
        assert_eq!(missing_path, base.join("missing"));
        assert!(!missing_found);

        let (parent_path, parent_found) = plugins_folder_target(base.clone(), Some("../outside"));
        assert_eq!(parent_path, base);
        assert!(parent_found);

        let (nested_parent_path, nested_parent_found) =
            plugins_folder_target(base.clone(), Some("nested/../outside"));
        assert_eq!(nested_parent_path, base);
        assert!(nested_parent_found);

        let (absolute_path, absolute_found) =
            plugins_folder_target(base.clone(), Some("/absolute"));
        assert_eq!(absolute_path, base.join("absolute"));
        assert!(!absolute_found);

        std::fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn plugin_fs_targets_stay_inside_plugin_root() {
        let root = PathBuf::from("Plugin");

        assert_eq!(
            plugin_fs_target(root.clone(), "./data/save.json").unwrap(),
            root.join("data").join("save.json")
        );
        assert!(plugin_fs_target(root.clone(), "../outside").is_none());
        assert!(plugin_fs_target(root, "nested/../outside").is_none());
    }

    #[test]
    fn plugin_fs_executes_basic_file_operations() {
        let plugins_dir =
            std::env::temp_dir().join(format!("maoloader-plugin-fs-test-{}", std::process::id()));
        let plugin_root = plugins_dir.join("Plugin");
        let _ = fs::remove_dir_all(&plugins_dir);
        fs::create_dir_all(&plugin_root).unwrap();

        let target = plugin_fs_target(plugin_root.clone(), "data").unwrap();
        assert!(!target.exists());

        fs::create_dir_all(plugin_root.join("data")).unwrap();
        fs::write(plugin_root.join("data").join("file.txt"), "hello").unwrap();

        assert_eq!(
            fs::read_to_string(plugin_root.join("data").join("file.txt")).unwrap(),
            "hello"
        );

        let removed = plugin_fs_remove(&plugin_root.join("data"), true).unwrap();
        assert_eq!(removed, 2);
        assert!(!plugin_root.join("data").exists());

        fs::remove_dir_all(plugins_dir).unwrap();
    }
}
