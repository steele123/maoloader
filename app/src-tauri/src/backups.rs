//! Settings backups: every plugin's settings and saved data (the client's DataStore) plus which
//! plugins are switched off, as readable JSON files in `<maoloader>/backups`.
//!
//! The League client loads the DataStore when it starts and rewrites the whole file on every
//! change, so a restore while it's open closes the client's UI first, writes, and opens it again.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs, io,
    path::{Path, PathBuf},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use crate::config;

const FORMAT: &str = "maoloader-settings-backup";
const FORMAT_VERSION: u32 = 1;
// The core's DataStore file is XOR'd with this key (dll/src/datastore.rs); it isn't a secret.
const TRANSFORM_KEY: &[u8] = b"A5dgY6lz9fpG9kGNiH1mZ";
const KEEP_AUTOMATIC: usize = 10;
const KEEP_OTHERS: usize = 30;
const AUTOMATIC_EVERY_MS: u64 = 20 * 60 * 60 * 1000;
// Restoring now would cut into a queue, champ select or a game.
const BUSY_PHASES: &[&str] = &["Matchmaking", "ReadyCheck", "ChampSelect", "GameStart", "InProgress", "Reconnect"];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingsBackup {
    pub format: String,
    pub version: u32,
    /// Milliseconds since 1970.
    pub created_at: u64,
    /// "manual", "automatic" or "before-restore".
    pub kind: String,
    pub app_version: String,
    pub datastore: Value,
    pub disabled_plugins: String,
    /// Installed plugin folders when the backup was made, for reference.
    pub plugins: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct BackupSummary {
    pub name: String,
    pub path: String,
    pub created_at: u64,
    pub kind: String,
    /// How many plugin settings and data entries it holds.
    pub entries: usize,
    pub plugins: usize,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct RestoreResult {
    pub restored: BackupSummary,
    /// A copy of the settings from just before the restore, to undo it.
    pub safety_backup: Option<BackupSummary>,
    /// The client was open, so its UI was closed and opened again around the restore.
    pub restarted_client: bool,
}

pub fn backups_dir() -> PathBuf {
    config::base_dir().join("backups")
}

fn datastore_path() -> PathBuf {
    config::base_dir().join("datastore")
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|time| time.as_millis() as u64).unwrap_or(0)
}

fn transform(data: &mut [u8]) {
    for (index, byte) in data.iter_mut().enumerate() {
        *byte ^= TRANSFORM_KEY[index % TRANSFORM_KEY.len()];
    }
}

fn decode_datastore(mut bytes: Vec<u8>) -> io::Result<Value> {
    transform(&mut bytes);
    // Same tolerance as the core: stray NUL bytes are dropped.
    bytes.retain(|byte| *byte != 0);
    let value: Value = serde_json::from_slice(&bytes).map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    if value.is_object() {
        Ok(value)
    } else {
        Err(io::Error::new(io::ErrorKind::InvalidData, "The DataStore isn't a JSON object."))
    }
}

fn encode_datastore(value: &Value) -> io::Result<Vec<u8>> {
    let mut bytes = serde_json::to_vec(value).map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    transform(&mut bytes);
    Ok(bytes)
}

fn read_datastore() -> io::Result<Value> {
    let path = datastore_path();
    if !path.exists() {
        return Ok(Value::Object(Default::default()));
    }
    decode_datastore(fs::read(path)?)
}

// Written next to the real file and moved over it, so a crash can't leave half a DataStore.
fn write_datastore(value: &Value) -> io::Result<()> {
    let path = datastore_path();
    let temporary = path.with_extension("restoring");
    fs::write(&temporary, encode_datastore(value)?)?;
    fs::rename(&temporary, &path)
}

fn installed_plugins() -> Vec<String> {
    let mut names = fs::read_dir(crate::plugins::effective_plugins_dir())
        .map(|entries| {
            entries
                .filter_map(Result::ok)
                .filter(|entry| entry.path().is_dir())
                .map(|entry| entry.file_name().to_string_lossy().into_owned())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    names.sort();
    names
}

fn summary(path: &Path, backup: &SettingsBackup) -> BackupSummary {
    BackupSummary {
        name: path.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_default(),
        path: path.to_string_lossy().into_owned(),
        created_at: backup.created_at,
        kind: backup.kind.clone(),
        entries: backup.datastore.as_object().map(|object| object.len()).unwrap_or(0),
        plugins: backup.plugins.len(),
        size: fs::metadata(path).map(|metadata| metadata.len()).unwrap_or(0),
    }
}

fn parse_backup(content: &str) -> io::Result<SettingsBackup> {
    let backup: SettingsBackup =
        serde_json::from_str(content).map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    if backup.format != FORMAT || backup.version != FORMAT_VERSION || !backup.datastore.is_object() {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "That file isn't a maoloader settings backup."));
    }
    Ok(backup)
}

/// Only plain file names from the backups folder, so a name can't reach anywhere else.
fn backup_path(name: &str) -> io::Result<PathBuf> {
    let valid = name.starts_with("settings-")
        && name.ends_with(".json")
        && name.len() <= 80
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.');
    if !valid || name.contains("..") {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "That isn't a backup name."));
    }
    Ok(backups_dir().join(name))
}

