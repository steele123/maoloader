use serde::Serialize;
use std::{fmt, io::ErrorKind};

#[cfg(windows)]
use std::process;

#[cfg(windows)]
use winreg::{
    enums::{HKEY_LOCAL_MACHINE, KEY_CREATE_SUB_KEY, KEY_READ, KEY_SET_VALUE},
    RegKey,
};

#[cfg(windows)]
const IFEO_PATH: &str =
    "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options";
#[cfg(windows)]
const IFEO_TARGET_EXE: &str = "LeagueClientUx.exe";
#[cfg(windows)]
const SYMLINK_TARGET_FILE: &str = "version.dll";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ActivationMode {
    Universal,
    Targeted,
}

impl ActivationMode {
    pub fn from_config(value: &str) -> Self {
        match value.trim().to_ascii_lowercase().as_str() {
            "targeted" | "symlink" | "1" => Self::Targeted,
            _ => Self::Universal,
        }
    }

    fn uses_symlink(self) -> bool {
        matches!(self, Self::Targeted)
    }
}

impl fmt::Display for ActivationMode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Universal => write!(f, "universal"),
            Self::Targeted => write!(f, "targeted"),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ActivationStatus {
    pub supported: bool,
    pub mode: ActivationMode,
    pub activated: bool,
    pub admin: bool,
    pub developer_mode: bool,
    pub webview2_installed: bool,
    pub message: String,
}

#[derive(Debug, Clone, Copy)]
enum ActivationStage {
    OpenIfeo = 1,
    CreateTarget,
    SetDebugger,
    DeleteDebugger,
    GetLeaguePath,
    CreateSymlink,
    DeleteSymlink,
    RunElevated,
}

type ActivationResult = Result<(), (ActivationStage, ErrorKind)>;

pub fn mode_from_loader_config() -> ActivationMode {
    crate::config::read_config()
        .map(|config| ActivationMode::from_config(&config.app.activation_mode))
        .unwrap_or(ActivationMode::Universal)
}

pub fn status() -> ActivationStatus {
    let mode = mode_from_loader_config();

    ActivationStatus {
        supported: cfg!(windows),
        mode,
        activated: is_activated(mode),
        admin: is_admin(),
        developer_mode: is_developer_mode(),
        webview2_installed: is_webview2_installed(),
        message: String::new(),
    }
}

pub fn set_active(active: bool) -> ActivationStatus {
    let mode = mode_from_loader_config();

    let message = match do_activate(mode, active) {
        Ok(()) => String::new(),
        Err((stage, kind)) => format!("{stage:?} ({kind:?})"),
    };

    ActivationStatus {
        supported: cfg!(windows),
        mode,
        activated: is_activated(mode),
        admin: is_admin(),
        developer_mode: is_developer_mode(),
        webview2_installed: is_webview2_installed(),
        message,
    }
}

pub fn handle_activation_entrypoint() {
    #[cfg(windows)]
    {
        let args = std::env::args().collect::<Vec<_>>();
        let Some(action) = args.get(1).map(String::as_str) else {
            if !is_webview2_installed() {
                warn_webview2_missing();
                process::exit(1);
            }
            return;
        };

        let active = match action {
            "--install" => true,
            "--uninstall" => false,
            _ => return,
        };

        let mode = if args.iter().any(|arg| arg == "--symlink") {
            ActivationMode::Targeted
        } else {
            ActivationMode::Universal
        };

        process::exit(encode_result(do_activate_direct(mode, active)));
    }
}

fn do_activate(mode: ActivationMode, active: bool) -> ActivationResult {
    #[cfg(windows)]
    {
        if is_admin()
            || (mode.uses_symlink() && !active)
            || (mode.uses_symlink() && is_developer_mode())
        {
            return do_activate_direct(mode, active);
        }

        let mut command = runas::Command::new(std::env::current_exe().unwrap());
        command.arg(if active { "--install" } else { "--uninstall" });

        if mode.uses_symlink() {
            command.arg("--symlink");
        }

        return match command.show(false).status() {
            Ok(status) => decode_result(status.code().unwrap_or(-1)),
            Err(error) => Err((ActivationStage::RunElevated, error.kind())),
        };
    }

    #[cfg(not(windows))]
    {
        let _ = (mode, active);
        Err((ActivationStage::RunElevated, ErrorKind::Unsupported))
    }
}

fn do_activate_direct(mode: ActivationMode, active: bool) -> ActivationResult {
    if mode.uses_symlink() {
        symlink_activate(active)
    } else {
        ifeo_activate(active)
    }
}

