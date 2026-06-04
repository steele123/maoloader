use crate::config;
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeSet,
    fs, io,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, Serialize)]
pub struct PluginEntry {
    pub name: String,
    pub entry: String,
    pub path: String,
    pub kind: String,
    pub hash: String,
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub link: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PluginToggle {
    pub entry: String,
    pub enabled: bool,
}

pub fn list_plugins() -> io::Result<Vec<PluginEntry>> {
    let loader_config = config::read_config().unwrap_or_default();
    let plugins_dir = configured_plugins_dir(&loader_config);

    if !plugins_dir.exists() {
        fs::create_dir_all(&plugins_dir)?;
        return Ok(Vec::new());
    }

    let disabled = disabled_hashes(&loader_config.app.disabled_plugins);
    let mut plugins = Vec::new();
    collect_plugin_entries(&plugins_dir, &disabled, &mut plugins)?;

    plugins.sort_by(|left, right| left.entry.cmp(&right.entry));
    Ok(plugins)
}

pub fn set_plugin_enabled(toggle: PluginToggle) -> io::Result<Vec<PluginEntry>> {
    let mut loader_config = config::read_config().unwrap_or_default();
    let hash = plugin_hash_hex(&toggle.entry);
    let mut disabled = disabled_hashes(&loader_config.app.disabled_plugins);

    if toggle.enabled {
        disabled.remove(&hash);
    } else {
        disabled.insert(hash);
    }

    loader_config.app.disabled_plugins = disabled.into_iter().collect::<Vec<_>>().join(",");
    config::write_config(&loader_config)?;
    list_plugins()
}

pub fn create_sample_plugin() -> io::Result<Vec<PluginEntry>> {
    let loader_config = config::read_config().unwrap_or_default();
    let plugins_dir = configured_plugins_dir(&loader_config);
    fs::create_dir_all(&plugins_dir)?;

    let sample_dir = plugins_dir.join("maoloader-example");
    fs::create_dir_all(&sample_dir)?;
    write_if_missing(
        &sample_dir.join("index.js"),
        include_str!("../../../examples/plugins/maoloader-example/index.js"),
    )?;
    write_if_missing(
        &sample_dir.join("styles.css"),
        include_str!("../../../examples/plugins/maoloader-example/styles.css"),
    )?;
    write_if_missing(
        &sample_dir.join("maoloader.plugin.json"),
        include_str!("../../../examples/plugins/maoloader-example/maoloader.plugin.json"),
    )?;
    write_if_missing(
        &sample_dir.join("maoloader.json"),
        include_str!("../../../examples/plugins/maoloader-example/maoloader.json"),
    )?;
    write_if_missing(
        &sample_dir.join("README.md"),
        include_str!("../../../examples/plugins/maoloader-example/README.md"),
    )?;

    list_plugins()
}

pub fn effective_plugins_dir() -> PathBuf {
    let loader_config = config::read_config().unwrap_or_default();
    configured_plugins_dir(&loader_config)
}

pub fn ensure_plugins_dir() -> io::Result<PathBuf> {
    let plugins_dir = effective_plugins_dir();
    fs::create_dir_all(&plugins_dir)?;
    Ok(plugins_dir)
}

fn collect_plugin_entries(
    root: &Path,
    disabled: &BTreeSet<String>,
    plugins: &mut Vec<PluginEntry>,
) -> io::Result<()> {
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };

        if !allowed_name(name) {
            continue;
        }

        if path.is_file() && is_plugin_file(&path) {
            push_plugin(root, path, disabled, plugins);
        } else if path.is_file() && is_renamed_plugin_file(&path) {
            push_plugin(root, path, disabled, plugins);
        } else if path.is_dir() && name.starts_with('@') {
            collect_scoped_plugin_entries(root, &path, disabled, plugins)?;
        } else if path.is_dir() {
            if let Some(entry) = plugin_entry_path(&path)? {
                push_plugin(root, entry, disabled, plugins);
            }
        }
    }

    Ok(())
}

fn write_if_missing(path: &Path, content: &str) -> io::Result<()> {
    if !path.exists() {
        fs::write(path, content)?;
    }

    Ok(())
}

fn collect_scoped_plugin_entries(
    root: &Path,
    scope_dir: &Path,
    disabled: &BTreeSet<String>,
    plugins: &mut Vec<PluginEntry>,
) -> io::Result<()> {
    for entry in fs::read_dir(scope_dir)? {
        let entry = entry?;
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };

        if !allowed_name(name) || !path.is_dir() {
            continue;
        }

        if let Some(entry) = plugin_entry_path(&path)? {
            push_plugin(root, entry, disabled, plugins);
        }
    }

    Ok(())
}