pub fn create_backup(kind: &str) -> io::Result<BackupSummary> {
    let created_at = now_ms();
    let backup = SettingsBackup {
        format: FORMAT.into(),
        version: FORMAT_VERSION,
        created_at,
        kind: kind.into(),
        app_version: env!("CARGO_PKG_VERSION").into(),
        datastore: read_datastore()?,
        disabled_plugins: config::read_config().map(|config| config.app.disabled_plugins).unwrap_or_default(),
        plugins: installed_plugins(),
    };
    fs::create_dir_all(backups_dir())?;
    let path = backups_dir().join(format!("settings-{created_at}-{kind}.json"));
    let content = serde_json::to_string_pretty(&backup).map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    fs::write(&path, content)?;
    prune()?;
    Ok(summary(&path, &backup))
}

fn read_backups() -> Vec<(PathBuf, SettingsBackup)> {
    let mut backups = fs::read_dir(backups_dir())
        .map(|entries| {
            entries
                .filter_map(Result::ok)
                .map(|entry| entry.path())
                .filter(|path| path.extension().is_some_and(|extension| extension == "json"))
                .filter_map(|path| {
                    let backup = parse_backup(&fs::read_to_string(&path).ok()?).ok()?;
                    Some((path, backup))
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    backups.sort_by(|a, b| b.1.created_at.cmp(&a.1.created_at));
    backups
}

pub fn list_backups() -> Vec<BackupSummary> {
    read_backups().iter().map(|(path, backup)| summary(path, backup)).collect()
}

// Keeps the newest automatic backups and the newest of the rest; older ones are deleted.
fn prune() -> io::Result<()> {
    let backups = read_backups();
    let (automatic, others): (Vec<_>, Vec<_>) = backups.iter().partition(|(_, backup)| backup.kind == "automatic");
    for (path, _) in automatic.iter().skip(KEEP_AUTOMATIC).chain(others.iter().skip(KEEP_OTHERS)) {
        fs::remove_file(path)?;
    }
    Ok(())
}

pub fn delete_backup(name: &str) -> io::Result<()> {
    fs::remove_file(backup_path(name)?)
}

/// Run when the app starts: a backup when the settings changed since the newest one and that
/// one is more than 20 hours old.
pub fn automatic_backup_if_due() -> io::Result<Option<BackupSummary>> {
    let current = read_datastore()?;
    if current.as_object().is_none_or(|object| object.is_empty()) {
        return Ok(None);
    }
    let backups = read_backups();
    if let Some((_, newest)) = backups.first() {
        if newest.datastore == current || now_ms().saturating_sub(newest.created_at) < AUTOMATIC_EVERY_MS {
            return Ok(None);
        }
    }
    create_backup("automatic").map(Some)
}

pub fn restore_backup(name: &str) -> Result<RestoreResult, String> {
    let path = backup_path(name).map_err(|error| error.to_string())?;
    let content = fs::read_to_string(&path).map_err(|_| "That backup no longer exists.".to_string())?;
    let backup = parse_backup(&content).map_err(|error| error.to_string())?;

    let client = lcu::Client::connect();
    if let Some(client) = &client {
        if let Some(phase) = client.phase().filter(|phase| BUSY_PHASES.contains(&phase.as_str())) {
            return Err(format!(
                "League is in {phase}. Restore once you're back in the lobby or on home, so it doesn't interrupt your game."
            ));
        }
    }

    let safety_backup = create_backup("before-restore").ok();

    let restarted_client = match &client {
        Some(client) => {
            client.post("/riotclient/kill-ux");
            // Give the client's UI time to close before its settings file changes under it.
            thread::sleep(Duration::from_millis(2500));
            write_restore(&backup)?;
            client.post("/riotclient/launch-ux");
            true
        }
        None => {
            write_restore(&backup)?;
            false
        }
    };

    Ok(RestoreResult { restored: summary(&path, &backup), safety_backup, restarted_client })
}

fn write_restore(backup: &SettingsBackup) -> Result<(), String> {
    write_datastore(&backup.datastore).map_err(|error| format!("Couldn't write the settings: {error}"))?;
    let mut loader_config = config::read_config().map_err(|error| error.to_string())?;
    loader_config.app.disabled_plugins = backup.disabled_plugins.clone();
    config::write_config(&loader_config).map_err(|error| error.to_string())
}

/// Just enough of the League client's local API to close and reopen its UI: the address and
/// password come from the lockfile it writes in its folder while it's running.
mod lcu {
    use std::{fs, time::Duration};

    pub struct Client {
        http: reqwest::blocking::Client,
        base: String,
        password: String,
    }

    impl Client {
        pub fn connect() -> Option<Self> {
            Self::connect_at(&crate::config::league_dir()?)
        }

        pub fn connect_at(league_dir: &std::path::Path) -> Option<Self> {
            let lockfile = fs::read_to_string(league_dir.join("lockfile")).ok()?;
            let (port, password) = super::parse_lockfile(&lockfile)?;
            let http = reqwest::blocking::Client::builder()
                // The client's local API uses a self-signed certificate, and only on 127.0.0.1.
                .danger_accept_invalid_certs(true)
                .timeout(Duration::from_secs(5))
                .build()
                .ok()?;
            let client = Self { http, base: format!("https://127.0.0.1:{port}"), password };
            // A stale lockfile (the client crashed) has nothing listening behind it.
            client.phase().map(|_| client)
        }

        pub fn phase(&self) -> Option<String> {
            self.http
                .get(format!("{}/lol-gameflow/v1/gameflow-phase", self.base))
                .basic_auth("riot", Some(&self.password))
                .send()
                .ok()?
                .json::<String>()
                .ok()
        }

        pub fn post(&self, path: &str) {
            let _ = self.http.post(format!("{}{path}", self.base)).basic_auth("riot", Some(&self.password)).send();
        }
    }
}

/// `LeagueClient:<pid>:<port>:<password>:https` → (port, password).
fn parse_lockfile(content: &str) -> Option<(u16, String)> {
    let parts = content.trim().split(':').collect::<Vec<_>>();
    if parts.len() < 5 {
        return None;
    }
    let port = parts[2].parse::<u16>().ok()?;
    let password = parts[3].to_string();
    (!password.is_empty()).then_some((port, password))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn datastore_encoding_round_trips_with_the_cores_format() {
        let value = serde_json::json!({ "steeles-ui.settings": { "theme": { "accent": "#ededed" } }, "n": 3 });
        let encoded = encode_datastore(&value).unwrap();
        assert_ne!(encoded, serde_json::to_vec(&value).unwrap());
        assert_eq!(decode_datastore(encoded).unwrap(), value);
    }

    #[test]
    fn decoding_drops_stray_nul_bytes_and_rejects_non_objects() {
        let mut bytes = b"{\"a\":1}\0\0".to_vec();
        transform(&mut bytes);
        assert_eq!(decode_datastore(bytes).unwrap(), serde_json::json!({ "a": 1 }));

        let mut list = b"[1,2]".to_vec();
        transform(&mut list);
        assert!(decode_datastore(list).is_err());
    }

    #[test]
    fn only_backup_file_names_are_accepted() {
        assert!(backup_path("settings-1792147101152-manual.json").is_ok());
        for bad in ["../config", "settings-1.json/../../x.json", "settings-..json", "other.json", "settings-1\\x.json", "settings-1"] {
            assert!(backup_path(bad).is_err(), "{bad} should be refused");
        }
    }

    #[test]
    fn backups_need_the_right_format() {
        let good = serde_json::json!({
            "format": FORMAT, "version": 1, "created_at": 1, "kind": "manual", "app_version": "0.1.8",
            "datastore": {}, "disabled_plugins": "", "plugins": []
        });
        assert!(parse_backup(&good.to_string()).is_ok());
        let mut wrong = good.clone();
        wrong["format"] = "something-else".into();
        assert!(parse_backup(&wrong.to_string()).is_err());
        let mut newer = good;
        newer["version"] = 2.into();
        assert!(parse_backup(&newer.to_string()).is_err());
    }

    // Read-only checks against a real install: cargo test backups -- --ignored
    #[test]
    #[ignore]
    fn reads_the_real_datastore() {
        let path = std::path::PathBuf::from(std::env::var("LOCALAPPDATA").unwrap()).join("maoloader").join("datastore");
        let value = decode_datastore(fs::read(path).unwrap()).unwrap();
        let keys = value.as_object().unwrap().keys().cloned().collect::<Vec<_>>();
        println!("{} entries, e.g. {:?}", keys.len(), &keys[..keys.len().min(5)]);
        assert!(!keys.is_empty());
        // Encoding it again gives back a file the core reads the same way.
        assert_eq!(decode_datastore(encode_datastore(&value).unwrap()).unwrap(), value);
    }

    #[test]
    #[ignore]
    fn reads_the_running_clients_phase() {
        let client = lcu::Client::connect_at(std::path::Path::new("C:/Riot Games/League of Legends")).expect("League client running");
        println!("phase: {:?}", client.phase());
        assert!(client.phase().is_some());
    }

    #[test]
    fn lockfile_gives_port_and_password() {
        assert_eq!(parse_lockfile("LeagueClient:1234:60578:s3cret:https\n"), Some((60578, "s3cret".into())));
        assert_eq!(parse_lockfile("LeagueClient:1234:notaport:s3cret:https"), None);
        assert_eq!(parse_lockfile("garbage"), None);
    }
}