fn is_activated(mode: ActivationMode) -> bool {
    if mode.uses_symlink() {
        symlink_is_activated()
    } else {
        ifeo_is_activated()
    }
}

#[cfg(windows)]
fn is_admin() -> bool {
    is_elevated::is_elevated()
}

#[cfg(not(windows))]
fn is_admin() -> bool {
    false
}

#[cfg(windows)]
fn is_developer_mode() -> bool {
    const REG_PATH: &str = "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppModelUnlock";
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);

    hklm.open_subkey_with_flags(REG_PATH, KEY_READ)
        .ok()
        .and_then(|key| {
            key.get_value::<u32, _>("AllowDevelopmentWithoutDevLicense")
                .ok()
        })
        .is_some_and(|value| value == 1)
}

#[cfg(not(windows))]
fn is_developer_mode() -> bool {
    false
}

#[cfg(windows)]
fn is_webview2_installed() -> bool {
    const REG_PATH: &str =
        r"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);

    hklm.open_subkey_with_flags(REG_PATH, KEY_READ)
        .ok()
        .and_then(|key| {
            let location = key.get_value::<String, _>("location").ok()?;
            let version = key.get_value::<String, _>("pv").ok()?;
            Some(webview2_exe_path(&location, &version))
        })
        .is_some_and(|path| path.exists())
}

#[cfg(not(windows))]
fn is_webview2_installed() -> bool {
    true
}

#[cfg(windows)]
fn webview2_exe_path(location: &str, version: &str) -> std::path::PathBuf {
    std::path::PathBuf::from(location)
        .join(version)
        .join("msedge.exe")
}

#[cfg(windows)]
fn warn_webview2_missing() {
    unsafe extern "system" {
        fn MessageBoxA(hwnd: isize, text: *const u8, caption: *const u8, flags: u32) -> i32;
    }

    unsafe {
        MessageBoxA(
            0,
            b"WebView2 is not installed on your system.\nPlease install WebView2 to run maoloader.\0"
                .as_ptr(),
            b"maoloader\0".as_ptr(),
            0x30,
        );
    }
}

#[cfg(windows)]
fn ifeo_is_activated() -> bool {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let path = [IFEO_PATH, IFEO_TARGET_EXE].join("\\");

    hklm.open_subkey_with_flags(path, KEY_READ)
        .ok()
        .and_then(|key| key.get_value::<String, _>("Debugger").ok())
        .filter(|value| value.to_ascii_lowercase().starts_with("rundll32"))
        .and_then(|value| extract_quoted_path(&value))
        .is_some_and(|path| {
            normalize_path(&path)
                == normalize_path(&crate::config::core_path().display().to_string())
        })
}

#[cfg(not(windows))]
fn ifeo_is_activated() -> bool {
    false
}

#[cfg(windows)]
fn ifeo_activate(active: bool) -> ActivationResult {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let ifeo = hklm
        .open_subkey_with_flags(IFEO_PATH, KEY_CREATE_SUB_KEY)
        .map_err(|error| (ActivationStage::OpenIfeo, error.kind()))?;

    let target = ifeo
        .create_subkey_with_flags(IFEO_TARGET_EXE, KEY_SET_VALUE)
        .map_err(|error| (ActivationStage::CreateTarget, error.kind()))?
        .0;

    if active {
        target
            .set_value("Debugger", &ifeo_debugger_value())
            .map_err(|error| (ActivationStage::SetDebugger, error.kind()))
    } else {
        match target.delete_value("Debugger") {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
            Err(error) => Err((ActivationStage::DeleteDebugger, error.kind())),
        }
    }
}

#[cfg(not(windows))]
fn ifeo_activate(_active: bool) -> ActivationResult {
    Err((ActivationStage::OpenIfeo, ErrorKind::Unsupported))
}

#[cfg(windows)]
fn symlink_is_activated() -> bool {
    let Some(link_path) = symlink_path() else {
        return false;
    };

    std::fs::symlink_metadata(&link_path)
        .ok()
        .filter(|metadata| metadata.file_type().is_symlink())
        .and_then(|_| std::fs::read_link(link_path).ok())
        .is_some_and(|target| path_matches_core(&target))
}

#[cfg(not(windows))]
fn symlink_is_activated() -> bool {
    false
}

