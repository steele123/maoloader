#[cfg(windows)]
use std::ffi::{CString, c_void};

#[cfg(windows)]
pub fn find_lib(name: &str) -> Option<*mut c_void> {
    let name = CString::new(name).ok()?;

    unsafe extern "system" {
        fn GetModuleHandleA(name: *const i8) -> *mut c_void;
    }

    let handle = unsafe { GetModuleHandleA(name.as_ptr()) };

    if handle.is_null() { None } else { Some(handle) }
}

#[cfg(not(windows))]
pub fn find_lib(_name: &str) -> Option<*mut std::ffi::c_void> {
    None
}

#[cfg(windows)]
pub fn find_proc(module: *mut c_void, name: &str) -> Option<*mut c_void> {
    let name = CString::new(name).ok()?;

    unsafe extern "system" {
        fn GetProcAddress(module: *mut c_void, name: *const i8) -> *mut c_void;
    }

    let proc = unsafe { GetProcAddress(module, name.as_ptr()) };

    if proc.is_null() { None } else { Some(proc) }
}

#[cfg(windows)]
pub fn find_memory(relative_address: *const c_void, pattern: &str) -> Option<*mut c_void> {
    let pattern = parse_pattern(pattern)?;
    if pattern.is_empty() {
        return None;
    }

    let base = module_base_from_address(relative_address)?;
    let size = unsafe { pe_image_size(base) }?;

    unsafe {
        let data = std::slice::from_raw_parts(base.cast::<u8>(), size);
        scan_pattern(data, &pattern).map(|offset| base.cast::<u8>().add(offset).cast::<c_void>())
    }
}

#[cfg(not(windows))]
pub fn find_proc(_module: *mut std::ffi::c_void, _name: &str) -> Option<*mut std::ffi::c_void> {
    None
}

#[cfg(not(windows))]
pub fn find_memory(
    _relative_address: *const std::ffi::c_void,
    _pattern: &str,
) -> Option<*mut std::ffi::c_void> {
    None
}

#[cfg(windows)]
pub fn libcef_version_major() -> Option<i32> {
    type CefVersionInfo = unsafe extern "C" fn(i32) -> i32;

    let libcef = find_lib("libcef.dll")?;
    let proc = find_proc(libcef, "cef_version_info")?;
    let cef_version_info: CefVersionInfo = unsafe { std::mem::transmute(proc) };

    Some(unsafe { cef_version_info(0) })
}

#[cfg(not(windows))]
pub fn libcef_version_major() -> Option<i32> {
    None
}

fn parse_pattern(pattern: &str) -> Option<Vec<Option<u8>>> {
    pattern
        .split_ascii_whitespace()
        .map(|part| {
            if part == "?" || part == "??" {
                Some(None)
            } else {
                u8::from_str_radix(part, 16).ok().map(Some)
            }
        })
        .collect()
}

fn scan_pattern(data: &[u8], pattern: &[Option<u8>]) -> Option<usize> {
    if pattern.is_empty() || pattern.len() > data.len() {
        return None;
    }

    data.windows(pattern.len()).position(|window| {
        window
            .iter()
            .zip(pattern)
            .all(|(byte, expected)| expected.is_none_or(|expected| *byte == expected))
    })
}

#[cfg(windows)]
fn module_base_from_address(address: *const c_void) -> Option<*mut c_void> {
    const GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT: u32 = 0x00000002;
    const GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS: u32 = 0x00000004;

    unsafe extern "system" {
        fn GetModuleHandleExA(flags: u32, name: *const i8, module: *mut *mut c_void) -> i32;
    }

    let mut module = std::ptr::null_mut();
    let ok = unsafe {
        GetModuleHandleExA(
            GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
            address.cast(),
            &mut module,
        )
    };

    if ok == 0 || module.is_null() {
        None
    } else {
        Some(module)
    }
}

#[cfg(windows)]
unsafe fn pe_image_size(base: *mut c_void) -> Option<usize> {
    const IMAGE_DOS_SIGNATURE: u16 = 0x5a4d;
    const IMAGE_NT_SIGNATURE: u32 = 0x0000_4550;
    const DOS_E_LFANEW_OFFSET: usize = 0x3c;
    const FILE_HEADER_SIZE: usize = 20;
    const OPTIONAL_HEADER_SIZE_OF_IMAGE_OFFSET: usize = 56;

    if base.is_null() {
        return None;
    }

    let base = base.cast::<u8>();
    let dos_signature = unsafe { std::ptr::read_unaligned(base.cast::<u16>()) };
    if dos_signature != IMAGE_DOS_SIGNATURE {
        return None;
    }

    let e_lfanew = unsafe { std::ptr::read_unaligned(base.add(DOS_E_LFANEW_OFFSET).cast::<i32>()) };
    if e_lfanew <= 0 {
        return None;
    }

    let nt_header = unsafe { base.add(e_lfanew as usize) };
    let nt_signature = unsafe { std::ptr::read_unaligned(nt_header.cast::<u32>()) };
    if nt_signature != IMAGE_NT_SIGNATURE {
        return None;
    }

    let size_of_image = unsafe {
        std::ptr::read_unaligned(
            nt_header
                .add(
                    std::mem::size_of::<u32>()
                        + FILE_HEADER_SIZE
                        + OPTIONAL_HEADER_SIZE_OF_IMAGE_OFFSET,
                )
                .cast::<u32>(),
        )
    };

    if size_of_image == 0 {
        None
    } else {
        Some(size_of_image as usize)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_upstream_style_hex_patterns() {
        assert_eq!(
            parse_pattern("41 83 F8 ?? 74 ? 45 31 C0"),
            Some(vec![
                Some(0x41),
                Some(0x83),
                Some(0xf8),
                None,
                Some(0x74),
                None,
                Some(0x45),
                Some(0x31),
                Some(0xc0),
            ])
        );
        assert_eq!(parse_pattern("not-hex"), None);
    }

    #[test]
    fn scans_pattern_with_wildcards() {
        let data = [0x90, 0x41, 0x83, 0xf8, 0x01, 0x74, 0x0b, 0xcc];
        let pattern = parse_pattern("41 83 F8 ?? 74 0B").unwrap();

        assert_eq!(scan_pattern(&data, &pattern), Some(1));
        assert_eq!(
            scan_pattern(&data, &parse_pattern("41 83 F8 02").unwrap()),
            None
        );
    }
}
