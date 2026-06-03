#![cfg_attr(not(windows), allow(dead_code))]

use std::ffi::c_void;

#[cfg(windows)]
use std::sync::atomic::{AtomicUsize, Ordering};

#[cfg(windows)]
type Bool = i32;
#[cfg(windows)]
type Handle = isize;

#[cfg(windows)]
const CREATE_SUSPENDED: u32 = 0x0000_0004;

#[cfg(windows)]
#[repr(C)]
pub struct ProcessInformation {
    process: Handle,
    thread: Handle,
    process_id: u32,
    thread_id: u32,
}

#[cfg(windows)]
static CREATE_PROCESS_HOOK_COUNT: AtomicUsize = AtomicUsize::new(0);
#[cfg(windows)]
static RENDERER_EARLY_INJECT_COUNT: AtomicUsize = AtomicUsize::new(0);

#[cfg(windows)]
static mut KERNELBASE_CREATE_PROCESS_W_HOOK: Option<crate::hook::InlineHook> = None;

pub fn install_browser_child_process_hooks() {
    #[cfg(windows)]
    unsafe {
        install_create_process_hook("KernelBase.dll", &raw mut KERNELBASE_CREATE_PROCESS_W_HOOK);
    }
}

pub fn create_process_hook_count() -> usize {
    #[cfg(windows)]
    {
        return CREATE_PROCESS_HOOK_COUNT.load(Ordering::Relaxed);
    }

    #[cfg(not(windows))]
    {
        0
    }
}

pub fn renderer_early_inject_count() -> usize {
    #[cfg(windows)]
    {
        return RENDERER_EARLY_INJECT_COUNT.load(Ordering::Relaxed);
    }

    #[cfg(not(windows))]
    {
        0
    }
}

#[cfg(windows)]
unsafe fn install_create_process_hook(
    module_name: &str,
    hook_slot: *mut Option<crate::hook::InlineHook>,
) {
    unsafe {
        if (*hook_slot).is_some() {
            return;
        }
    }

    let Some(module) = crate::dylib::find_lib(module_name) else {
        return;
    };
    let Some(target) = crate::dylib::find_proc(module, "CreateProcessW") else {
        return;
    };
    let Ok(hook) = (unsafe {
        crate::hook::InlineHook::install(target, hooked_create_process_w as *const c_void)
    }) else {
        return;
    };

    unsafe {
        *hook_slot = Some(hook);
    }
    CREATE_PROCESS_HOOK_COUNT.fetch_add(1, Ordering::Relaxed);
    crate::trace::record(
        "browser.create_process_hook.install",
        &[("module", module_name.to_string())],
    );
}

#[cfg(windows)]
unsafe extern "system" fn hooked_create_process_w(
    application_name: *const u16,
    command_line: *mut u16,
    process_attributes: *mut c_void,
    thread_attributes: *mut c_void,
    inherit_handles: Bool,
    creation_flags: u32,
    environment: *mut c_void,
    current_directory: *const u16,
    startup_info: *mut c_void,
    process_information: *mut ProcessInformation,
) -> Bool {
    type Fn = unsafe extern "system" fn(
        *const u16,
        *mut u16,
        *mut c_void,
        *mut c_void,
        Bool,
        u32,
        *mut c_void,
        *const u16,
        *mut c_void,
        *mut ProcessInformation,
    ) -> Bool;

    let command = create_process_command(application_name, command_line);
    let renderer = is_league_renderer_command(&command);
    let force_suspended = renderer && creation_flags & CREATE_SUSPENDED == 0;
    let effective_flags = if force_suspended {
        creation_flags | CREATE_SUSPENDED
    } else {
        creation_flags
    };

    let result = unsafe {
        call_create_process_original(&raw mut KERNELBASE_CREATE_PROCESS_W_HOOK, |target| {
            let original: Fn = std::mem::transmute(target);
            original(
                application_name,
                command_line,
                process_attributes,
                thread_attributes,
                inherit_handles,
                effective_flags,
                environment,
                current_directory,
                startup_info,
                process_information,
            )
        })
    }
    .unwrap_or(0);

    if result != 0 && renderer && !process_information.is_null() {
        let info = unsafe { &*process_information };
        let injection = crate::inject::inject_dll(info.process, &crate::config::core_path());
        if injection.is_ok() {
            RENDERER_EARLY_INJECT_COUNT.fetch_add(1, Ordering::Relaxed);
        }
        crate::trace::record(
            "renderer.create_process.inject",
            &[
                ("pid", info.process_id.to_string()),
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

        if force_suspended {
            unsafe {
                ResumeThread(info.thread);
            }
        }
    }

    result
}

#[cfg(windows)]
unsafe fn call_create_process_original<F, R>(
    hook_slot: *mut Option<crate::hook::InlineHook>,
    call: F,
) -> Option<R>
where
    F: FnOnce(*mut c_void) -> R,
{
    let hook = unsafe { (*hook_slot).as_mut()? };
    Some(unsafe { hook.call_original(call) })
}

#[cfg(windows)]
fn create_process_command(application_name: *const u16, command_line: *const u16) -> String {
    let command_line = unsafe { wide_ptr_to_string(command_line) }.unwrap_or_default();
    if !command_line.trim().is_empty() {
        return command_line;
    }

    unsafe { wide_ptr_to_string(application_name) }.unwrap_or_default()
}

#[cfg(windows)]
fn is_league_renderer_command(command: &str) -> bool {
    crate::platform::contains_ignore_ascii_case(command, "LeagueClientUxRender.exe")
        && crate::platform::contains_ignore_ascii_case(command, "--type=renderer")
}

#[cfg(windows)]
unsafe fn wide_ptr_to_string(value: *const u16) -> Option<String> {
    if value.is_null() {
        return None;
    }

    let mut len = 0;
    unsafe {
        while *value.add(len) != 0 {
            len += 1;
        }

        Some(String::from_utf16_lossy(std::slice::from_raw_parts(
            value, len,
        )))
    }
}

#[cfg(windows)]
unsafe extern "system" {
    fn ResumeThread(thread: Handle) -> u32;
}

#[cfg(test)]
mod tests {
    #[test]
    fn detects_only_real_league_renderer_commands() {
        assert!(super::is_league_renderer_command(
            r#""C:\Riot Games\League of Legends\LeagueClientUxRender.exe" --type=renderer --lang=en-US"#
        ));
        assert!(!super::is_league_renderer_command(
            r#""C:\Riot Games\League of Legends\LeagueClientUxRender.exe" --type=gpu-process"#
        ));
        assert!(!super::is_league_renderer_command(
            r#""C:\Riot Games\League of Legends\LeagueClientUx.exe" --type=renderer"#
        ));
    }
}
