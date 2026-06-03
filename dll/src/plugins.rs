use crate::config;
use std::{fs, io, path::Path};

pub fn entries() -> io::Result<Vec<String>> {
    entries_from_dir(&config::plugins_dir())
}

fn entries_from_dir(plugins_dir: &Path) -> io::Result<Vec<String>> {
    let mut entries = Vec::new();

    if !plugins_dir.is_dir() {
        return Ok(entries);
    }

    for entry in fs::read_dir(plugins_dir)? {
        let entry = entry?;
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };

        if should_skip(name) {
            continue;
        }

        if path.is_file() && is_top_level_plugin_file(&path) {
            entries.push(name.to_string());
        } else if path.is_dir() && name.starts_with('@') {
            collect_scoped_entries(plugins_dir, &path, &mut entries)?;
        } else if path.is_dir() {
            if let Some(entry) = plugin_entry_path(&path)? {
                let relative = entry.strip_prefix(plugins_dir).unwrap_or(&entry);
                entries.push(normalize_entry(relative));
            }
        }
    }

    entries.sort();
    Ok(entries)
}

fn collect_scoped_entries(
    plugins_dir: &Path,
    scope_dir: &Path,
    entries: &mut Vec<String>,
) -> io::Result<()> {
    for entry in fs::read_dir(scope_dir)? {
        let entry = entry?;
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };

        if should_skip(name) {
            continue;
        }

        if path.is_dir() {
            let Some(entry) = plugin_entry_path(&path)? else {
                continue;
            };
            let relative = entry.strip_prefix(plugins_dir).unwrap_or(&entry);
            entries.push(normalize_entry(relative));
        }
    }

    Ok(())
}

fn plugin_entry_path(dir: &Path) -> io::Result<Option<std::path::PathBuf>> {
    let index = dir.join("index.js");
    if index.is_file() {
        return Ok(Some(index));
    }

    let candidates = fs::read_dir(dir)?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_file() && is_top_level_plugin_file(path))
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| !name.to_ascii_lowercase().ends_with(".min.js"))
        })
        .collect::<Vec<_>>();

    Ok((candidates.len() == 1).then(|| candidates[0].clone()))
}

fn should_skip(name: &str) -> bool {
    name.starts_with('_') || name.starts_with('.')
}

fn is_top_level_plugin_file(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|extension| extension.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("js" | "mjs" | "cjs")
    )
}

fn normalize_entry(path: &Path) -> String {
    path.display().to_string().replace('\\', "/")
}

pub fn fnv1a_hex(entry: &str) -> String {
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
    fn hash_is_stable_for_normalized_entries() {
        assert_eq!(fnv1a_hex("Plugin\\Index.js"), fnv1a_hex("plugin/index.js"));
    }

    #[test]
    fn entry_rules_match_penguloader_shapes() {
        let root =
            std::env::temp_dir().join(format!("maoloader-plugin-test-{}", std::process::id()));

        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("folder")).unwrap();
        fs::create_dir_all(root.join("@scope").join("plugin")).unwrap();
        fs::create_dir_all(root.join("@scope").join("missing-index")).unwrap();
        fs::create_dir_all(root.join("_ignored")).unwrap();
        fs::write(root.join("top.js"), "").unwrap();
        fs::write(root.join("module.mjs"), "").unwrap();
        fs::write(root.join("common.cjs"), "").unwrap();
        fs::write(root.join("asset.css"), "").unwrap();
        fs::write(root.join("folder").join("index.js"), "").unwrap();
        fs::create_dir_all(root.join("single-file-folder")).unwrap();
        fs::write(root.join("single-file-folder").join("Plugin.js"), "").unwrap();
        fs::create_dir_all(root.join("theme-folder")).unwrap();
        fs::write(root.join("theme-folder").join("InjectAcrylic.js"), "").unwrap();
        fs::write(root.join("theme-folder").join("InjectAcrylic.min.js"), "").unwrap();
        fs::create_dir_all(root.join("ambiguous-folder")).unwrap();
        fs::write(root.join("ambiguous-folder").join("one.js"), "").unwrap();
        fs::write(root.join("ambiguous-folder").join("two.js"), "").unwrap();
        fs::write(root.join("@scope").join("plugin").join("index.js"), "").unwrap();
        fs::write(root.join("_ignored").join("index.js"), "").unwrap();

        let entries = entries_from_dir(&root).unwrap();
        fs::remove_dir_all(root).unwrap();

        assert_eq!(
            entries,
            vec![
                "@scope/plugin/index.js".to_string(),
                "common.cjs".to_string(),
                "folder/index.js".to_string(),
                "module.mjs".to_string(),
                "single-file-folder/Plugin.js".to_string(),
                "theme-folder/InjectAcrylic.js".to_string(),
                "top.js".to_string(),
            ]
        );
    }
}