fn push_plugin(
    root: &Path,
    path: PathBuf,
    disabled: &BTreeSet<String>,
    plugins: &mut Vec<PluginEntry>,
) {
    let Ok(relative) = path.strip_prefix(root) else {
        return;
    };

    let entry = normalize_entry(relative).trim_end_matches('_').to_string();
    let name = plugin_display_name(&entry);
    let hash = plugin_hash_hex(&entry);
    let kind = path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("js")
        .to_ascii_lowercase();
    let metadata = parse_plugin_metadata(&path);

    plugins.push(PluginEntry {
        name,
        entry,
        path: path.display().to_string(),
        kind,
        enabled: !is_renamed_plugin_file(&path) && !disabled.contains(&hash),
        hash,
        description: metadata.description,
        author: metadata.author,
        link: metadata.link,
    });
}

fn plugin_display_name(entry: &str) -> String {
    if let Some(name) = entry.strip_suffix("/index.js") {
        return name.to_string();
    }

    entry
        .rsplit('/')
        .next()
        .and_then(|name| name.rsplit_once('.').map(|(stem, _)| stem).or(Some(name)))
        .unwrap_or(entry)
        .to_string()
}

#[derive(Default)]
struct PluginMetadata {
    description: Option<String>,
    author: Option<String>,
    link: Option<String>,
}

fn parse_plugin_metadata(path: &Path) -> PluginMetadata {
    let Ok(content) = fs::read_to_string(path) else {
        return PluginMetadata::default();
    };

    let description = tag_value(&content, "description");
    let author = tag_value(&content, "author").map(|author| {
        if author.contains('#') {
            author
        } else {
            format!("@{author}")
        }
    });
    let link = tag_value(&content, "link").filter(|link| link.starts_with("https://"));

    PluginMetadata {
        description,
        author,
        link,
    }
}

fn tag_value(content: &str, tag: &str) -> Option<String> {
    let needle = format!("@{tag}");
    content.lines().find_map(|line| {
        let position = line.find(&needle)?;
        let value = line[position + needle.len()..].trim();
        (!value.is_empty()).then(|| value.to_string())
    })
}

fn configured_plugins_dir(loader_config: &config::LoaderConfig) -> PathBuf {
    let configured = loader_config.app.plugins_dir.trim();
    if configured.is_empty() || configured.starts_with('.') {
        config::plugins_dir()
    } else {
        PathBuf::from(configured)
    }
}

fn is_plugin_file(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|extension| extension.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("js" | "mjs" | "cjs")
    )
}

fn is_renamed_plugin_file(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.ends_with(".js_"))
}

fn plugin_entry_path(dir: &Path) -> io::Result<Option<PathBuf>> {
    let index = dir.join("index.js");
    if index.is_file() {
        return Ok(Some(index));
    }

    let renamed = dir.join("index.js_");
    if renamed.is_file() {
        return Ok(Some(renamed));
    }

    single_non_minified_plugin_file(dir)
}

fn single_non_minified_plugin_file(dir: &Path) -> io::Result<Option<PathBuf>> {
    let candidates = fs::read_dir(dir)?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_file() && is_plugin_file(path))
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| !name.to_ascii_lowercase().ends_with(".min.js"))
        })
        .collect::<Vec<_>>();

    Ok((candidates.len() == 1).then(|| candidates[0].clone()))
}

fn allowed_name(name: &str) -> bool {
    !name.starts_with('_') && !name.starts_with('.')
}

fn disabled_hashes(value: &str) -> BTreeSet<String> {
    value
        .split(',')
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .map(|entry| entry.to_ascii_lowercase())
        .collect()
}

fn normalize_entry(path: &Path) -> String {
    path.display()
        .to_string()
        .replace('\\', "/")
        .to_ascii_lowercase()
}

fn plugin_hash_hex(entry: &str) -> String {
    format!("{:08x}", fnv1a(entry))
}

