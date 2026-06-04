use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::OnceLock,
};

use serde::Deserialize;

#[cfg(windows)]
static MODULE_HANDLE: OnceLock<isize> = OnceLock::new();

#[cfg(windows)]
pub fn set_module_handle(handle: isize) {
    let _ = MODULE_HANDLE.set(handle);
}

pub fn loader_dir() -> PathBuf {
    #[cfg(windows)]
    {
        if let Some(path) = module_path() {
            return path
                .parent()
                .map(Path::to_path_buf)
                .unwrap_or_else(|| PathBuf::from("."));
        }
    }

    std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| PathBuf::from("."))
}

pub fn config_path() -> PathBuf {
    loader_dir().join("config")
}

pub fn core_path() -> PathBuf {
    let mut path = loader_dir().join("core");

    #[cfg(windows)]
    path.set_extension("dll");

    #[cfg(not(windows))]
    path.set_extension("so");

    path
}

pub fn plugins_dir() -> PathBuf {
    let config = read_config_map();

    configured_plugins_dir(config.get("plugins_dir").map(String::as_str))
}

fn configured_plugins_dir(value: Option<&str>) -> PathBuf {
    value
        .filter(|path| {
            let path = path.trim();
            !path.is_empty() && !path.starts_with('.')
        })
        .map(|path| PathBuf::from(path.trim()))
        .unwrap_or_else(|| loader_dir().join("plugins"))
}

pub fn cache_dir() -> PathBuf {
    #[cfg(windows)]
    {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            return PathBuf::from(local_app_data)
                .join("Riot Games")
                .join("League of Legends")
                .join("Cache");
        }
    }

    loader_dir().join("Cache")
}

pub fn disabled_plugins() -> String {
    read_config_map()
        .get("disabled_plugins")
        .cloned()
        .unwrap_or_default()
}

pub fn option_int(key: &str, fallback: i32) -> i32 {
    read_config_map()
        .get(key)
        .and_then(|value| value.trim().parse().ok())
        .unwrap_or(fallback)
}

pub fn option_bool(key: &str, fallback: bool) -> bool {
    read_config_map()
        .get(key)
        .and_then(|value| parse_bool(value))
        .unwrap_or(fallback)
}

pub fn option_bool_alias(primary: &str, alias: &str, fallback: bool) -> bool {
    let config = read_config_map();
    option_bool_alias_from_map(&config, primary, alias, fallback)
}

fn option_bool_alias_from_map(
    config: &HashMap<String, String>,
    primary: &str,
    alias: &str,
    fallback: bool,
) -> bool {
    config
        .get(primary)
        .or_else(|| config.get(alias))
        .and_then(|value| parse_bool(value))
        .unwrap_or(fallback)
}

fn parse_bool(value: &str) -> Option<bool> {
    match value.trim().to_ascii_lowercase().as_str() {
        "1" | "true" => Some(true),
        "0" | "false" => Some(false),
        _ => None,
    }
}

fn read_config_map() -> HashMap<String, String> {
    let Ok(content) = fs::read_to_string(config_path()) else {
        return HashMap::new();
    };

    read_toml_config_map(&content)
}

fn read_toml_config_map(content: &str) -> HashMap<String, String> {
    toml::from_str::<TomlLoaderConfig>(content)
        .map(TomlLoaderConfig::into_map)
        .unwrap_or_default()
}

#[derive(Debug, Default, Deserialize)]
struct TomlLoaderConfig {
    #[serde(default)]
    app: TomlAppConfig,
    #[serde(default)]
    client: TomlClientConfig,
}

