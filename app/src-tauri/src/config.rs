use serde::{Deserialize, Serialize};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, Serialize)]
pub struct LoaderPaths {
    pub base_dir: String,
    pub config_path: String,
    pub core_path: String,
    pub plugins_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoaderConfig {
    pub app: AppConfig,
    pub client: ClientConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub language: String,
    pub plugins_dir: String,
    pub league_dir: String,
    pub disabled_plugins: String,
    pub activation_mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientConfig {
    pub use_hotkeys: bool,
    pub optimized_client: bool,
    pub silent_mode: bool,
    pub super_potato: bool,
    pub insecure_mode: bool,
    pub use_devtools: bool,
    pub use_riotclient: bool,
    pub use_proxy: bool,
    pub debug_port: u16,
}

impl Default for LoaderConfig {
    fn default() -> Self {
        Self {
            app: AppConfig {
                language: "en".into(),
                plugins_dir: String::new(),
                league_dir: String::new(),
                disabled_plugins: String::new(),
                activation_mode: "universal".into(),
            },
            client: ClientConfig {
                use_hotkeys: true,
                optimized_client: true,
                silent_mode: false,
                super_potato: false,
                insecure_mode: false,
                use_devtools: false,
                use_riotclient: false,
                use_proxy: false,
                debug_port: 0,
            },
        }
    }
}

pub fn base_dir() -> PathBuf {
    let exe = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("."));
    let dir = exe.parent().unwrap_or_else(|| Path::new("."));

    if cfg!(debug_assertions) {
        return dir
            .parent()
            .and_then(Path::parent)
            .and_then(Path::parent)
            .map(|path| path.join("bin"))
            .unwrap_or_else(|| dir.join("bin"));
    }

    dir.to_path_buf()
}

pub fn config_path() -> PathBuf {
    base_dir().join("config")
}

pub fn core_path() -> PathBuf {
    let mut path = base_dir().join("core");

    #[cfg(windows)]
    path.set_extension("dll");

    #[cfg(target_os = "macos")]
    path.set_extension("dylib");

    #[cfg(not(any(windows, target_os = "macos")))]
    path.set_extension("so");

    path
}

pub fn plugins_dir() -> PathBuf {
    base_dir().join("plugins")
}

pub fn league_dir() -> Option<PathBuf> {
    read_config()
        .ok()
        .map(|config| config.app.league_dir)
        .filter(|path| !path.trim().is_empty())
        .map(PathBuf::from)
}

pub fn loader_paths() -> LoaderPaths {
    LoaderPaths {
        base_dir: path_string(base_dir()),
        config_path: path_string(config_path()),
        core_path: path_string(core_path()),
        plugins_dir: path_string(plugins_dir()),
    }
}

pub fn core_exists() -> bool {
    core_path().exists()
}

pub fn ensure_base_layout() -> io::Result<LoaderPaths> {
    fs::create_dir_all(base_dir())?;
    fs::create_dir_all(plugins_dir())?;

    let path = config_path();
    if !path.exists() {
        write_config(&LoaderConfig::default())?;
    }

    Ok(loader_paths())
}

pub fn read_config() -> io::Result<LoaderConfig> {
    let path = config_path();

    if !path.exists() {
        return Ok(LoaderConfig::default());
    }

    let content = fs::read_to_string(path)?;
    Ok(parse_config(&content))
}

pub fn write_config(config: &LoaderConfig) -> io::Result<()> {
    fs::create_dir_all(base_dir())?;
    fs::write(config_path(), serialize_config(config))
}

fn parse_config(content: &str) -> LoaderConfig {
    let mut config = LoaderConfig::default();
    let mut section = String::new();

    for line in content.lines() {
        let line = line.trim();

        if line.is_empty() || line.starts_with('#') || line.starts_with(';') {
            continue;
        }

        if let Some(name) = line
            .strip_prefix('[')
            .and_then(|line| line.strip_suffix(']'))
        {
            section = name.trim().to_ascii_lowercase();
            continue;
        }

        let Some((key, value)) = line.split_once('=') else {
            continue;
        };

        let key = key.trim();
        let value = value.trim();

        match (section.as_str(), key) {
            ("app", "language") => config.app.language = value.into(),
            ("app", "plugins_dir") => config.app.plugins_dir = value.into(),
            ("app", "league_dir") => config.app.league_dir = value.into(),
            ("app", "disabled_plugins") => config.app.disabled_plugins = value.into(),
            ("app", "activation_mode") => config.app.activation_mode = value.into(),
            ("client", "use_hotkeys") => {
                config.client.use_hotkeys = parse_bool(value).unwrap_or(config.client.use_hotkeys)
            }
            ("client", "optimized_client") => {
                config.client.optimized_client =
                    parse_bool(value).unwrap_or(config.client.optimized_client)
            }
            ("client", "silent_mode") => {
                config.client.silent_mode = parse_bool(value).unwrap_or(config.client.silent_mode)
            }
            ("client", "super_potato") => {
                config.client.super_potato = parse_bool(value).unwrap_or(config.client.super_potato)
            }
            ("client", "insecure_mode" | "isecure_mode") => {
                config.client.insecure_mode =
                    parse_bool(value).unwrap_or(config.client.insecure_mode)
            }
            ("client", "use_devtools") => {
                config.client.use_devtools = parse_bool(value).unwrap_or(config.client.use_devtools)
            }
            ("client", "use_riotclient") => {
                config.client.use_riotclient =
                    parse_bool(value).unwrap_or(config.client.use_riotclient)
            }
            ("client", "use_proxy") => {
                config.client.use_proxy = parse_bool(value).unwrap_or(config.client.use_proxy)
            }
            ("client", "debug_port") => {
                config.client.debug_port =
                    parse_debug_port(value).unwrap_or(config.client.debug_port)
            }
            _ => {}
        }
    }

    config
}

fn serialize_config(config: &LoaderConfig) -> String {
    format!(
        "\
[app]
language = {language}
plugins_dir = {plugins_dir}
league_dir = {league_dir}
disabled_plugins = {disabled_plugins}
activation_mode = {activation_mode}

[client]
use_hotkeys = {use_hotkeys}
optimized_client = {optimized_client}
silent_mode = {silent_mode}
super_potato = {super_potato}
isecure_mode = {insecure_mode}
insecure_mode = {insecure_mode}
use_devtools = {use_devtools}
use_riotclient = {use_riotclient}
use_proxy = {use_proxy}
debug_port = {debug_port}
",
        language = config.app.language,
        plugins_dir = config.app.plugins_dir,
        league_dir = config.app.league_dir,
        disabled_plugins = config.app.disabled_plugins,
        activation_mode = config.app.activation_mode,
        use_hotkeys = config.client.use_hotkeys,
        optimized_client = config.client.optimized_client,
        silent_mode = config.client.silent_mode,
        super_potato = config.client.super_potato,
        insecure_mode = config.client.insecure_mode,
        use_devtools = config.client.use_devtools,
        use_riotclient = config.client.use_riotclient,
        use_proxy = config.client.use_proxy,
        debug_port = config.client.debug_port,
    )
}

fn parse_bool(value: &str) -> Option<bool> {
    match value.trim().to_ascii_lowercase().as_str() {
        "1" | "true" => Some(true),
        "0" | "false" => Some(false),
        _ => None,
    }
}

fn parse_debug_port(value: &str) -> Option<u16> {
    let port = value.trim().parse::<u16>().ok()?;
    if port < u16::MAX {
        Some(port)
    } else {
        None
    }
}

fn path_string(path: PathBuf) -> String {
    path.display().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalid_bool_values_keep_default_config_values() {
        let config = parse_config(
            "\
[client]
use_hotkeys = maybe
optimized_client = 0
silent_mode = true
super_potato = yes
isecure_mode = true
debug_port = 9222
",
        );

        assert!(config.client.use_hotkeys);
        assert!(!config.client.optimized_client);
        assert!(config.client.silent_mode);
        assert!(!config.client.super_potato);
        assert!(config.client.insecure_mode);
        assert_eq!(config.client.debug_port, 9222);
    }

    #[test]
    fn invalid_debug_port_keeps_default_value() {
        let config = parse_config(
            "\
[client]
debug_port = 65535
",
        );

        assert_eq!(config.client.debug_port, 0);
    }

    #[test]
    fn serialized_config_includes_debug_port() {
        let mut config = LoaderConfig::default();
        config.client.debug_port = 2999;

        assert!(serialize_config(&config).contains("debug_port = 2999"));
    }

    #[test]
    fn serialized_config_includes_upstream_isecure_alias() {
        let mut config = LoaderConfig::default();
        config.client.insecure_mode = true;
        let serialized = serialize_config(&config);

        assert!(serialized.contains("isecure_mode = true"));
        assert!(serialized.contains("insecure_mode = true"));
    }
}
