#[cfg_attr(not(test), allow(dead_code))]
pub const VERSION_PROXY_EXPORTS: &[&str] = &[
    "GetFileVersionInfoA",
    "GetFileVersionInfoByHandle",
    "GetFileVersionInfoExA",
    "GetFileVersionInfoExW",
    "GetFileVersionInfoSizeA",
    "GetFileVersionInfoSizeExA",
    "GetFileVersionInfoSizeExW",
    "GetFileVersionInfoSizeW",
    "GetFileVersionInfoW",
    "VerFindFileA",
    "VerFindFileW",
    "VerInstallFileA",
    "VerInstallFileW",
    "VerLanguageNameA",
    "VerLanguageNameW",
    "VerQueryValueA",
    "VerQueryValueW",
];

#[cfg(windows)]
mod windows {
    use std::{
        ffi::{CStr, c_void},
        os::windows::ffi::OsStrExt,
        sync::OnceLock,
    };

    type Bool = i32;
    type Dword = u32;
    type Hresult = i32;
    type Lpcstr = *const i8;
    type Lpcwstr = *const u16;
    type Lpstr = *mut i8;
    type Lpwstr = *mut u16;
    type Lpvoid = *mut c_void;
    type Lpcvoid = *const c_void;
    type Puint = *mut u32;

    #[derive(Clone, Copy)]
    enum ProxyModule {
        D3d9,
        Dwrite,
        Version,
    }

    static D3D9: OnceLock<usize> = OnceLock::new();
    static DWRITE: OnceLock<usize> = OnceLock::new();
    static VERSION: OnceLock<usize> = OnceLock::new();

    unsafe extern "system" {
        fn GetCurrentProcess() -> isize;
        fn GetProcAddress(module: *mut c_void, name: *const i8) -> *mut c_void;
        fn GetSystemDirectoryW(buffer: *mut u16, size: u32) -> u32;
        fn GetSystemWow64DirectoryW(buffer: *mut u16, size: u32) -> u32;
        fn IsWow64Process(process: isize, wow64_process: *mut i32) -> i32;
        fn LoadLibraryW(path: *const u16) -> *mut c_void;
    }

