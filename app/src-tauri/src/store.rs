use crate::plugins;
use serde::{Deserialize, Serialize};
use serde_yaml::Value;
use std::{
    collections::BTreeMap,
    fs,
    io::{self, Cursor},
    path::{Component, Path, PathBuf},
};

const PLUGIN_REGISTRY_URL: &str =
    "https://raw.githubusercontent.com/PenguLoader/plugin-store/main/registry/plugins.yml";
const INSTALL_MANIFEST_NAME: &str = ".maoloader-store.json";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct StorePlugin {
    pub name: String,
    pub slug: String,
    pub description: String,
    pub image: String,
    pub repo: String,
    pub author: String,
    pub tags: Vec<String>,
    pub theme: bool,
    pub auto_update: bool,
    pub discord: String,
    pub readme: String,
    pub installed: bool,
    pub installed_entries: Vec<String>,
    pub installed_repo: String,
    pub installed_at: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct StorePluginInstall {
    pub name: String,
    pub slug: String,
    pub repo: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct StoreInstallResult {
    pub name: String,
    pub installed_path: String,
    pub plugin_count: usize,
    pub manifest_path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct StoreUninstallResult {
    pub name: String,
    pub removed_path: String,
    pub plugin_count: usize,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
struct StoreInstallManifest {
    name: String,
    slug: String,
    repo: String,
    installed_at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct GithubRepo {
    owner: String,
    name: String,
    branch: Option<String>,
    subdir: Option<String>,
}

pub fn fetch_plugins() -> Result<Vec<StorePlugin>, Box<dyn std::error::Error>> {
    let client = github_client()?;
    let registry = client
        .get(PLUGIN_REGISTRY_URL)
        .send()?
        .error_for_status()?
        .text()?;
    let mut plugins = parse_plugin_registry(&registry)?;
    annotate_installed_plugins(&mut plugins);
    Ok(plugins)
}

pub fn install_plugin(
    plugin: StorePluginInstall,
) -> Result<StoreInstallResult, Box<dyn std::error::Error>> {
    let repo = parse_github_repo(&plugin.repo)?;
    let plugins_dir = plugins::ensure_plugins_dir()?;
    let slug = install_slug(&plugin.slug, &plugin.name).unwrap_or_else(|| repo.name.clone());
    let destination = plugins_dir.join(&slug);
    ensure_child_path(&plugins_dir, &destination)?;

    let client = github_client()?;
    let branch = match repo.branch.clone() {
        Some(branch) => branch,
        None => fetch_default_branch(&client, &repo)?,
    };
    let archive_url = format!(
        "https://codeload.github.com/{}/{}/zip/refs/heads/{}",
        repo.owner, repo.name, branch
    );
    let response = client.get(archive_url).send()?.error_for_status()?;
    let archive = response.bytes()?;

    let temp_destination = plugins_dir.join(format!(
        ".maoloader-install-{}.tmp",
        destination_name(&destination)?
    ));
    ensure_child_path(&plugins_dir, &temp_destination)?;
    remove_existing(&temp_destination)?;
    fs::create_dir_all(&temp_destination)?;

    match extract_zip(&archive, &temp_destination, repo.subdir.as_deref()) {
        Ok(()) => {
            let manifest = StoreInstallManifest {
                name: plugin.name.clone(),
                slug: slug.clone(),
                repo: plugin.repo.clone(),
                installed_at: unix_timestamp(),
            };
            write_install_manifest(&temp_destination, &manifest)?;
            remove_existing(&destination)?;
            fs::rename(&temp_destination, &destination)?;
        }
        Err(error) => {
            let _ = fs::remove_dir_all(&temp_destination);
            return Err(error);
        }
    }

    let plugin_count = plugins::list_plugins()?.len();
    Ok(StoreInstallResult {
        name: plugin.name,
        manifest_path: destination
            .join(INSTALL_MANIFEST_NAME)
            .display()
            .to_string(),
        installed_path: destination.display().to_string(),
        plugin_count,
    })
}

pub fn uninstall_plugin(
    plugin: StorePluginInstall,
) -> Result<StoreUninstallResult, Box<dyn std::error::Error>> {
    let plugins_dir = plugins::ensure_plugins_dir()?;
    let slug = install_slug(&plugin.slug, &plugin.name)
        .ok_or("Store plugin is missing an installable slug")?;
    let destination = store_uninstall_target(&plugins_dir, &slug)?;

    remove_existing(&destination)?;
    let plugin_count = plugins::list_plugins()?.len();
    Ok(StoreUninstallResult {
        name: plugin.name,
        removed_path: destination.display().to_string(),
        plugin_count,
    })
}

fn store_uninstall_target(
    plugins_dir: &Path,
    slug: &str,
) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let destination = plugins_dir.join(slug);
    ensure_child_path(plugins_dir, &destination)?;

    let Some(manifest) = read_install_manifest(&destination) else {
        return Err("Refusing to uninstall a plugin without a maoloader store manifest".into());
    };
    if manifest.slug != slug {
        return Err("Store manifest slug does not match uninstall target".into());
    }

    Ok(destination)
}

fn github_client() -> Result<reqwest::blocking::Client, Box<dyn std::error::Error>> {
    Ok(reqwest::blocking::Client::builder()
        .user_agent("maoloader-plugin-installer/0.1")
        .build()?)
}

fn parse_plugin_registry(content: &str) -> Result<Vec<StorePlugin>, Box<dyn std::error::Error>> {
    let value: Value = serde_yaml::from_str(content)?;
    let Some(plugins) = value.get("plugins").and_then(Value::as_sequence) else {
        return Ok(Vec::new());
    };

    let plugins = plugins
        .iter()
        .filter_map(parse_registry_plugin)
        .filter(|plugin| !plugin.name.is_empty() && !plugin.repo.is_empty())
        .collect();
    Ok(plugins)
}

fn parse_registry_plugin(value: &Value) -> Option<StorePlugin> {
    let name = yaml_string(value.get("name"));
    let repo = normalize_store_repo(&yaml_string(value.get("repo")));
    if name.is_empty() || repo.is_empty() {
        return None;
    }

    Some(StorePlugin {
        slug: yaml_string(value.get("slug")),
        description: yaml_string(value.get("description")),
        image: yaml_string(value.get("image")),
        author: yaml_author(value.get("author")),
        tags: yaml_string_list(value.get("tags")),
        theme: yaml_bool(value.get("theme")),
        auto_update: yaml_bool(value.get("auto_update")),
        discord: yaml_string(value.get("discord")),
        readme: yaml_string(value.get("readme")),
        installed: false,
        installed_entries: Vec::new(),
        installed_repo: String::new(),
        installed_at: 0,
        name,
        repo,
    })
}

fn annotate_installed_plugins(plugins: &mut [StorePlugin]) {
    let Ok(local_plugins) = plugins::list_plugins() else {
        return;
    };
    let plugins_dir = plugins::effective_plugins_dir();
    annotate_installed_plugins_from_entries(plugins, &plugins_dir, local_plugins);
}

fn annotate_installed_plugins_from_entries(
    plugins: &mut [StorePlugin],
    plugins_dir: &Path,
    local_plugins: Vec<plugins::PluginEntry>,
) {
    let mut entries_by_slug = BTreeMap::<String, Vec<String>>::new();

    for plugin in local_plugins {
        let slug = plugin
            .entry
            .split('/')
            .next()
            .unwrap_or("")
            .to_ascii_lowercase();
        if !slug.is_empty() {
            entries_by_slug
                .entry(slug)
                .or_default()
                .push(plugin.entry.clone());
        }
    }

    for plugin in plugins {
        let Some(slug) = install_slug(&plugin.slug, &plugin.name) else {
            continue;
        };
        plugin.installed_entries = entries_by_slug.remove(&slug).unwrap_or_default();
        if let Some(manifest) = read_install_manifest(&plugins_dir.join(&slug)) {
            plugin.installed_repo = manifest.repo;
            plugin.installed_at = manifest.installed_at;
        }
        plugin.installed = plugins_dir.join(&slug).exists() || !plugin.installed_entries.is_empty();
    }
}

fn write_install_manifest(
    destination: &Path,
    manifest: &StoreInstallManifest,
) -> Result<(), Box<dyn std::error::Error>> {
    let path = destination.join(INSTALL_MANIFEST_NAME);
    fs::write(path, serde_json::to_string_pretty(manifest)?)?;
    Ok(())
}

fn read_install_manifest(destination: &Path) -> Option<StoreInstallManifest> {
    let content = fs::read_to_string(destination.join(INSTALL_MANIFEST_NAME)).ok()?;
    serde_json::from_str(&content).ok()
}

fn unix_timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn yaml_string(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(value)) => value.trim().to_string(),
        Some(Value::Number(value)) => value.to_string(),
        Some(Value::Bool(value)) => value.to_string(),
        _ => String::new(),
    }
}

fn yaml_bool(value: Option<&Value>) -> bool {
    matches!(value, Some(Value::Bool(true)))
}

fn yaml_string_list(value: Option<&Value>) -> Vec<String> {
    match value {
        Some(Value::Sequence(values)) => values
            .iter()
            .map(|value| yaml_string(Some(value)))
            .filter(|value| !value.is_empty())
            .collect(),
        Some(value) => {
            let value = yaml_string(Some(value));
            if value.is_empty() {
                Vec::new()
            } else {
                vec![value]
            }
        }
        None => Vec::new(),
    }
}

fn yaml_author(value: Option<&Value>) -> String {
    match value {
        Some(Value::Mapping(map)) => map
            .get(Value::String("name".into()))
            .map(|value| yaml_string(Some(value)))
            .filter(|value| !value.is_empty())
            .or_else(|| {
                map.get(Value::String("github".into()))
                    .map(|value| yaml_string(Some(value)))
                    .filter(|value| !value.is_empty())
            })
            .unwrap_or_default(),
        Some(value) => yaml_string(Some(value)),
        None => String::new(),
    }
}

fn normalize_store_repo(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed.starts_with("https://github.com/") || trimmed.starts_with("http://github.com/") {
        return trimmed.trim_end_matches('/').to_string();
    }
    if trimmed.starts_with("https://") || trimmed.starts_with("http://") {
        return String::new();
    }
    format!(
        "https://github.com/{}",
        trimmed.trim_matches('/').trim_end_matches('/')
    )
}

fn fetch_default_branch(
    client: &reqwest::blocking::Client,
    repo: &GithubRepo,
) -> Result<String, Box<dyn std::error::Error>> {
    let url = format!("https://api.github.com/repos/{}/{}", repo.owner, repo.name);
    let value: serde_json::Value = client.get(url).send()?.error_for_status()?.json()?;
    value
        .get("default_branch")
        .and_then(|branch| branch.as_str())
        .filter(|branch| !branch.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| "GitHub repo response did not include default_branch".into())
}

fn extract_zip(
    archive: &[u8],
    destination: &Path,
    subdir: Option<&str>,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut zip = zip::ZipArchive::new(Cursor::new(archive))?;
    let wanted_subdir = subdir.map(normalize_repo_subdir).transpose()?;
    let mut extracted = 0usize;

    for index in 0..zip.len() {
        let mut file = zip.by_index(index)?;
        let Some(enclosed) = file.enclosed_name() else {
            continue;
        };
        let mut parts = enclosed.components();
        parts.next();
        let relative: PathBuf = parts.collect();
        if relative.as_os_str().is_empty() {
            continue;
        }

        let relative = if let Some(wanted) = &wanted_subdir {
            match relative.strip_prefix(wanted) {
                Ok(path) if !path.as_os_str().is_empty() => path.to_path_buf(),
                _ => continue,
            }
        } else {
            relative
        };
        if !is_safe_relative_path(&relative) {
            continue;
        }

        let target = destination.join(&relative);
        ensure_child_path(destination, &target)?;
        if file.is_dir() {
            fs::create_dir_all(&target)?;
        } else {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)?;
            }
            let mut output = fs::File::create(&target)?;
            io::copy(&mut file, &mut output)?;
            extracted += 1;
        }
    }

    if extracted == 0 {
        return Err("Plugin archive did not contain files for the selected path".into());
    }

    Ok(())
}

