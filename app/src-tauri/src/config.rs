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
            app: AppConfig::default(),
            client: ClientConfig::default(),
        }
    }
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            language: "en".into(),
            plugins_dir: String::new(),
            league_dir: String::new(),
            disabled_plugins: String::new(),
            activation_mode: "universal".into(),
        }
    }
}

impl Default for ClientConfig {
    fn default() -> Self {
        Self {
            use_hotkeys: true,
            optimized_client: true,
            silent_mode: false,
            super_potato: false,
            insecure_mode: false,
            use_devtools: false,
            use_riotclient: false,
            use_proxy: false,
            debug_port: 0,
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
    parse_config(&content).map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))
}

pub fn write_config(config: &LoaderConfig) -> io::Result<()> {
    fs::create_dir_all(base_dir())?;
    fs::write(config_path(), serialize_config(config))
}

fn parse_config(content: &str) -> Result<LoaderConfig, toml::de::Error> {
    toml::from_str::<TomlLoaderConfig>(content).map(TomlLoaderConfig::into_loader_config)
}

fn serialize_config(config: &LoaderConfig) -> String {
    toml::to_string_pretty(&SerializableLoaderConfig::from(config))
        .expect("loader config should serialize as TOML")
}

fn path_string(path: PathBuf) -> String {
    path.display().to_string()
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
    language: Option<String>,
    plugins_dir: Option<String>,
    league_dir: Option<String>,
    disabled_plugins: Option<String>,
    activation_mode: Option<String>,
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
    fn into_loader_config(self) -> LoaderConfig {
        let mut config = LoaderConfig::default();

        if let Some(value) = self.app.language {
            config.app.language = value;
        }
        if let Some(value) = self.app.plugins_dir {
            config.app.plugins_dir = value;
        }
        if let Some(value) = self.app.league_dir {
            config.app.league_dir = value;
        }
        if let Some(value) = self.app.disabled_plugins {
            config.app.disabled_plugins = value;
        }
        if let Some(value) = self.app.activation_mode {
            config.app.activation_mode = value;
        }

        if let Some(value) = self.client.use_hotkeys {
            config.client.use_hotkeys = value;
        }
        if let Some(value) = self.client.optimized_client {
            config.client.optimized_client = value;
        }
        if let Some(value) = self.client.silent_mode {
            config.client.silent_mode = value;
        }
        if let Some(value) = self.client.super_potato {
            config.client.super_potato = value;
        }
        if let Some(value) = self.client.isecure_mode.or(self.client.insecure_mode) {
            config.client.insecure_mode = value;
        }
        if let Some(value) = self.client.use_devtools {
            config.client.use_devtools = value;
        }
        if let Some(value) = self.client.use_riotclient {
            config.client.use_riotclient = value;
        }
        if let Some(value) = self.client.use_proxy {
            config.client.use_proxy = value;
        }
        if let Some(value) = self.client.debug_port.filter(|port| *port < u16::MAX) {
            config.client.debug_port = value;
        }

        config
    }
}

#[derive(Serialize)]
struct SerializableLoaderConfig<'a> {
    app: SerializableAppConfig<'a>,
    client: SerializableClientConfig,
}

#[derive(Serialize)]
struct SerializableAppConfig<'a> {
    language: &'a str,
    plugins_dir: &'a str,
    league_dir: &'a str,
    disabled_plugins: &'a str,
    activation_mode: &'a str,
}

#[derive(Serialize)]
struct SerializableClientConfig {
    use_hotkeys: bool,
    optimized_client: bool,
    silent_mode: bool,
    super_potato: bool,
    isecure_mode: bool,
    insecure_mode: bool,
    use_devtools: bool,
    use_riotclient: bool,
    use_proxy: bool,
    debug_port: u16,
}

impl<'a> From<&'a LoaderConfig> for SerializableLoaderConfig<'a> {
    fn from(config: &'a LoaderConfig) -> Self {
        Self {
            app: SerializableAppConfig {
                language: &config.app.language,
                plugins_dir: &config.app.plugins_dir,
                league_dir: &config.app.league_dir,
                disabled_plugins: &config.app.disabled_plugins,
                activation_mode: &config.app.activation_mode,
            },
            client: SerializableClientConfig {
                use_hotkeys: config.client.use_hotkeys,
                optimized_client: config.client.optimized_client,
                silent_mode: config.client.silent_mode,
                super_potato: config.client.super_potato,
                isecure_mode: config.client.insecure_mode,
                insecure_mode: config.client.insecure_mode,
                use_devtools: config.client.use_devtools,
                use_riotclient: config.client.use_riotclient,
                use_proxy: config.client.use_proxy,
                debug_port: config.client.debug_port,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalid_bool_values_are_invalid_toml() {
        assert!(parse_config(
            "\
[client]
use_hotkeys = maybe
",
        )
        .is_err());
    }

    #[test]
    fn numeric_bool_values_are_invalid_toml() {
        assert!(parse_config(
            "\
[client]
optimized_client = 0
",
        )
        .is_err());
    }

    #[test]
    fn invalid_debug_port_keeps_default_value() {
        let config = parse_config(
            "\
[client]
debug_port = 65535
",
        )
        .expect("valid TOML");

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

    #[test]
    fn serialized_config_is_valid_toml() {
        let mut config = LoaderConfig::default();
        config.app.league_dir = r"C:\Riot Games\League of Legends".into();

        let serialized = serialize_config(&config);
        assert!(serialized.contains("language = \"en\""));

        let parsed = parse_config(&serialized).expect("serialized config should parse");
        assert_eq!(parsed.app.league_dir, config.app.league_dir);
    }

    #[test]
    fn toml_parser_accepts_quoted_paths() {
        let config = parse_config(
            r#"
[app]
language = "en"
plugins_dir = "C:\\maoloader\\plugins"
league_dir = "C:\\Riot Games\\League of Legends"

[client]
isecure_mode = true
debug_port = 2999
"#,
        )
        .expect("valid TOML config");

        assert_eq!(config.app.plugins_dir, r"C:\maoloader\plugins");
        assert_eq!(config.app.league_dir, r"C:\Riot Games\League of Legends");
        assert!(config.client.insecure_mode);
        assert_eq!(config.client.debug_port, 2999);
    }
}
