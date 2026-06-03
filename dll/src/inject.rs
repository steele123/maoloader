use std::{io, path::Path};

#[cfg(windows)]
use std::{ffi::c_void, os::windows::ffi::OsStrExt};

#[cfg(windows)]
type Handle = isize;

#[cfg(windows)]
const MEM_COMMIT: u32 = 0x1000;
#[cfg(windows)]
const PAGE_READWRITE: u32 = 0x04;
#[cfg(windows)]
const MEM_RELEASE: u32 = 0x8000;
#[cfg(windows)]
const WAIT_INFINITE: u32 = 0xffff_ffff;
#[cfg(windows)]
pub fn inject_dll(process: Handle, dll_path: &Path) -> io::Result<()> {
    let encoded = dll_path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let size = encoded.len() * std::mem::size_of::<u16>();

    unsafe extern "system" {
        fn GetModuleHandleA(name: *const i8) -> *mut c_void;
        fn GetProcAddress(module: *mut c_void, name: *const i8) -> *mut c_void;
        fn VirtualAllocEx(
            process: Handle,
            address: *mut c_void,
            size: usize,
            allocation_type: u32,
            protect: u32,
        ) -> *mut c_void;
        fn WriteProcessMemory(
            process: Handle,
            base_address: *mut c_void,
            buffer: *const c_void,
            size: usize,
            written: *mut usize,
        ) -> i32;
        fn CreateRemoteThread(
            process: Handle,
            attributes: *mut c_void,
            stack_size: usize,
            start_address: *mut c_void,
            parameter: *mut c_void,
            creation_flags: u32,
            thread_id: *mut u32,
        ) -> Handle;
        fn WaitForSingleObject(handle: Handle, milliseconds: u32) -> u32;
        fn GetExitCodeThread(thread: Handle, exit_code: *mut u32) -> i32;
        fn VirtualFreeEx(process: Handle, address: *mut c_void, size: usize, free_type: u32)
        -> i32;
        fn CloseHandle(handle: Handle) -> i32;
    }

    let kernel32 = unsafe { GetModuleHandleA(c"kernel32.dll".as_ptr()) };
    if kernel32.is_null() {
        return Err(io::Error::last_os_error());
    }

    let load_library = unsafe { GetProcAddress(kernel32, c"LoadLibraryW".as_ptr()) };
    if load_library.is_null() {
        return Err(io::Error::last_os_error());
    }

    let remote_path = unsafe {
        VirtualAllocEx(
            process,
            std::ptr::null_mut(),
            size,
            MEM_COMMIT,
            PAGE_READWRITE,
        )
    };
    if remote_path.is_null() {
        return Err(io::Error::last_os_error());
    }

    let mut written = 0;
    let success = unsafe {
        WriteProcessMemory(
            process,
            remote_path,
            encoded.as_ptr().cast(),
            size,
            &mut written,
        )
    };

    if success == 0 || written != size {
        unsafe {
            VirtualFreeEx(process, remote_path, 0, MEM_RELEASE);
        }
        return Err(io::Error::last_os_error());
    }

    let thread = unsafe {
        CreateRemoteThread(
            process,
            std::ptr::null_mut(),
            0,
            load_library,
            remote_path,
            0,
            std::ptr::null_mut(),
        )
    };

    if thread == 0 {
        unsafe {
            VirtualFreeEx(process, remote_path, 0, MEM_RELEASE);
        }
        return Err(io::Error::last_os_error());
    }

    let mut exit_code = 0;
    unsafe {
        WaitForSingleObject(thread, WAIT_INFINITE);
        GetExitCodeThread(thread, &mut exit_code);
        CloseHandle(thread);
        VirtualFreeEx(process, remote_path, 0, MEM_RELEASE);
    }

    if exit_code == 0 {
        return Err(io::Error::other(
            "remote LoadLibraryW returned a null module handle",
        ));
    }

    Ok(())
}

#[cfg(not(windows))]
pub fn inject_dll(_process: isize, _dll_path: &Path) -> io::Result<()> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "DLL injection is only supported on Windows",
    ))
}
