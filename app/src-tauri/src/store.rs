use crate::plugins;
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    io::{self, Cursor},
    path::{Component, Path, PathBuf},
};

const DEV_PLUGIN_REGISTRY_URL: &str = "http://localhost:5173/api/plugins";
const PROD_PLUGIN_REGISTRY_URL: &str = "https://maoloader.dev/api/plugins";
const INSTALL_MANIFEST_NAME: &str = ".maoloader-store.json";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct StorePlugin {
    pub name: String,
    pub slug: String,
    pub version: String,
    pub kind: String,
    pub description: String,
    pub image: String,
    pub repo: String,
    pub detail_url: String,
    pub download_url: String,
    pub homepage: String,
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
    #[serde(default)]
    pub detail_url: String,
    #[serde(default)]
    pub download_url: String,
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
    detail_url: String,
    download_url: String,
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
    let response = client
        .get(registry_index_url())
        .send()?
        .error_for_status()?
        .text()?;
    let mut plugins = parse_plugin_registry(&response)?;
    annotate_installed_plugins(&mut plugins);
    Ok(plugins)
}

pub fn install_plugin(
    plugin: StorePluginInstall,
) -> Result<StoreInstallResult, Box<dyn std::error::Error>> {
    let plugins_dir = plugins::ensure_plugins_dir()?;
    let slug = install_slug(&plugin.slug, &plugin.name).unwrap_or_else(|| {
        parse_github_repo(&plugin.repo)
            .map(|repo| repo.name)
            .unwrap_or_else(|_| "plugin".into())
    });
    let destination = plugins_dir.join(&slug);
    ensure_child_path(&plugins_dir, &destination)?;

    let client = github_client()?;
    let detail = fetch_registry_detail(&client, &plugin)?;
    let mut archive_url = detail
        .download_url
        .as_deref()
        .filter(|url| !url.is_empty())
        .or_else(|| (!plugin.download_url.trim().is_empty()).then_some(plugin.download_url.trim()))
        .map(str::to_owned);

    let repo = detail
        .repository
        .as_deref()
        .filter(|repo| !repo.is_empty())
        .or_else(|| (!plugin.repo.trim().is_empty()).then_some(plugin.repo.trim()))
        .and_then(|repo| parse_github_repo(repo).ok());

    if archive_url.is_none() {
        if let Some(repo) = &repo {
            archive_url = Some(github_archive_url(&client, repo)?);
        }
    }

    let archive_url = archive_url.unwrap_or_default();
    if archive_url.is_empty() {
        return Err(
            "Plugin listing does not include a download URL or installable GitHub repo".into(),
        );
    }
    let response = client.get(archive_url.clone()).send()?.error_for_status()?;
    let archive = response.bytes()?;

    let temp_destination = plugins_dir.join(format!(
        ".maoloader-install-{}.tmp",
        destination_name(&destination)?
    ));
    ensure_child_path(&plugins_dir, &temp_destination)?;
    remove_existing(&temp_destination)?;
    fs::create_dir_all(&temp_destination)?;

    let file_selection = detail.file_selection();
    match extract_zip(
        &archive,
        &temp_destination,
        repo.as_ref().and_then(|repo| repo.subdir.as_deref()),
        file_selection.as_ref(),
    ) {
        Ok(()) => {
            let manifest = StoreInstallManifest {
                name: plugin.name.clone(),
                slug: slug.clone(),
                repo: detail.repository.unwrap_or_else(|| plugin.repo.clone()),
                detail_url: plugin.detail_url.clone(),
                download_url: archive_url,
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

fn registry_index_url() -> String {
    std::env::var("MAOLOADER_REGISTRY_URL").unwrap_or_else(|_| {
        if cfg!(debug_assertions) {
            DEV_PLUGIN_REGISTRY_URL.into()
        } else {
            PROD_PLUGIN_REGISTRY_URL.into()
        }
    })
}

fn registry_origin() -> String {
    registry_index_url()
        .split_once("/api/")
        .map(|(origin, _)| origin.trim_end_matches('/').to_string())
        .unwrap_or_else(|| {
            if cfg!(debug_assertions) {
                "http://localhost:5173".into()
            } else {
                "https://maoloader.dev".into()
            }
        })
}

fn absolute_registry_url(base: &str, value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed.starts_with("https://") || trimmed.starts_with("http://") {
        return trimmed.to_string();
    }
    format!(
        "{}/{}",
        base.trim_end_matches('/'),
        trimmed.trim_start_matches('/')
    )
}

#[derive(Debug, Deserialize)]
struct RegistryResponse {
    items: Vec<RegistrySummaryItem>,
}

#[derive(Debug, Deserialize)]
struct RegistrySummaryItem {
    kind: String,
    slug: String,
    name: String,
    version: String,
    description: String,
    author: RegistryAuthor,
    tags: Vec<String>,
    assets: RegistryAssets,
}

#[derive(Debug, Deserialize)]
struct RegistryAuthor {
    name: String,
}

#[derive(Debug, Deserialize, Default)]
struct RegistryAssets {
    package: Option<RegistryAsset>,
    icon: Option<RegistryAsset>,
}

#[derive(Debug, Deserialize)]
struct RegistryAsset {
    url: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
struct RegistryDetail {
    entry: String,
    files: Vec<String>,
    repository: Option<String>,
    download_url: Option<String>,
}

impl RegistryDetail {
    fn file_selection(&self) -> Option<FileSelection> {
        FileSelection::new(&self.entry, &self.files)
    }
}

#[derive(Debug)]
struct FileSelection {
    strip_prefix: Option<PathBuf>,
    files: Vec<PathBuf>,
}

impl FileSelection {
    fn new(entry: &str, files: &[String]) -> Option<Self> {
        let mut selected = files
            .iter()
            .chain(std::iter::once(&entry.to_string()))
            .filter_map(|file| normalize_store_file_path(file).ok())
            .collect::<Vec<_>>();
        selected.sort();
        selected.dedup();
        if selected.is_empty() {
            return None;
        }

        let strip_prefix = normalize_store_file_path(entry)
            .ok()
            .and_then(|path| path.parent().map(Path::to_path_buf))
            .filter(|path| !path.as_os_str().is_empty());

        Some(Self {
            strip_prefix,
            files: selected,
        })
    }

    fn install_relative_path(&self, archive_path: &Path) -> Option<PathBuf> {
        let normalized = normalize_store_file_path(&archive_path.display().to_string()).ok()?;
        if !self.files.iter().any(|file| file == &normalized) {
            return None;
        }

        if let Some(strip_prefix) = &self.strip_prefix {
            match normalized.strip_prefix(strip_prefix) {
                Ok(path) if !path.as_os_str().is_empty() => return Some(path.to_path_buf()),
                _ => return None,
            }
        }

        Some(normalized)
    }
}

fn normalize_store_file_path(path: &str) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let normalized = PathBuf::from(path.replace('\\', "/").trim_matches('/').to_string());
    if is_safe_relative_path(&normalized) {
        Ok(normalized)
    } else {
        Err("Registry file path is not safe".into())
    }
}

fn registry_item_to_store_plugin(item: RegistrySummaryItem, base: &str) -> Option<StorePlugin> {
    if item.slug.trim().is_empty() || item.name.trim().is_empty() {
        return None;
    }

    let detail_url = absolute_registry_url(base, &format!("/api/plugins/{}", item.slug));
    let download_url = item
        .assets
        .package
        .as_ref()
        .and_then(|asset| asset.url.as_deref())
        .map(|url| absolute_registry_url(base, url))
        .unwrap_or_else(|| {
            absolute_registry_url(base, &format!("/api/plugins/{}/download", item.slug))
        });
    let image = item
        .assets
        .icon
        .as_ref()
        .and_then(|asset| asset.url.as_deref())
        .map(|url| absolute_registry_url(base, url))
        .unwrap_or_default();

    Some(StorePlugin {
        theme: item.kind == "theme",
        auto_update: false,
        discord: String::new(),
        readme: detail_url.clone(),
        installed: false,
        installed_entries: Vec::new(),
        installed_repo: String::new(),
        installed_at: 0,
        repo: String::new(),
        homepage: String::new(),
        kind: item.kind,
        slug: item.slug,
        name: item.name,
        version: item.version,
        description: item.description,
        image,
        detail_url,
        download_url,
        author: item.author.name,
        tags: item.tags,
    })
}

fn fetch_registry_detail(
    client: &reqwest::blocking::Client,
    plugin: &StorePluginInstall,
) -> Result<RegistryDetail, Box<dyn std::error::Error>> {
    if plugin.detail_url.trim().is_empty() {
        return Ok(RegistryDetail {
            repository: (!plugin.repo.trim().is_empty()).then(|| plugin.repo.clone()),
            download_url: (!plugin.download_url.trim().is_empty())
                .then(|| plugin.download_url.clone()),
            ..RegistryDetail::default()
        });
    }

    let mut detail: RegistryDetail = client
        .get(plugin.detail_url.trim())
        .send()?
        .error_for_status()?
        .json()?;
    if detail
        .download_url
        .as_deref()
        .unwrap_or_default()
        .starts_with('/')
    {
        detail.download_url = Some(absolute_registry_url(
            &registry_origin(),
            detail.download_url.as_deref().unwrap_or_default(),
        ));
    }
    Ok(detail)
}

fn parse_plugin_registry(content: &str) -> Result<Vec<StorePlugin>, Box<dyn std::error::Error>> {
    let registry: RegistryResponse = serde_json::from_str(content)?;
    let base = registry_origin();
    Ok(registry
        .items
        .into_iter()
        .filter_map(|item| registry_item_to_store_plugin(item, &base))
        .collect())
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

fn github_archive_url(
    client: &reqwest::blocking::Client,
    repo: &GithubRepo,
) -> Result<String, Box<dyn std::error::Error>> {
    let branch = match repo.branch.clone() {
        Some(branch) => branch,
        None => fetch_default_branch(client, repo)?,
    };
    Ok(format!(
        "https://codeload.github.com/{}/{}/zip/refs/heads/{}",
        repo.owner, repo.name, branch
    ))
}

fn extract_zip(
    archive: &[u8],
    destination: &Path,
    subdir: Option<&str>,
    selection: Option<&FileSelection>,
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
        let relative = if let Some(selection) = selection {
            match selection.install_relative_path(&relative) {
                Some(path) => path,
                None => continue,
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
    fn parses_maoloader_registry_json() {
        let plugins = parse_plugin_registry(
            r#"
{
  "generated_at": "2026-06-04T00:00:00.000Z",
  "count": 2,
  "items": [
    {
      "kind": "plugin",
      "slug": "client-tools",
      "name": "Client Tools",
      "version": "0.1.0",
      "description": "Small client utilities.",
      "author": { "name": "Lx" },
      "tags": ["utility", "spotify"],
      "compatibility": { "maoloader": ">=0.1.0" },
      "updated_at": "2026-06-04T00:00:00.000Z",
      "assets": {
        "package": { "url": "/api/plugins/client-tools/download" },
        "icon": { "url": "/icons/client-tools.png" }
      }
    },
    {
      "kind": "theme",
      "slug": "quiet-theme",
      "name": "Quiet Theme",
      "version": "0.2.0",
      "description": "A quieter theme.",
      "author": { "name": "Mao" },
      "tags": ["theme"],
      "compatibility": { "maoloader": ">=0.1.0" },
      "updated_at": "2026-06-04T00:00:00.000Z",
      "assets": {}
    }
  ]
}
"#,
        )
        .unwrap();

        assert_eq!(plugins.len(), 2);
        assert_eq!(plugins[0].author, "Lx");
        assert_eq!(plugins[0].version, "0.1.0");
        assert_eq!(plugins[0].kind, "plugin");
        assert!(!plugins[0].installed);
        assert!(plugins[0].installed_entries.is_empty());
        assert_eq!(plugins[0].tags, ["utility", "spotify"]);
        assert_eq!(
            plugins[0].detail_url,
            "http://localhost:5173/api/plugins/client-tools"
        );
        assert_eq!(
            plugins[0].download_url,
            "http://localhost:5173/api/plugins/client-tools/download"
        );
        assert_eq!(
            plugins[0].image,
            "http://localhost:5173/icons/client-tools.png"
        );
        assert_eq!(plugins[1].author, "Mao");
        assert_eq!(plugins[1].kind, "theme");
        assert!(plugins[1].theme);
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
                version: "0.1.0".into(),
                kind: "plugin".into(),
                description: String::new(),
                image: String::new(),
                repo: "https://github.com/example/sample".into(),
                detail_url: "http://localhost:5173/api/plugins/sample-plugin".into(),
                download_url: "http://localhost:5173/api/plugins/sample-plugin/download".into(),
                homepage: String::new(),
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
                version: "0.1.0".into(),
                kind: "plugin".into(),
                description: String::new(),
                image: String::new(),
                repo: "https://github.com/example/missing".into(),
                detail_url: "http://localhost:5173/api/plugins/missing-plugin".into(),
                download_url: "http://localhost:5173/api/plugins/missing-plugin/download".into(),
                homepage: String::new(),
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
            detail_url: "http://localhost:5173/api/plugins/sample".into(),
            download_url: "http://localhost:5173/api/plugins/sample/download".into(),
            installed_at: 1234,
        };

        write_install_manifest(&root, &manifest).unwrap();
        let restored = read_install_manifest(&root).unwrap();

        assert_eq!(restored.name, "Sample");
        assert_eq!(restored.slug, "sample");
        assert_eq!(restored.repo, "https://github.com/example/sample");
        assert_eq!(
            restored.detail_url,
            "http://localhost:5173/api/plugins/sample"
        );
        assert_eq!(
            restored.download_url,
            "http://localhost:5173/api/plugins/sample/download"
        );
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
                detail_url: String::new(),
                download_url: String::new(),
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
                detail_url: String::new(),
                download_url: String::new(),
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
        assert!(plugins.iter().all(|plugin| !plugin.detail_url.is_empty()));
        assert!(plugins
            .iter()
            .all(|plugin| plugin.download_url.starts_with("https://")));
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

        extract_zip(archive.get_ref(), &destination, Some("Plugin"), None).unwrap();

        assert!(destination.join("index.js").exists());
        assert!(!destination.join("Other").exists());

        fs::remove_dir_all(destination).unwrap();
    }

    #[test]
    fn selected_registry_files_install_relative_to_entry_folder() {
        let selection = FileSelection::new(
            "plugins/cool-plugin/index.js",
            &[
                "plugins/cool-plugin/index.js".into(),
                "plugins/cool-plugin/styles.css".into(),
                "plugins/other/index.js".into(),
            ],
        )
        .unwrap();

        assert_eq!(
            selection.install_relative_path(Path::new("plugins/cool-plugin/index.js")),
            Some(PathBuf::from("index.js"))
        );
        assert_eq!(
            selection.install_relative_path(Path::new("plugins/cool-plugin/styles.css")),
            Some(PathBuf::from("styles.css"))
        );
        assert_eq!(
            selection.install_relative_path(Path::new("plugins/other/index.js")),
            None
        );
    }
}
