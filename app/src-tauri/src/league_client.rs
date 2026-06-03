use serde::Deserialize;
use std::{
    collections::BTreeMap,
    fs, io,
    path::{Path, PathBuf},
};

const LEAGUE_CLIENT_UX: &str = "LeagueClientUx.exe";

#[derive(Debug, Deserialize)]
struct RiotClientInstalls {
    #[serde(default)]
    associated_client: BTreeMap<String, serde_json::Value>,
    #[serde(default)]
    rc_default: String,
    #[serde(default)]
    rc_live: String,
}

pub fn validate_dir(path: impl AsRef<Path>) -> bool {
    let path = path.as_ref();
    !path.as_os_str().is_empty() && path.join(LEAGUE_CLIENT_UX).is_file()
}

pub fn find_league_path() -> io::Result<Option<PathBuf>> {
    find_league_path_from_manifest_path(default_manifest_path())
}

fn find_league_path_from_manifest_path(manifest_path: PathBuf) -> io::Result<Option<PathBuf>> {
    if !manifest_path.is_file() {
        return Ok(None);
    }

    let content = fs::read_to_string(manifest_path)?;
    let installs = serde_json::from_str::<RiotClientInstalls>(&content)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;

    Ok(find_league_path_from_installs(&installs))
}

fn find_league_path_from_installs(installs: &RiotClientInstalls) -> Option<PathBuf> {
    let riot_client_dir = preferred_riot_client_dir(installs);

    if let Some(dir) = &riot_client_dir {
        for candidate in [
            dir.join("..").join("League of Legends"),
            dir.join("..").join("League of Legends (PBE)"),
        ] {
            if validate_dir(&candidate) {
                return Some(clean_path(candidate));
            }
        }
    }

    let mut live_candidate = None;
    let mut pbe_candidate = None;

    for path in installs.associated_client.keys() {
        let candidate = PathBuf::from(path.trim_end_matches(['\\', '/']));
        if path.to_ascii_lowercase().contains("(pbe)") {
            pbe_candidate = Some(candidate);
        } else {
            live_candidate = Some(candidate);
        }
    }

    for candidate in [live_candidate, pbe_candidate].into_iter().flatten() {
        if validate_dir(&candidate) {
            return Some(candidate);
        }
    }

    None
}

fn preferred_riot_client_dir(installs: &RiotClientInstalls) -> Option<PathBuf> {
    let path = if !installs.rc_live.trim().is_empty() {
        installs.rc_live.trim()
    } else if !installs.rc_default.trim().is_empty() {
        installs.rc_default.trim()
    } else {
        return None;
    };

    Path::new(path).parent().map(Path::to_path_buf)
}

fn clean_path(path: PathBuf) -> PathBuf {
    let canonical = fs::canonicalize(&path).unwrap_or(path);
    #[cfg(windows)]
    {
        let display = canonical.display().to_string();
        if let Some(stripped) = display.strip_prefix(r"\\?\") {
            return PathBuf::from(stripped);
        }
    }
    canonical
}

fn default_manifest_path() -> PathBuf {
    #[cfg(windows)]
    {
        PathBuf::from(r"C:\ProgramData\Riot Games\RiotClientInstalls.json")
    }

    #[cfg(not(windows))]
    {
        PathBuf::from("/ProgramData/Riot Games/RiotClientInstalls.json")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "maoloader-league-client-{name}-{}",
            std::process::id()
        ))
    }

    #[test]
    fn validates_league_dir_by_client_ux_binary() {
        let root = temp_root("validate");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();

        assert!(!validate_dir(&root));
        fs::write(root.join(LEAGUE_CLIENT_UX), "").unwrap();
        assert!(validate_dir(&root));

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn finds_league_from_riot_client_manifest_candidates() {
        let root = temp_root("manifest");
        let _ = fs::remove_dir_all(&root);
        let riot_client = root.join("Riot Client");
        let league = root.join("League of Legends");
        fs::create_dir_all(&riot_client).unwrap();
        fs::create_dir_all(&league).unwrap();
        fs::write(league.join(LEAGUE_CLIENT_UX), "").unwrap();

        let installs = RiotClientInstalls {
            associated_client: BTreeMap::new(),
            rc_default: riot_client
                .join("RiotClientServices.exe")
                .display()
                .to_string(),
            rc_live: String::new(),
        };

        assert_eq!(find_league_path_from_installs(&installs), Some(league));

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn falls_back_to_associated_client_entries() {
        let root = temp_root("associated");
        let _ = fs::remove_dir_all(&root);
        let pbe = root.join("League of Legends (PBE)");
        fs::create_dir_all(&pbe).unwrap();
        fs::write(pbe.join(LEAGUE_CLIENT_UX), "").unwrap();

        let mut associated_client = BTreeMap::new();
        associated_client.insert(pbe.display().to_string(), serde_json::Value::Bool(true));
        let installs = RiotClientInstalls {
            associated_client,
            rc_default: String::new(),
            rc_live: String::new(),
        };

        assert_eq!(find_league_path_from_installs(&installs), Some(pbe));

        fs::remove_dir_all(root).unwrap();
    }
}
