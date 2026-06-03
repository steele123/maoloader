use crate::{config, plugins};
use serde::Serialize;
use std::{fs, io, path::PathBuf};

const PRELOAD_JS: &str = include_str!("../runtime/preload.js");

#[derive(Debug, Clone, Serialize)]
pub struct RuntimeStatus {
    pub runtime_dir: String,
    pub preload_path: String,
    pub preload_exists: bool,
    pub plugin_count: usize,
}

pub fn status() -> RuntimeStatus {
    let runtime_dir = runtime_dir();
    let preload_path = preload_path();
    let plugin_count = plugins::list_plugins()
        .map(|plugins| plugins.len())
        .unwrap_or(0);

    RuntimeStatus {
        runtime_dir: runtime_dir.display().to_string(),
        preload_path: preload_path.display().to_string(),
        preload_exists: preload_path.exists(),
        plugin_count,
    }
}

pub fn sync_assets() -> io::Result<RuntimeStatus> {
    fs::create_dir_all(runtime_dir())?;
    fs::write(preload_path(), PRELOAD_JS)?;
    Ok(status())
}

fn runtime_dir() -> PathBuf {
    config::base_dir().join("runtime")
}

fn preload_path() -> PathBuf {
    runtime_dir().join("preload.js")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sync_assets_writes_preload_to_runtime_dir() {
        let status = sync_assets().unwrap();

        assert!(status.preload_exists);
        assert!(std::fs::metadata(&status.preload_path).unwrap().is_file());
        assert!(std::fs::read_to_string(&status.preload_path)
            .unwrap()
            .contains("window.DataStore"));
    }
}