#[derive(Debug, Default, Deserialize)]
struct TomlAppConfig {
    plugins_dir: Option<String>,
    disabled_plugins: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct TomlClientConfig {
    use_hotkeys: Option<bool>,
    optimized_client: Option<bool>,
    silent_mode: Option<bool>,
    super_potato: Option<bool>,
    isecure_mode: Option<bool>,
    insecure_mode: Option<bool>,
    use_devtools: Option<bool>,
    use_riotclient: Option<bool>,
    use_proxy: Option<bool>,
    debug_port: Option<u16>,
}

impl TomlLoaderConfig {
    fn into_map(self) -> HashMap<String, String> {
        let mut map = HashMap::new();

        if let Some(value) = self.app.plugins_dir {
            map.insert("plugins_dir".into(), value);
        }
        if let Some(value) = self.app.disabled_plugins {
            map.insert("disabled_plugins".into(), value);
        }

        insert_bool(&mut map, "use_hotkeys", self.client.use_hotkeys);
        insert_bool(&mut map, "optimized_client", self.client.optimized_client);
        insert_bool(&mut map, "silent_mode", self.client.silent_mode);
        insert_bool(&mut map, "super_potato", self.client.super_potato);
        insert_bool(&mut map, "isecure_mode", self.client.isecure_mode);
        insert_bool(&mut map, "insecure_mode", self.client.insecure_mode);
        insert_bool(&mut map, "use_devtools", self.client.use_devtools);
        insert_bool(&mut map, "use_riotclient", self.client.use_riotclient);
        insert_bool(&mut map, "use_proxy", self.client.use_proxy);

        if let Some(value) = self.client.debug_port {
            map.insert("debug_port".into(), value.to_string());
        }

        map
    }
}

fn insert_bool(map: &mut HashMap<String, String>, key: &str, value: Option<bool>) {
    if let Some(value) = value {
        map.insert(key.into(), value.to_string());
    }
}

#[cfg(windows)]
fn module_path() -> Option<PathBuf> {
    let handle = *MODULE_HANDLE.get()?;
    let mut buffer = [0_u16; 2048];

    unsafe extern "system" {
        fn GetModuleFileNameW(module: isize, filename: *mut u16, size: u32) -> u32;
    }

    let length = unsafe { GetModuleFileNameW(handle, buffer.as_mut_ptr(), buffer.len() as u32) };

    if length == 0 {
        None
    } else {
        Some(PathBuf::from(String::from_utf16_lossy(
            &buffer[..length as usize],
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bool_parser_preserves_fallback_for_unknown_values() {
        assert_eq!(parse_bool("true"), Some(true));
        assert_eq!(parse_bool("1"), Some(true));
        assert_eq!(parse_bool("false"), Some(false));
        assert_eq!(parse_bool("0"), Some(false));
        assert_eq!(parse_bool("yes"), None);
        assert_eq!(parse_bool(""), None);
    }

    #[test]
    fn bool_alias_prefers_upstream_key_when_both_are_present() {
        let config = HashMap::from([
            ("isecure_mode".to_string(), "true".to_string()),
            ("insecure_mode".to_string(), "false".to_string()),
        ]);

        assert!(option_bool_alias_from_map(
            &config,
            "isecure_mode",
            "insecure_mode",
            false
        ));

        let config = HashMap::from([("insecure_mode".to_string(), "true".to_string())]);
        assert!(option_bool_alias_from_map(
            &config,
            "isecure_mode",
            "insecure_mode",
            false
        ));
    }

    #[test]
    fn plugin_dir_matches_loader_default_for_empty_or_dot_relative_values() {
        assert_eq!(configured_plugins_dir(None), loader_dir().join("plugins"));
        assert_eq!(
            configured_plugins_dir(Some("")),
            loader_dir().join("plugins")
        );
        assert_eq!(
            configured_plugins_dir(Some("./plugins")),
            loader_dir().join("plugins")
        );
        assert_eq!(
            configured_plugins_dir(Some(".\\plugins")),
            loader_dir().join("plugins")
        );

        let custom = std::env::temp_dir().join("maoloader-runtime-plugins");
        assert_eq!(
            configured_plugins_dir(Some(&custom.display().to_string())),
            custom
        );
    }

    #[test]
    fn toml_config_map_unquotes_strings_and_reads_sections() {
        let config = read_toml_config_map(
            r#"
[app]
plugins_dir = "C:\\maoloader\\plugins"
disabled_plugins = "one,two"

[client]
isecure_mode = true
debug_port = 2999
"#,
        );

        assert_eq!(
            config.get("plugins_dir").map(String::as_str),
            Some(r"C:\maoloader\plugins")
        );
        assert_eq!(
            config.get("disabled_plugins").map(String::as_str),
            Some("one,two")
        );
        assert_eq!(config.get("isecure_mode").map(String::as_str), Some("true"));
        assert_eq!(config.get("debug_port").map(String::as_str), Some("2999"));
    }

    #[test]
    fn invalid_toml_config_map_uses_empty_config() {
        let config = read_toml_config_map(
            r#"
[app]
plugins_dir = C:\maoloader\plugins

[client]
isecure_mode = true
"#,
        );

        assert!(config.is_empty());
    }
}
