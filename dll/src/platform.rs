#[cfg(windows)]
pub fn current_process_name() -> Option<String> {
    let mut buffer = [0_u16; 2048];

    unsafe extern "system" {
        fn GetModuleFileNameW(module: isize, filename: *mut u16, size: u32) -> u32;
    }

    let length = unsafe { GetModuleFileNameW(0, buffer.as_mut_ptr(), buffer.len() as u32) };

    if length == 0 {
        return None;
    }

    let path = String::from_utf16_lossy(&buffer[..length as usize]);
    path.rsplit(['\\', '/']).next().map(str::to_string)
}

#[cfg(not(windows))]
pub fn current_process_name() -> Option<String> {
    std::env::current_exe().ok().and_then(|path| {
        path.file_name()
            .map(|name| name.to_string_lossy().into_owned())
    })
}

pub fn contains_ignore_ascii_case(value: &str, needle: &str) -> bool {
    value
        .to_ascii_lowercase()
        .contains(&needle.to_ascii_lowercase())
}

pub fn is_browser_process_from(process_name: Option<&str>) -> bool {
    process_name.is_some_and(|name| contains_ignore_ascii_case(name, "LeagueClientUx.exe"))
}

pub fn is_renderer_process_from(process_name: Option<&str>, command_line: &str) -> bool {
    let process_matches = process_name
        .is_some_and(|name| contains_ignore_ascii_case(name, "LeagueClientUxRender.exe"));
    let command_line_matches = contains_ignore_ascii_case(command_line, "--type=renderer");

    process_matches && command_line_matches
}

#[cfg(windows)]
pub fn current_command_line() -> Option<String> {
    unsafe extern "system" {
        fn GetCommandLineW() -> *const u16;
    }

    let command_line = unsafe { GetCommandLineW() };
    if command_line.is_null() {
        return None;
    }

    let mut length = 0;
    unsafe {
        while *command_line.add(length) != 0 {
            length += 1;
        }

        Some(String::from_utf16_lossy(std::slice::from_raw_parts(
            command_line,
            length,
        )))
    }
}

#[cfg(not(windows))]
pub fn current_command_line() -> Option<String> {
    Some(std::env::args().collect::<Vec<_>>().join(" "))
}

pub fn os_version() -> String {
    #[cfg(windows)]
    {
        let version = windows_version();
        return format!("{}.{}.{}", version.major, version.minor, version.build);
    }

    #[cfg(target_os = "macos")]
    {
        return std::process::Command::new("sw_vers")
            .arg("-productVersion")
            .output()
            .ok()
            .and_then(|output| String::from_utf8(output.stdout).ok())
            .map(|version| version.trim().to_string())
            .filter(|version| !version.is_empty())
            .unwrap_or_default();
    }

    #[cfg(not(any(windows, target_os = "macos")))]
    {
        String::new()
    }
}

pub fn os_build() -> String {
    #[cfg(windows)]
    {
        return windows_version().build.to_string();
    }

    #[cfg(target_os = "macos")]
    {
        return std::process::Command::new("sw_vers")
            .arg("-buildVersion")
            .output()
            .ok()
            .and_then(|output| String::from_utf8(output.stdout).ok())
            .map(|build| build.trim().to_string())
            .filter(|build| !build.is_empty())
            .unwrap_or_default();
    }

    #[cfg(not(any(windows, target_os = "macos")))]
    {
        String::new()
    }
}

#[cfg(windows)]
#[derive(Debug, Clone, Copy)]
struct WindowsVersion {
    major: u32,
    minor: u32,
    build: u32,
}

#[cfg(windows)]
fn windows_version() -> WindowsVersion {
    #[repr(C)]
    struct OsVersionInfoExW {
        size: u32,
        major_version: u32,
        minor_version: u32,
        build_number: u32,
        platform_id: u32,
        csd_version: [u16; 128],
        service_pack_major: u16,
        service_pack_minor: u16,
        suite_mask: u16,
        product_type: u8,
        reserved: u8,
    }

    unsafe extern "system" {
        fn RtlGetVersion(version: *mut OsVersionInfoExW) -> i32;
    }

    let mut version = OsVersionInfoExW {
        size: std::mem::size_of::<OsVersionInfoExW>() as u32,
        major_version: 0,
        minor_version: 0,
        build_number: 0,
        platform_id: 0,
        csd_version: [0; 128],
        service_pack_major: 0,
        service_pack_minor: 0,
        suite_mask: 0,
        product_type: 0,
        reserved: 0,
    };

    if unsafe { RtlGetVersion(&mut version) } == 0 {
        WindowsVersion {
            major: version.major_version,
            minor: version.minor_version,
            build: version.build_number,
        }
    } else {
        WindowsVersion {
            major: 0,
            minor: 0,
            build: 0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn case_insensitive_contains_matches_upstream_style() {
        assert!(contains_ignore_ascii_case(
            "LeagueClientUxRender.exe --type=renderer",
            "leagueclientuxrender.exe"
        ));
    }

    #[test]
    fn browser_detection_matches_client_process_name() {
        assert!(is_browser_process_from(Some("LeagueClientUx.exe")));
        assert!(is_browser_process_from(Some(
            "C:\\Riot Games\\League of Legends\\LeagueClientUx.exe"
        )));
        assert!(!is_browser_process_from(Some("LeagueClientUxRender.exe")));
        assert!(!is_browser_process_from(None));
    }

    #[test]
    fn renderer_detection_uses_process_name_and_raw_command_line() {
        assert!(is_renderer_process_from(
            Some("LeagueClientUxRender.exe"),
            "\"LeagueClientUxRender.exe\" --type=renderer --lang=en_US"
        ));
        assert!(is_renderer_process_from(
            Some("LeagueClientUxRender.exe"),
            "\"LeagueClientUxRender.exe\" --TYPE=RENDERER"
        ));
        assert!(!is_renderer_process_from(
            Some("LeagueClientUxRender.exe"),
            "\"LeagueClientUxRender.exe\" --type=gpu-process"
        ));
        assert!(!is_renderer_process_from(
            Some("LeagueClientUx.exe"),
            "\"LeagueClientUx.exe\" --type=renderer"
        ));
    }
}
