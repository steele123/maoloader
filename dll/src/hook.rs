use std::ffi::c_void;

#[cfg(windows)]
const PATCH_SIZE: usize = 12;

#[cfg(windows)]
#[derive(Debug)]
pub struct InlineHook {
    target: *mut u8,
    original: [u8; PATCH_SIZE],
    replacement: usize,
    installed: bool,
}

#[cfg(windows)]
impl InlineHook {
    pub unsafe fn install(
        target: *mut c_void,
        replacement: *const c_void,
    ) -> std::io::Result<Self> {
        let target = target.cast::<u8>();
        let mut original = [0_u8; PATCH_SIZE];

        unsafe {
            std::ptr::copy_nonoverlapping(target, original.as_mut_ptr(), PATCH_SIZE);
            write_jump(target, replacement as usize)?;
        }

        Ok(Self {
            target,
            original,
            replacement: replacement as usize,
            installed: true,
        })
    }

    pub unsafe fn call_original<F, R>(&mut self, call: F) -> R
    where
        F: FnOnce(*mut c_void) -> R,
    {
        unsafe {
            self.restore()
                .expect("failed to restore hook before calling original");
        }

        let result = call(self.target.cast());

        unsafe {
            self.install_jump()
                .expect("failed to reinstall hook after calling original");
        }

        result
    }

    pub unsafe fn restore(&mut self) -> std::io::Result<()> {
        if self.installed {
            unsafe {
                write_memory(self.target, self.original.as_ptr(), PATCH_SIZE)?;
            }
            self.installed = false;
        }

        Ok(())
    }

    unsafe fn install_jump(&mut self) -> std::io::Result<()> {
        if !self.installed {
            unsafe {
                write_jump(self.target, self.replacement)?;
            }
            self.installed = true;
        }

        Ok(())
    }
}

#[cfg(windows)]
impl Drop for InlineHook {
    fn drop(&mut self) {
        let _ = unsafe { self.restore() };
    }
}

#[cfg(windows)]
unsafe fn write_jump(target: *mut u8, address: usize) -> std::io::Result<()> {
    let patch = x64_jump_patch(address);

    unsafe { write_memory(target, patch.as_ptr(), PATCH_SIZE) }
}

#[cfg(windows)]
unsafe fn write_memory(target: *mut u8, source: *const u8, size: usize) -> std::io::Result<()> {
    const PAGE_EXECUTE_READWRITE: u32 = 0x40;

    unsafe extern "system" {
        fn VirtualProtect(address: *mut c_void, size: usize, protect: u32, old: *mut u32) -> i32;
        fn FlushInstructionCache(process: isize, address: *const c_void, size: usize) -> i32;
        fn GetCurrentProcess() -> isize;
    }

    let mut old = 0;
    let success = unsafe { VirtualProtect(target.cast(), size, PAGE_EXECUTE_READWRITE, &mut old) };
    if success == 0 {
        return Err(std::io::Error::last_os_error());
    }

    unsafe {
        std::ptr::copy_nonoverlapping(source, target, size);
        FlushInstructionCache(GetCurrentProcess(), target.cast_const().cast(), size);
    }

    let mut ignored = 0;
    let success = unsafe { VirtualProtect(target.cast(), size, old, &mut ignored) };
    if success == 0 {
        return Err(std::io::Error::last_os_error());
    }

    Ok(())
}

#[cfg(not(windows))]
#[derive(Debug)]
pub struct InlineHook;

#[cfg(not(windows))]
impl InlineHook {
    pub unsafe fn install(
        _target: *mut c_void,
        _replacement: *const c_void,
    ) -> std::io::Result<Self> {
        Err(std::io::Error::new(
            std::io::ErrorKind::Unsupported,
            "inline hooks are only supported on Windows",
        ))
    }

    pub unsafe fn call_original<F, R>(&mut self, call: F) -> R
    where
        F: FnOnce(*mut c_void) -> R,
    {
        call(std::ptr::null_mut())
    }
}

pub fn x64_jump_patch(address: usize) -> [u8; 12] {
    let mut patch = [0_u8; 12];

    patch[0] = 0x48;
    patch[1] = 0xb8;
    patch[2..10].copy_from_slice(&address.to_le_bytes());
    patch[10] = 0x50;
    patch[11] = 0xc3;

    patch
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn x64_patch_matches_upstream_shellcode_shape() {
        let patch = x64_jump_patch(0x1122_3344_5566_7788);

        assert_eq!(patch[0], 0x48);
        assert_eq!(patch[1], 0xb8);
        assert_eq!(&patch[2..10], &0x1122_3344_5566_7788_usize.to_le_bytes());
        assert_eq!(patch[10], 0x50);
        assert_eq!(patch[11], 0xc3);
    }
}
