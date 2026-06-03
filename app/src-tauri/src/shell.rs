use std::{io, path::Path, process::Command};

pub fn open_path(path: &str) -> io::Result<()> {
    #[cfg(windows)]
    {
        Command::new("explorer")
            .arg(normalize_windows_path(path))
            .spawn()?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg(path).spawn()?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open").arg(path).spawn()?;
    }

    Ok(())
}

pub fn reveal_path(path: &str) -> io::Result<()> {
    #[cfg(windows)]
    {
        let path = normalize_windows_path(path);
        let target = Path::new(&path);

        if target.is_file() {
            Command::new("explorer").args(["/select,", &path]).spawn()?;
        } else {
            Command::new("explorer").arg(path).spawn()?;
        }
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open").args(["-R", path]).spawn()?;
    }

    #[cfg(target_os = "linux")]
    {
        let target = Path::new(path);
        let folder = if target.is_file() {
            target.parent().unwrap_or(target)
        } else {
            target
        };
        Command::new("xdg-open").arg(folder).spawn()?;
    }

    Ok(())
}

#[cfg(windows)]
fn normalize_windows_path(path: &str) -> String {
    path.replace('/', "\\")
}