#[cfg(windows)]
fn symlink_activate(active: bool) -> ActivationResult {
    let Some(link_path) = symlink_path() else {
        return Err((ActivationStage::GetLeaguePath, ErrorKind::NotFound));
    };

    if active {
        if let Ok(metadata) = std::fs::symlink_metadata(&link_path) {
            return if metadata.file_type().is_symlink()
                && std::fs::read_link(&link_path)
                    .ok()
                    .is_some_and(|target| path_matches_core(&target))
            {
                Ok(())
            } else {
                Err((ActivationStage::CreateSymlink, ErrorKind::AlreadyExists))
            };
        }

        std::os::windows::fs::symlink_file(crate::config::core_path(), link_path)
            .map_err(|error| (ActivationStage::CreateSymlink, error.kind()))
    } else {
        match std::fs::symlink_metadata(&link_path) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                match std::fs::read_link(&link_path) {
                    Ok(target) if path_matches_core(&target) => std::fs::remove_file(link_path)
                        .map_err(|error| (ActivationStage::DeleteSymlink, error.kind())),
                    Ok(_) => Ok(()),
                    Err(error) => Err((ActivationStage::DeleteSymlink, error.kind())),
                }
            }
            Ok(_) => Ok(()),
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
            Err(error) => Err((ActivationStage::DeleteSymlink, error.kind())),
        }
    }
}

#[cfg(not(windows))]
fn symlink_activate(_active: bool) -> ActivationResult {
    Err((ActivationStage::CreateSymlink, ErrorKind::Unsupported))
}

#[cfg(windows)]
fn symlink_path() -> Option<std::path::PathBuf> {
    crate::config::league_dir().map(|dir| dir.join(SYMLINK_TARGET_FILE))
}

#[cfg(windows)]
fn ifeo_debugger_value() -> String {
    const DLL_ENTRY: &str = "entry";
    format!(
        "rundll32 \"{}\", {DLL_ENTRY}",
        crate::config::core_path().display()
    )
}

#[cfg(windows)]
fn extract_quoted_path(value: &str) -> Option<String> {
    let start = value.find('"')?;
    let end = value[start + 1..].find('"')?;
    Some(value[start + 1..start + 1 + end].to_string())
}

#[cfg(windows)]
fn normalize_path(path: &str) -> String {
    path.to_ascii_lowercase().replace('/', "\\")
}

#[cfg(windows)]
fn path_matches_core(path: &std::path::Path) -> bool {
    normalize_path(&path.display().to_string())
        == normalize_path(&crate::config::core_path().display().to_string())
}

#[cfg(windows)]
fn encode_result(result: ActivationResult) -> i32 {
    match result {
        Ok(()) => 0,
        Err((stage, kind)) => ((stage as i32) << 8) | error_kind_code(kind),
    }
}

#[cfg(windows)]
fn decode_result(code: i32) -> ActivationResult {
    if code == 0 {
        return Ok(());
    }

    Err((
        stage_from_code((code >> 8) & 0xff),
        error_kind_from_code(code & 0xff),
    ))
}

#[cfg(windows)]
fn error_kind_code(kind: ErrorKind) -> i32 {
    match kind {
        ErrorKind::NotFound => 1,
        ErrorKind::PermissionDenied => 2,
        ErrorKind::AlreadyExists => 3,
        ErrorKind::InvalidInput => 4,
        ErrorKind::Unsupported => 5,
        _ => 255,
    }
}

#[cfg(windows)]
fn error_kind_from_code(code: i32) -> ErrorKind {
    match code {
        1 => ErrorKind::NotFound,
        2 => ErrorKind::PermissionDenied,
        3 => ErrorKind::AlreadyExists,
        4 => ErrorKind::InvalidInput,
        5 => ErrorKind::Unsupported,
        _ => ErrorKind::Other,
    }
}

#[cfg(windows)]
fn stage_from_code(code: i32) -> ActivationStage {
    match code {
        1 => ActivationStage::OpenIfeo,
        2 => ActivationStage::CreateTarget,
        3 => ActivationStage::SetDebugger,
        4 => ActivationStage::DeleteDebugger,
        5 => ActivationStage::GetLeaguePath,
        6 => ActivationStage::CreateSymlink,
        7 => ActivationStage::DeleteSymlink,
        _ => ActivationStage::RunElevated,
    }
}

#[cfg(test)]
mod tests {
    #[cfg(windows)]
    #[test]
    fn webview2_path_matches_upstream_registry_shape() {
        assert_eq!(
            super::webview2_exe_path(
                r"C:\Program Files (x86)\Microsoft\EdgeWebView\Application",
                "123.0.0.1"
            ),
            std::path::PathBuf::from(
                r"C:\Program Files (x86)\Microsoft\EdgeWebView\Application\123.0.0.1\msedge.exe"
            )
        );
    }
}