fn parse_github_repo(input: &str) -> Result<GithubRepo, Box<dyn std::error::Error>> {
    let trimmed = input.trim().trim_end_matches('/');
    let path = if let Some(rest) = trimmed.strip_prefix("https://github.com/") {
        rest
    } else if let Some(rest) = trimmed.strip_prefix("http://github.com/") {
        rest
    } else {
        trimmed
    };
    let parts: Vec<&str> = path.split('/').filter(|part| !part.is_empty()).collect();
    if parts.len() < 2 {
        return Err("Plugin repo must point to a GitHub owner/repo".into());
    }

    let mut repo = GithubRepo {
        owner: safe_repo_segment(parts[0])?,
        name: safe_repo_segment(parts[1])?,
        branch: None,
        subdir: None,
    };

    if parts.get(2) == Some(&"tree") {
        let branch = parts
            .get(3)
            .ok_or("GitHub tree URL is missing a branch")?
            .to_string();
        repo.branch = Some(safe_repo_segment(&branch)?);
        if parts.len() > 4 {
            let subdir = parts[4..].join("/");
            normalize_repo_subdir(&subdir)?;
            repo.subdir = Some(subdir);
        }
    }

    Ok(repo)
}

fn safe_repo_segment(segment: &str) -> Result<String, Box<dyn std::error::Error>> {
    let valid = !segment.is_empty()
        && segment
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.');
    if valid {
        Ok(segment.to_string())
    } else {
        Err("GitHub repo URL contains an invalid segment".into())
    }
}