fn fnv1a(entry: &str) -> u32 {
    let mut hash = 0x811c9dc5_u32;

    for byte in entry.to_ascii_lowercase().replace('\\', "/").bytes() {
        hash ^= u32::from(byte);
        hash = hash
            .wrapping_add(hash << 1)
            .wrapping_add(hash << 4)
            .wrapping_add(hash << 7)
            .wrapping_add(hash << 8)
            .wrapping_add(hash << 24);
    }

    hash
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plugin_listing_matches_runtime_entry_shapes() {
        let root =
            std::env::temp_dir().join(format!("maoloader-app-plugin-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("folder")).unwrap();
        fs::create_dir_all(root.join("renamed-folder")).unwrap();
        fs::create_dir_all(root.join("@scope").join("plugin")).unwrap();
        fs::create_dir_all(root.join("@scope").join("renamed")).unwrap();
        fs::create_dir_all(root.join("@scope").join("missing-index")).unwrap();
        fs::create_dir_all(root.join("nested").join("too-deep")).unwrap();
        fs::create_dir_all(root.join("_ignored")).unwrap();
        fs::write(
            root.join("top.js"),
            r#"/**
 * @description Top level plugin
 * @author neko
 * @link https://example.invalid/plugin
 */
"#,
        )
        .unwrap();
        fs::write(root.join("folder").join("index.js"), "").unwrap();
        fs::write(root.join("renamed.js_"), "").unwrap();
        fs::write(root.join("module.mjs"), "").unwrap();
        fs::write(root.join("common.cjs"), "").unwrap();
        fs::write(root.join("asset.css"), "").unwrap();
        fs::write(root.join("renamed-folder").join("index.js_"), "").unwrap();
        fs::create_dir_all(root.join("single-file-folder")).unwrap();
        fs::write(root.join("single-file-folder").join("Plugin.js"), "").unwrap();
        fs::create_dir_all(root.join("theme-folder")).unwrap();
        fs::write(root.join("theme-folder").join("InjectAcrylic.js"), "").unwrap();
        fs::write(root.join("theme-folder").join("InjectAcrylic.min.js"), "").unwrap();
        fs::create_dir_all(root.join("ambiguous-folder")).unwrap();
        fs::write(root.join("ambiguous-folder").join("one.js"), "").unwrap();
        fs::write(root.join("ambiguous-folder").join("two.js"), "").unwrap();
        fs::write(
            root.join("@scope").join("plugin").join("index.js"),
            r#"/**
 * @description Scoped plugin
 * @author user#1234
 * @link http://example.invalid/not-accepted
 */
"#,
        )
        .unwrap();
        fs::write(root.join("@scope").join("renamed").join("index.js_"), "").unwrap();
        fs::write(root.join("nested").join("too-deep").join("index.js"), "").unwrap();
        fs::write(root.join("_ignored").join("index.js"), "").unwrap();

        let mut plugins = Vec::new();
        collect_plugin_entries(&root, &BTreeSet::new(), &mut plugins).unwrap();
        plugins.sort_by(|left, right| left.entry.cmp(&right.entry));
        let top = plugins
            .iter()
            .find(|plugin| plugin.entry == "top.js")
            .unwrap();
        assert_eq!(top.description.as_deref(), Some("Top level plugin"));
        assert_eq!(top.name, "top");
        assert_eq!(top.author.as_deref(), Some("@neko"));
        assert_eq!(top.link.as_deref(), Some("https://example.invalid/plugin"));

        let scoped = plugins
            .iter()
            .find(|plugin| plugin.entry == "@scope/plugin/index.js")
            .unwrap();
        assert_eq!(scoped.description.as_deref(), Some("Scoped plugin"));
        assert_eq!(scoped.name, "@scope/plugin");
        assert_eq!(scoped.author.as_deref(), Some("user#1234"));
        assert_eq!(scoped.link, None);

        for entry in [
            "renamed.js",
            "renamed-folder/index.js",
            "@scope/renamed/index.js",
        ] {
            let plugin = plugins.iter().find(|plugin| plugin.entry == entry).unwrap();
            assert!(!plugin.enabled);
            assert!(plugin.path.ends_with('_'));
        }

        assert_eq!(
            plugins
                .iter()
                .find(|plugin| plugin.entry == "folder/index.js")
                .unwrap()
                .name,
            "folder"
        );
        assert_eq!(
            plugins
                .iter()
                .find(|plugin| plugin.entry == "theme-folder/injectacrylic.js")
                .unwrap()
                .name,
            "injectacrylic"
        );
        assert_eq!(
            plugins
                .iter()
                .find(|plugin| plugin.entry == "renamed.js")
                .unwrap()
                .name,
            "renamed"
        );

        let entries = plugins
            .into_iter()
            .map(|plugin| plugin.entry)
            .collect::<Vec<_>>();

        fs::remove_dir_all(root).unwrap();

        assert_eq!(
            entries,
            vec![
                "@scope/plugin/index.js".to_string(),
                "@scope/renamed/index.js".to_string(),
                "common.cjs".to_string(),
                "folder/index.js".to_string(),
                "module.mjs".to_string(),
                "renamed-folder/index.js".to_string(),
                "renamed.js".to_string(),
                "single-file-folder/plugin.js".to_string(),
                "theme-folder/injectacrylic.js".to_string(),
                "top.js".to_string(),
            ]
        );
    }

    #[test]
    fn relative_or_empty_plugin_dir_uses_default_folder() {
        let mut loader_config = config::LoaderConfig::default();

        loader_config.app.plugins_dir.clear();
        assert_eq!(
            configured_plugins_dir(&loader_config),
            config::plugins_dir()
        );

        loader_config.app.plugins_dir = "./plugins".into();
        assert_eq!(
            configured_plugins_dir(&loader_config),
            config::plugins_dir()
        );

        loader_config.app.plugins_dir = ".\\plugins".into();
        assert_eq!(
            configured_plugins_dir(&loader_config),
            config::plugins_dir()
        );

        let custom = std::env::temp_dir().join("maoloader-custom-plugins");
        loader_config.app.plugins_dir = custom.display().to_string();
        assert_eq!(configured_plugins_dir(&loader_config), custom);
    }
}
