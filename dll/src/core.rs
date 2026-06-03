use std::sync::OnceLock;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u32)]
pub enum CoreProcessKind {
    Unknown = 0,
    Browser = 1,
    Renderer = 2,
}

#[derive(Debug, Clone, Copy)]
pub struct CoreState {
    pub process_kind: CoreProcessKind,
    pub libcef_version: i32,
    pub libcef_supported: bool,
    pub hook_ready: bool,
    pub cef_symbols: crate::cef::CefHookState,
}

pub const SUPPORTED_LIBCEF_MAJOR: i32 = 108;

static STATE: OnceLock<CoreState> = OnceLock::new();

pub fn initialize() {
    let process_name = crate::platform::current_process_name();
    let command_line = crate::platform::current_command_line().unwrap_or_default();
    let process_kind = if crate::platform::is_browser_process_from(process_name.as_deref()) {
        CoreProcessKind::Browser
    } else if crate::platform::is_renderer_process_from(process_name.as_deref(), &command_line) {
        CoreProcessKind::Renderer
    } else {
        CoreProcessKind::Unknown
    };

    let libcef_version = crate::dylib::libcef_version_major().unwrap_or(0);
    let libcef_supported = libcef_supported(libcef_version);
    let cef_symbols = match (process_kind, libcef_supported) {
        (CoreProcessKind::Browser, true) => crate::cef::install_for_browser_process(),
        (CoreProcessKind::Renderer, true) => crate::cef::install_for_renderer_process(),
        (CoreProcessKind::Browser, false) if libcef_version == 0 => {
            crate::cef_types::alert("Failed to load Chromium Embedded Framework.", "maoloader");
            crate::cef::probe_symbols()
        }
        (CoreProcessKind::Browser, false) => {
            crate::cef_types::alert(
                "maoloader does not support your Client version.",
                "maoloader",
            );
            crate::cef::probe_symbols()
        }
        (CoreProcessKind::Unknown, _) => crate::cef::probe_symbols(),
        (_, false) => crate::cef::probe_symbols(),
    };

    let state = CoreState {
        process_kind,
        libcef_version,
        libcef_supported,
        hook_ready: process_kind != CoreProcessKind::Unknown
            && libcef_supported
            && match process_kind {
                CoreProcessKind::Browser => {
                    cef_symbols.initialize
                        && cef_symbols.create_browser
                        && cef_symbols.create_context
                }
                CoreProcessKind::Renderer => cef_symbols.execute_process,
                CoreProcessKind::Unknown => false,
            },
        cef_symbols,
    };

    crate::trace::record(
        "core.initialize",
        &[
            ("process_kind", format!("{:?}", state.process_kind)),
            ("process_name", process_name.unwrap_or_default()),
            (
                "command_line_has_renderer",
                crate::platform::contains_ignore_ascii_case(&command_line, "--type=renderer")
                    .to_string(),
            ),
            ("libcef_version", state.libcef_version.to_string()),
            ("libcef_supported", state.libcef_supported.to_string()),
            ("hook_ready", state.hook_ready.to_string()),
            (
                "browser_initialize",
                state.cef_symbols.initialize.to_string(),
            ),
            (
                "browser_create",
                state.cef_symbols.create_browser.to_string(),
            ),
            (
                "browser_context",
                state.cef_symbols.create_context.to_string(),
            ),
            (
                "renderer_execute",
                state.cef_symbols.execute_process.to_string(),
            ),
        ],
    );

    let _ = STATE.set(state);
}

pub fn state() -> CoreState {
    *STATE.get().unwrap_or(&CoreState {
        process_kind: CoreProcessKind::Unknown,
        libcef_version: 0,
        libcef_supported: false,
        hook_ready: false,
        cef_symbols: crate::cef::CefHookState::default(),
    })
}

pub fn process_kind_code() -> u32 {
    state().process_kind as u32
}

pub fn libcef_version() -> i32 {
    state().libcef_version
}

pub fn supported_libcef_major() -> i32 {
    SUPPORTED_LIBCEF_MAJOR
}

pub fn libcef_supported_current() -> bool {
    state().libcef_supported
}

pub fn hook_ready() -> bool {
    state().hook_ready
}

pub fn browser_hook_symbol_count() -> usize {
    let symbols = state().cef_symbols;
    usize::from(symbols.initialize)
        + usize::from(symbols.create_browser)
        + usize::from(symbols.create_context)
}

pub fn renderer_hook_symbol_count() -> usize {
    usize::from(state().cef_symbols.execute_process)
}

pub fn libcef_supported(version: i32) -> bool {
    version == SUPPORTED_LIBCEF_MAJOR
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn libcef_support_matches_upstream_major_pin() {
        assert!(libcef_supported(108));
        assert!(!libcef_supported(0));
        assert!(!libcef_supported(109));
    }
}