    fn module_file_name(module: ProxyModule) -> &'static str {
        match module {
            ProxyModule::D3d9 => "d3d9.dll",
            ProxyModule::Dwrite => "dwrite.dll",
            ProxyModule::Version => "version.dll",
        }
    }

    fn module_cell(module: ProxyModule) -> &'static OnceLock<usize> {
        match module {
            ProxyModule::D3d9 => &D3D9,
            ProxyModule::Dwrite => &DWRITE,
            ProxyModule::Version => &VERSION,
        }
    }

    fn module_handle(module: ProxyModule) -> *mut c_void {
        let cell = module_cell(module);
        let file_name = module_file_name(module);
        *cell.get_or_init(|| load_system_module(file_name) as usize) as *mut c_void
    }

    fn load_system_module(file_name: &str) -> *mut c_void {
        const MAX_PATH: usize = 260;

        let mut directory = [0u16; MAX_PATH];
        let mut wow64 = 0;
        let mut length = unsafe {
            if IsWow64Process(GetCurrentProcess(), &mut wow64) != 0 && wow64 != 0 {
                GetSystemWow64DirectoryW(directory.as_mut_ptr(), directory.len() as u32)
            } else {
                GetSystemDirectoryW(directory.as_mut_ptr(), directory.len() as u32)
            }
        } as usize;

        if length == 0 || length >= directory.len() {
            length = unsafe { GetSystemDirectoryW(directory.as_mut_ptr(), directory.len() as u32) }
                as usize;
        }

        if length == 0 || length >= directory.len() {
            return std::ptr::null_mut();
        }

        let mut path = directory[..length].to_vec();
        path.push('\\' as u16);
        path.extend(std::ffi::OsStr::new(file_name).encode_wide());
        path.push(0);

        unsafe { LoadLibraryW(path.as_ptr()) }
    }

    fn proc(module: ProxyModule, name: &'static CStr) -> *mut c_void {
        let handle = module_handle(module);
        if handle.is_null() {
            return std::ptr::null_mut();
        }

        unsafe { GetProcAddress(handle, name.as_ptr()) }
    }

    macro_rules! forward {
        ($module:expr, $name:expr, $type:ty, $default:expr, ($($arg:expr),* $(,)?)) => {{
            let proc = proc($module, $name);
            if proc.is_null() {
                return $default;
            }

            let proc: $type = unsafe { std::mem::transmute(proc) };
            unsafe { proc($($arg),*) }
        }};
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn Direct3DCreate9(sdk_version: u32) -> Lpvoid {
        type Proc = unsafe extern "system" fn(u32) -> Lpvoid;
        forward!(
            ProxyModule::D3d9,
            c"Direct3DCreate9",
            Proc,
            std::ptr::null_mut(),
            (sdk_version)
        )
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn Direct3DCreate9Ex(sdk_version: u32, pp_ex: Lpvoid) -> Hresult {
        type Proc = unsafe extern "system" fn(u32, Lpvoid) -> Hresult;
        forward!(
            ProxyModule::D3d9,
            c"Direct3DCreate9Ex",
            Proc,
            0,
            (sdk_version, pp_ex)
        )
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn D3DPERF_BeginEvent(color: Dword, name: Lpcwstr) -> i32 {
        type Proc = unsafe extern "system" fn(Dword, Lpcwstr) -> i32;
        forward!(
            ProxyModule::D3d9,
            c"D3DPERF_BeginEvent",
            Proc,
            0,
            (color, name)
        )
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn D3DPERF_EndEvent() -> i32 {
        type Proc = unsafe extern "system" fn() -> i32;
        forward!(ProxyModule::D3d9, c"D3DPERF_EndEvent", Proc, 0, ())
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn D3DPERF_GetStatus() -> Dword {
        type Proc = unsafe extern "system" fn() -> Dword;
        forward!(ProxyModule::D3d9, c"D3DPERF_GetStatus", Proc, 0, ())
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn D3DPERF_QueryRepeatFrame() -> Bool {
        type Proc = unsafe extern "system" fn() -> Bool;
        forward!(ProxyModule::D3d9, c"D3DPERF_QueryRepeatFrame", Proc, 0, ())
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn D3DPERF_SetMarker(color: Dword, name: Lpcwstr) {
        type Proc = unsafe extern "system" fn(Dword, Lpcwstr);
        let proc = proc(ProxyModule::D3d9, c"D3DPERF_SetMarker");
        if !proc.is_null() {
            let proc: Proc = unsafe { std::mem::transmute(proc) };
            unsafe { proc(color, name) };
        }
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn D3DPERF_SetOptions(options: Dword) -> i32 {
        type Proc = unsafe extern "system" fn(Dword) -> i32;
        forward!(ProxyModule::D3d9, c"D3DPERF_SetOptions", Proc, 0, (options))
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn D3DPERF_SetRegion(color: Dword, name: Lpcwstr) {
        type Proc = unsafe extern "system" fn(Dword, Lpcwstr);
        let proc = proc(ProxyModule::D3d9, c"D3DPERF_SetRegion");
        if !proc.is_null() {
            let proc: Proc = unsafe { std::mem::transmute(proc) };
            unsafe { proc(color, name) };
        }
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn DWriteCreateFactory(
        factory_type: i32,
        iid: *const c_void,
        factory: *mut *mut c_void,
    ) -> Hresult {
        type Proc = unsafe extern "system" fn(i32, *const c_void, *mut *mut c_void) -> Hresult;
        forward!(
            ProxyModule::Dwrite,
            c"DWriteCreateFactory",
            Proc,
            0,
            (factory_type, iid, factory)
        )
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn GetFileVersionInfoA(
        filename: Lpcstr,
        handle: Dword,
        len: Dword,
        data: Lpvoid,
    ) -> Bool {
        type Proc = unsafe extern "system" fn(Lpcstr, Dword, Dword, Lpvoid) -> Bool;
        forward!(
            ProxyModule::Version,
            c"GetFileVersionInfoA",
            Proc,
            0,
            (filename, handle, len, data)
        )
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn GetFileVersionInfoByHandle(
        mem: i32,
        filename: Lpcwstr,
        v2: i32,
        v3: i32,
    ) -> i32 {
        type Proc = unsafe extern "system" fn(i32, Lpcwstr, i32, i32) -> i32;
        forward!(
            ProxyModule::Version,
            c"GetFileVersionInfoByHandle",
            Proc,
            0,
            (mem, filename, v2, v3)
        )
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn GetFileVersionInfoExA(
        flags: Dword,
        filename: Lpcstr,
        handle: Dword,
        len: Dword,
        data: Lpvoid,
    ) -> Bool {
        type Proc = unsafe extern "system" fn(Dword, Lpcstr, Dword, Dword, Lpvoid) -> Bool;
        forward!(
            ProxyModule::Version,
            c"GetFileVersionInfoExA",
            Proc,
            0,
            (flags, filename, handle, len, data)
        )
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn GetFileVersionInfoExW(
        flags: Dword,
        filename: Lpcwstr,
        handle: Dword,
        len: Dword,
        data: Lpvoid,
    ) -> Bool {
        type Proc = unsafe extern "system" fn(Dword, Lpcwstr, Dword, Dword, Lpvoid) -> Bool;
        forward!(
            ProxyModule::Version,
            c"GetFileVersionInfoExW",
            Proc,
            0,
            (flags, filename, handle, len, data)
        )
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn GetFileVersionInfoSizeA(filename: Lpcstr, handle: *mut Dword) -> Dword {
        type Proc = unsafe extern "system" fn(Lpcstr, *mut Dword) -> Dword;
        forward!(
            ProxyModule::Version,
            c"GetFileVersionInfoSizeA",
            Proc,
            0,
            (filename, handle)
        )
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn GetFileVersionInfoSizeExA(
        flags: Dword,
        filename: Lpcstr,
        handle: *mut Dword,
    ) -> Dword {
        type Proc = unsafe extern "system" fn(Dword, Lpcstr, *mut Dword) -> Dword;
        forward!(
            ProxyModule::Version,
            c"GetFileVersionInfoSizeExA",
            Proc,
            0,
            (flags, filename, handle)
        )
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn GetFileVersionInfoSizeExW(
        flags: Dword,
        filename: Lpcwstr,
        handle: *mut Dword,
    ) -> Dword {
        type Proc = unsafe extern "system" fn(Dword, Lpcwstr, *mut Dword) -> Dword;
        forward!(
            ProxyModule::Version,
            c"GetFileVersionInfoSizeExW",
            Proc,
            0,
            (flags, filename, handle)
        )
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn GetFileVersionInfoSizeW(filename: Lpcwstr, handle: *mut Dword) -> Dword {
        type Proc = unsafe extern "system" fn(Lpcwstr, *mut Dword) -> Dword;
        forward!(
            ProxyModule::Version,
            c"GetFileVersionInfoSizeW",
            Proc,
            0,
            (filename, handle)
        )
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn GetFileVersionInfoW(
        filename: Lpcwstr,
        handle: Dword,
        len: Dword,
        data: Lpvoid,
    ) -> Bool {
        type Proc = unsafe extern "system" fn(Lpcwstr, Dword, Dword, Lpvoid) -> Bool;
        forward!(
            ProxyModule::Version,
            c"GetFileVersionInfoW",
            Proc,
            0,
            (filename, handle, len, data)
        )
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn VerFindFileA(
        flags: Dword,
        file_name: Lpcstr,
        win_dir: Lpcstr,
        app_dir: Lpcstr,
        cur_dir: Lpstr,
        cur_dir_len: Puint,
        dest_dir: Lpstr,
        dest_dir_len: Puint,
    ) -> Dword {
        type Proc = unsafe extern "system" fn(
            Dword,
            Lpcstr,
            Lpcstr,
            Lpcstr,
            Lpstr,
            Puint,
            Lpstr,
            Puint,
        ) -> Dword;
        forward!(
            ProxyModule::Version,
            c"VerFindFileA",
            Proc,
            0,
            (
                flags,
                file_name,
                win_dir,
                app_dir,
                cur_dir,
                cur_dir_len,
                dest_dir,
                dest_dir_len
            )
        )
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn VerFindFileW(
        flags: Dword,
        file_name: Lpcwstr,
        win_dir: Lpcwstr,
        app_dir: Lpcwstr,
        cur_dir: Lpwstr,
        cur_dir_len: Puint,
        dest_dir: Lpwstr,
        dest_dir_len: Puint,
    ) -> Dword {
        type Proc = unsafe extern "system" fn(
            Dword,
            Lpcwstr,
            Lpcwstr,
            Lpcwstr,
            Lpwstr,
            Puint,
            Lpwstr,
            Puint,
        ) -> Dword;
        forward!(
            ProxyModule::Version,
            c"VerFindFileW",
            Proc,
            0,
            (
                flags,
                file_name,
                win_dir,
                app_dir,
                cur_dir,
                cur_dir_len,
                dest_dir,
                dest_dir_len
            )
        )
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn VerInstallFileA(
        flags: Dword,
        src_file_name: Lpcstr,
        dest_file_name: Lpcstr,
        src_dir: Lpcstr,
        dest_dir: Lpcstr,
        cur_dir: Lpcstr,
        tmp_file: Lpstr,
        tmp_file_len: Puint,
    ) -> Dword {
        type Proc = unsafe extern "system" fn(
            Dword,
            Lpcstr,
            Lpcstr,
            Lpcstr,
            Lpcstr,
            Lpcstr,
            Lpstr,
            Puint,
        ) -> Dword;
        forward!(
            ProxyModule::Version,
            c"VerInstallFileA",
            Proc,
            0,
            (
                flags,
                src_file_name,
                dest_file_name,
                src_dir,
                dest_dir,
                cur_dir,
                tmp_file,
                tmp_file_len
            )
        )
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn VerInstallFileW(
        flags: Dword,
        src_file_name: Lpcwstr,
        dest_file_name: Lpcwstr,
        src_dir: Lpcwstr,
        dest_dir: Lpcwstr,
        cur_dir: Lpcwstr,
        tmp_file: Lpwstr,
        tmp_file_len: Puint,
    ) -> Dword {
        type Proc = unsafe extern "system" fn(
            Dword,
            Lpcwstr,
            Lpcwstr,
            Lpcwstr,
            Lpcwstr,
            Lpcwstr,
            Lpwstr,
            Puint,
        ) -> Dword;
        forward!(
            ProxyModule::Version,
            c"VerInstallFileW",
            Proc,
            0,
            (
                flags,
                src_file_name,
                dest_file_name,
                src_dir,
                dest_dir,
                cur_dir,
                tmp_file,
                tmp_file_len
            )
        )
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn VerLanguageNameA(
        lang: Dword,
        lang_name: Lpstr,
        lang_len: Dword,
    ) -> Dword {
        type Proc = unsafe extern "system" fn(Dword, Lpstr, Dword) -> Dword;
        forward!(
            ProxyModule::Version,
            c"VerLanguageNameA",
            Proc,
            0,
            (lang, lang_name, lang_len)
        )
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn VerLanguageNameW(
        lang: Dword,
        lang_name: Lpwstr,
        lang_len: Dword,
    ) -> Dword {
        type Proc = unsafe extern "system" fn(Dword, Lpwstr, Dword) -> Dword;
        forward!(
            ProxyModule::Version,
            c"VerLanguageNameW",
            Proc,
            0,
            (lang, lang_name, lang_len)
        )
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn VerQueryValueA(
        block: Lpcvoid,
        sub_block: Lpcstr,
        buffer: *mut Lpvoid,
        len: Puint,
    ) -> Bool {
        type Proc = unsafe extern "system" fn(Lpcvoid, Lpcstr, *mut Lpvoid, Puint) -> Bool;
        forward!(
            ProxyModule::Version,
            c"VerQueryValueA",
            Proc,
            0,
            (block, sub_block, buffer, len)
        )
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn VerQueryValueW(
        block: Lpcvoid,
        sub_block: Lpcwstr,
        buffer: *mut Lpvoid,
        len: Puint,
    ) -> Bool {
        type Proc = unsafe extern "system" fn(Lpcvoid, Lpcwstr, *mut Lpvoid, Puint) -> Bool;
        forward!(
            ProxyModule::Version,
            c"VerQueryValueW",
            Proc,
            0,
            (block, sub_block, buffer, len)
        )
    }
}

#[cfg(test)]
mod tests {
    use super::VERSION_PROXY_EXPORTS;

    #[test]
    fn version_proxy_exports_match_upstream() {
        assert_eq!(VERSION_PROXY_EXPORTS.len(), 17);
        assert!(
            VERSION_PROXY_EXPORTS
                .windows(2)
                .all(|pair| pair[0] < pair[1])
        );
        assert!(VERSION_PROXY_EXPORTS.contains(&"GetFileVersionInfoA"));
        assert!(VERSION_PROXY_EXPORTS.contains(&"VerQueryValueW"));
    }
}