fn sanitize_slug(value: &str) -> Option<String> {
    let slug = value
        .trim()
        .to_ascii_lowercase()
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    (!slug.is_empty()).then_some(slug)
}

fn install_slug(slug: &str, name: &str) -> Option<String> {
    sanitize_slug(slug).or_else(|| sanitize_slug(name))
}

fn destination_name(path: &Path) -> Result<String, Box<dyn std::error::Error>> {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(str::to_owned)
        .ok_or_else(|| "Install destination is missing a folder name".into())
}

fn remove_existing(path: &Path) -> io::Result<()> {
    if path.is_dir() {
        fs::remove_dir_all(path)
    } else if path.exists() {
        fs::remove_file(path)
    } else {
        Ok(())
    }
}

fn normalize_repo_subdir(subdir: &str) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let path = PathBuf::from(subdir.trim_matches('/'));
    if is_safe_relative_path(&path) {
        Ok(path)
    } else {
        Err("GitHub tree path is not a safe plugin subdirectory".into())
    }
}

fn is_safe_relative_path(path: &Path) -> bool {
    !path.as_os_str().is_empty()
        && path.components().all(|component| match component {
            Component::Normal(_) => true,
            Component::CurDir => true,
            _ => false,
        })
}

fn ensure_child_path(base: &Path, path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let base = base.canonicalize().unwrap_or_else(|_| base.to_path_buf());
    let candidate_parent = if path.exists() {
        path.canonicalize()?
    } else {
        path.parent()
            .map(|parent| {
                parent
                    .canonicalize()
                    .unwrap_or_else(|_| parent.to_path_buf())
            })
            .unwrap_or_else(|| path.to_path_buf())
    };

    if candidate_parent.starts_with(&base) {
        Ok(())
    } else {
        Err("Install destination escapes the plugin directory".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{io::Write, time::SystemTime};

    #[test]
    fn parses_registry_github_shapes() {
        assert_eq!(
            parse_github_repo("BakaFT/BenchKiller/").unwrap(),
            GithubRepo {
                owner: "BakaFT".into(),
                name: "BenchKiller".into(),
                branch: None,
                subdir: None,
            }
        );
        assert_eq!(
            parse_github_repo(
                "https://github.com/iIlusion/league-loader-plugins/tree/main/ListeningStatus"
            )
            .unwrap(),
            GithubRepo {
                owner: "iIlusion".into(),
                name: "league-loader-plugins".into(),
                branch: Some("main".into()),
                subdir: Some("ListeningStatus".into()),
            }
        );
    }

    #[test]
    fn rejects_non_github_and_unsafe_paths() {
        assert!(parse_github_repo("https://example.com/a/b").is_err());
        assert!(parse_github_repo("owner/repo/tree/main/../escape").is_err());
        assert!(normalize_repo_subdir("../escape").is_err());
        assert!(!is_safe_relative_path(Path::new("../escape")));
        assert!(!is_safe_relative_path(Path::new("/absolute")));
    }

    #[test]
    fn sanitizes_install_folder_names() {
        assert_eq!(sanitize_slug("Cute Theme!"), Some("cute-theme".into()));
        assert_eq!(sanitize_slug("___"), Some("___".into()));
        assert_eq!(sanitize_slug(" / "), None);
    }

    #[test]
    fn parses_registry_yaml_with_nested_author_and_repo_normalization() {
        let plugins = parse_plugin_registry(
            r#"
name: Pengu Plugin Store registry
plugins:
  - name: Listening status
    slug: listening-status
    description: Sync your status.
    image: data:image/svg+xml,%3Csvg%3E
    repo: https://github.com/iIlusion/league-loader-plugins/tree/main/ListeningStatus
    readme: readme.md
    author:
      name: Lx
      github: iIlusion
    tags: [utility, spotify]
  - name: Bench Killer
    slug: bench-killer
    repo: BakaFT/BenchKiller/
    author:
      github: BakaFT
    auto_update: true
    tags: [utility]
"#,
        )
        .unwrap();

        assert_eq!(plugins.len(), 2);
        assert_eq!(plugins[0].author, "Lx");
        assert!(!plugins[0].installed);
        assert!(plugins[0].installed_entries.is_empty());
        assert_eq!(plugins[0].tags, ["utility", "spotify"]);
        assert_eq!(
            plugins[0].repo,
            "https://github.com/iIlusion/league-loader-plugins/tree/main/ListeningStatus"
        );
        assert_eq!(plugins[1].author, "BakaFT");
        assert!(plugins[1].auto_update);
        assert_eq!(plugins[1].repo, "https://github.com/BakaFT/BenchKiller");
    }

    #[test]
    fn installed_annotation_matches_slug_folder_and_discovered_entries() {
        let root = std::env::temp_dir().join(format!(
            "maoloader-store-installed-test-{}",
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(root.join("sample-plugin")).unwrap();

        let mut plugins = vec![
            StorePlugin {
                name: "Sample Plugin".into(),
                slug: "sample-plugin".into(),
                description: String::new(),
                image: String::new(),
                repo: "https://github.com/example/sample".into(),
                author: String::new(),
                tags: Vec::new(),
                theme: false,
                auto_update: false,
                discord: String::new(),
                readme: String::new(),
                installed: false,
                installed_entries: Vec::new(),
                installed_repo: String::new(),
                installed_at: 0,
            },
            StorePlugin {
                name: "Missing Plugin".into(),
                slug: "missing-plugin".into(),
                description: String::new(),
                image: String::new(),
                repo: "https://github.com/example/missing".into(),
                author: String::new(),
                tags: Vec::new(),
                theme: false,
                auto_update: false,
                discord: String::new(),
                readme: String::new(),
                installed: false,
                installed_entries: Vec::new(),
                installed_repo: String::new(),
                installed_at: 0,
            },
        ];
        let local_plugins = vec![plugins::PluginEntry {
            name: "sample-plugin".into(),
            entry: "sample-plugin/index.js".into(),
            path: root
                .join("sample-plugin")
                .join("index.js")
                .display()
                .to_string(),
            kind: "js".into(),
            hash: "00000000".into(),
            enabled: true,
            description: None,
            author: None,
            link: None,
        }];

        annotate_installed_plugins_from_entries(&mut plugins, &root, local_plugins);

        assert!(plugins[0].installed);
        assert_eq!(plugins[0].installed_entries, ["sample-plugin/index.js"]);
        assert!(!plugins[1].installed);

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn install_manifest_round_trips_store_metadata() {
        let root = std::env::temp_dir().join(format!(
            "maoloader-store-manifest-test-{}",
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let manifest = StoreInstallManifest {
            name: "Sample".into(),
            slug: "sample".into(),
            repo: "https://github.com/example/sample".into(),
            installed_at: 1234,
        };

        write_install_manifest(&root, &manifest).unwrap();
        let restored = read_install_manifest(&root).unwrap();

        assert_eq!(restored.name, "Sample");
        assert_eq!(restored.slug, "sample");
        assert_eq!(restored.repo, "https://github.com/example/sample");
        assert_eq!(restored.installed_at, 1234);

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn uninstall_requires_matching_store_manifest() {
        let root = std::env::temp_dir().join(format!(
            "maoloader-store-uninstall-test-{}",
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let plugin_dir = root.join("sample");
        fs::create_dir_all(&plugin_dir).unwrap();
        fs::write(plugin_dir.join("index.js"), "console.log('sample')").unwrap();

        assert!(store_uninstall_target(&root, "sample").is_err());

        write_install_manifest(
            &plugin_dir,
            &StoreInstallManifest {
                name: "Sample".into(),
                slug: "other".into(),
                repo: "https://github.com/example/sample".into(),
                installed_at: 1,
            },
        )
        .unwrap();
        assert!(store_uninstall_target(&root, "sample").is_err());

        write_install_manifest(
            &plugin_dir,
            &StoreInstallManifest {
                name: "Sample".into(),
                slug: "sample".into(),
                repo: "https://github.com/example/sample".into(),
                installed_at: 1,
            },
        )
        .unwrap();

        let destination = store_uninstall_target(&root, "sample").unwrap();
        assert_eq!(destination, plugin_dir);

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    #[ignore]
    fn live_registry_fetch_returns_installable_plugins() {
        let plugins = fetch_plugins().unwrap();

        assert!(!plugins.is_empty());
        assert!(plugins
            .iter()
            .all(|plugin| plugin.repo.starts_with("https://github.com/")));
        assert!(plugins
            .iter()
            .any(|plugin| plugin.slug == "balance-buff-viewer"));
    }

    #[test]
    fn extracts_selected_archive_subfolder_safely() {
        let mut archive = Cursor::new(Vec::new());
        {
            let mut writer = zip::ZipWriter::new(&mut archive);
            let options = zip::write::SimpleFileOptions::default();
            writer
                .start_file("repo-main/Plugin/index.js", options)
                .unwrap();
            writer.write_all(b"console.log('plugin')").unwrap();
            writer
                .start_file("repo-main/Other/index.js", options)
                .unwrap();
            writer.write_all(b"console.log('other')").unwrap();
            writer.finish().unwrap();
        }

        let destination = std::env::temp_dir().join(format!(
            "maoloader-extract-test-{}",
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&destination).unwrap();

        extract_zip(archive.get_ref(), &destination, Some("Plugin")).unwrap();

        assert!(destination.join("index.js").exists());
        assert!(!destination.join("Other").exists());

        fs::remove_dir_all(destination).unwrap();
    }
}
