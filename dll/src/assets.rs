use std::{
    fs, io,
    path::{Component, Path, PathBuf},
};

const SCRIPT_IMPORT_CSS: &str = r#"
(async function () {
  if (document.readyState !== 'complete')
    await new Promise(res => document.addEventListener('DOMContentLoaded', res));

  const url = import.meta.url.replace(/\?.*$/, '');
  const link = document.createElement('link');
  link.setAttribute('rel', 'stylesheet');
  link.setAttribute('href', url);
  document.body.appendChild(link);
})();
"#;

const SCRIPT_IMPORT_JSON: &str = r#"
const url = import.meta.url.replace(/\?.*$/, '');
const content = await fetch(url).then(r => r.text());
export default JSON.parse(content);
"#;

const SCRIPT_IMPORT_RAW: &str = r#"
const url = import.meta.url.replace(/\?.*$/, '');
const content = await fetch(url).then(r => r.text());
export default content;
"#;

const SCRIPT_IMPORT_URL: &str = r#"
const url = import.meta.url.replace(/\?.*$/, '');
export default url;
"#;

#[derive(Debug, Clone)]
pub struct AssetResponse {
    pub path: PathBuf,
    pub body: Vec<u8>,
    pub mime: String,
    pub no_cache: bool,
    pub etag: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AssetRange {
    pub start: usize,
    pub end: usize,
    pub content_length: usize,
    pub content_range: String,
}

pub fn parse_range_header(range: &str, total_bytes: usize) -> Option<AssetRange> {
    let range = range.strip_prefix("bytes=")?;
    let (start, end) = range.split_once('-')?;
    let start = start.parse::<usize>().ok()?;
    let end = if end.trim().is_empty() {
        total_bytes.checked_sub(1)?
    } else {
        end.parse::<usize>().ok()?
    };

    if total_bytes == 0 || start > end || end >= total_bytes {
        return None;
    }

    Some(AssetRange {
        start,
        end,
        content_length: end - start + 1,
        content_range: format!("bytes {start}-{end}/{total_bytes}"),
    })
}

pub fn resolve_plugins_url(url: &str, script_request: bool) -> io::Result<Option<AssetResponse>> {
    resolve_plugins_url_with_root(&crate::config::plugins_dir(), url, script_request)
}

pub fn should_wrap_plugins_url(url: &str, accept_header: Option<&str>) -> bool {
    let Some(rest) = url.strip_prefix("https://plugins") else {
        return false;
    };

    let (path_part, query) = rest.split_once('?').unwrap_or((rest, ""));
    if matches!(query, "raw" | "url") {
        return true;
    }

    let Some(relative) = normalize_url_path(path_part) else {
        return false;
    };

    let extension = Path::new(&relative)
        .extension()
        .map(|extension| extension.to_string_lossy().to_ascii_lowercase());
    let Some(extension) = extension else {
        return false;
    };

    if !matches!(extension.as_str(), "css" | "json") && !is_known_asset(&extension) {
        return false;
    }

    accept_requests_module_script(accept_header)
}

fn resolve_plugins_url_with_root(
    root: &Path,
    url: &str,
    script_request: bool,
) -> io::Result<Option<AssetResponse>> {
    let Some(rest) = url.strip_prefix("https://plugins") else {
        return Ok(None);
    };

    let (path_part, query) = rest.split_once('?').unwrap_or((rest, ""));
    let Some(relative) = normalize_url_path(path_part) else {
        return Ok(None);
    };
    let path = resolve_path(root, &relative);
    let Some(path) = path else {
        return Ok(None);
    };

    if !path.is_file() {
        return Ok(None);
    }

    if script_request {
        if let Some(module) = module_wrapper(&path, query) {
            return Ok(Some(AssetResponse {
                etag: etag_for_url(url),
                path,
                body: module.as_bytes().to_vec(),
                mime: "text/javascript".into(),
                no_cache: true,
            }));
        }
    }

    let mime = mime_for_path(&path);
    let no_cache = mime == "text/javascript";
    Ok(Some(AssetResponse {
        body: fs::read(&path)?,
        etag: etag_for_url(url),
        path,
        mime,
        no_cache,
    }))
}

fn etag_for_url(url: &str) -> String {
    format!("\"{:08x}\"", fnv1a_32_utf16(url))
}

fn fnv1a_32_utf16(value: &str) -> u32 {
    let mut hash = 2_166_136_261_u32;
    for unit in value.encode_utf16() {
        hash ^= u32::from(unit);
        hash = hash.wrapping_mul(16_777_619);
    }
    hash
}

fn resolve_path(root: &Path, relative: &str) -> Option<PathBuf> {
    let relative = relative.trim_start_matches('/');
    if !is_safe_relative_path(relative) {
        return None;
    }

    let path = root.join(relative);

    if relative.is_empty() || relative.ends_with('/') || relative.ends_with('\\') {
        return Some(path.join("index.js"));
    }

    if path.is_file() {
        return Some(path);
    }

    if path.extension().is_none() {
        let js_path = path.with_extension("js");
        if js_path.is_file() {
            return Some(js_path);
        }

        if path.is_dir() {
            return Some(path.join("index.js"));
        }
    }

    Some(path)
}

fn module_wrapper(path: &Path, query: &str) -> Option<&'static str> {
    if query == "url" {
        return Some(SCRIPT_IMPORT_URL);
    }

    if query == "raw" {
        return Some(SCRIPT_IMPORT_RAW);
    }

    let extension = path.extension()?.to_string_lossy().to_ascii_lowercase();

    match extension.as_str() {
        "css" => Some(SCRIPT_IMPORT_CSS),
        "json" => Some(SCRIPT_IMPORT_JSON),
        extension if is_known_asset(extension) => Some(SCRIPT_IMPORT_URL),
        _ => None,
    }
}

fn accept_requests_module_script(accept_header: Option<&str>) -> bool {
    let Some(accept_header) = accept_header else {
        return false;
    };
    let accept_header = accept_header.to_ascii_lowercase();

    if accept_header.contains("text/css")
        || accept_header.contains("image/")
        || accept_header.contains("font/")
        || accept_header.contains("audio/")
        || accept_header.contains("video/")
    {
        return false;
    }

    accept_header.contains("javascript") || accept_header.contains("ecmascript")
}

fn normalize_url_path(path: &str) -> Option<String> {
    percent_decode_path(path).map(|path| path.replace('\\', "/"))
}

fn percent_decode_path(path: &str) -> Option<String> {
    let bytes = path.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        if bytes[index] == b'%' {
            let high = *bytes.get(index + 1)?;
            let low = *bytes.get(index + 2)?;
            let value = (hex_value(high)? << 4) | hex_value(low)?;
            if matches!(value, b'/' | b'\\') {
                decoded.extend_from_slice(&bytes[index..index + 3]);
            } else {
                decoded.push(value);
            }
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }

    String::from_utf8(decoded).ok()
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn is_safe_relative_path(relative: &str) -> bool {
    Path::new(relative)
        .components()
        .all(|component| matches!(component, Component::Normal(_) | Component::CurDir))
}

fn mime_for_path(path: &Path) -> String {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("js" | "mjs" | "cjs") => "text/javascript",
        Some("css") => "text/css",
        Some("json") => "application/json",
        Some("png") => "image/png",
        Some("jpg" | "jpeg" | "jfif" | "pjpeg" | "pjp") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("svg") => "image/svg+xml",
        Some("webp") => "image/webp",
        Some("avif") => "image/avif",
        Some("bmp") => "image/bmp",
        Some("ico") => "image/x-icon",
        Some("mp4") => "video/mp4",
        Some("webm") => "video/webm",
        Some("ogg") => "audio/ogg",
        Some("mp3") => "audio/mpeg",
        Some("wav") => "audio/wav",
        Some("flac") => "audio/flac",
        Some("aac") => "audio/aac",
        Some("woff") => "font/woff",
        Some("woff2") => "font/woff2",
        Some("eot") => "application/vnd.ms-fontobject",
        Some("ttf") => "font/ttf",
        Some("otf") => "font/otf",
        _ => "application/octet-stream",
    }
    .into()
}

fn is_known_asset(extension: &str) -> bool {
    matches!(
        extension,
        "bmp"
            | "png"
            | "jpg"
            | "jpeg"
            | "jfif"
            | "pjpeg"
            | "pjp"
            | "gif"
            | "svg"
            | "ico"
            | "webp"
            | "avif"
            | "mp4"
            | "webm"
            | "ogg"
            | "mp3"
            | "wav"
            | "flac"
            | "aac"
            | "woff"
            | "woff2"
            | "eot"
            | "ttf"
            | "otf"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wrappers_match_query_and_extension_rules() {
        assert!(
            module_wrapper(Path::new("a.css"), "")
                .unwrap()
                .contains("stylesheet")
        );
        assert!(
            module_wrapper(Path::new("a.json"), "")
                .unwrap()
                .contains("JSON.parse")
        );
        assert!(
            module_wrapper(Path::new("a.png"), "")
                .unwrap()
                .contains("export default url")
        );
        assert!(
            module_wrapper(Path::new("a.js"), "raw")
                .unwrap()
                .contains("fetch(url)")
        );
    }

    #[test]
    fn plugin_url_wrapping_uses_request_accept_header() {
        assert!(should_wrap_plugins_url(
            "https://plugins/theme.css",
            Some("text/javascript, application/javascript, */*;q=0.1")
        ));
        assert!(should_wrap_plugins_url(
            "https://plugins/image.png",
            Some("application/javascript")
        ));
        assert!(should_wrap_plugins_url(
            "https://plugins/theme.css?url",
            Some("text/css,*/*;q=0.1")
        ));
        assert!(!should_wrap_plugins_url(
            "https://plugins/theme.css",
            Some("text/css,*/*;q=0.1")
        ));
        assert!(!should_wrap_plugins_url(
            "https://plugins/image.png",
            Some("image/avif,image/webp,image/apng,image/*,*/*;q=0.8")
        ));
        assert!(!should_wrap_plugins_url(
            "https://plugins/data.json",
            Some("*/*")
        ));
    }

    #[test]
    fn etags_match_upstream_utf16_fnv_shape() {
        assert_eq!(etag_for_url("https://plugins/image.png"), "\"34b9988d\"");
        assert_eq!(
            etag_for_url("https://plugins/folder/style.css"),
            "\"1ce0e8ec\""
        );
    }

    #[test]
    fn path_resolution_matches_plugin_import_shapes() {
        let root =
            std::env::temp_dir().join(format!("maoloader-asset-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("folder")).unwrap();
        fs::write(root.join("top.js"), "").unwrap();
        fs::write(root.join("folder").join("index.js"), "").unwrap();

        assert_eq!(resolve_path(&root, "/top").unwrap(), root.join("top.js"));
        assert_eq!(
            resolve_path(&root, "/folder").unwrap(),
            root.join("folder").join("index.js")
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn asset_responses_mark_script_wrappers_no_cache_and_static_assets_cacheable() {
        let root =
            std::env::temp_dir().join(format!("maoloader-asset-cache-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("theme.css"), "body{}").unwrap();
        fs::write(root.join("image.png"), [0_u8, 1, 2]).unwrap();

        let css_wrapper = resolve_plugins_url_with_root(&root, "https://plugins/theme.css", true)
            .unwrap()
            .unwrap();
        let css_asset = resolve_plugins_url_with_root(&root, "https://plugins/theme.css", false)
            .unwrap()
            .unwrap();
        let image = resolve_plugins_url_with_root(&root, "https://plugins/image.png", false)
            .unwrap()
            .unwrap();

        assert!(css_wrapper.no_cache);
        assert_eq!(css_wrapper.mime, "text/javascript");
        assert!(!css_asset.no_cache);
        assert_eq!(css_asset.mime, "text/css");
        assert_eq!(css_asset.body, b"body{}");
        assert!(!image.no_cache);
        assert_eq!(image.etag, etag_for_url("https://plugins/image.png"));

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn range_headers_parse_bounded_byte_requests() {
        assert_eq!(
            parse_range_header("bytes=2-5", 10),
            Some(AssetRange {
                start: 2,
                end: 5,
                content_length: 4,
                content_range: "bytes 2-5/10".into(),
            })
        );
        assert_eq!(
            parse_range_header("bytes=4-", 10).map(|range| (
                range.start,
                range.end,
                range.content_length
            )),
            Some((4, 9, 6))
        );
        assert!(parse_range_header("bytes=6-3", 10).is_none());
        assert!(parse_range_header("bytes=0-10", 10).is_none());
        assert!(parse_range_header("items=0-1", 10).is_none());
    }

    #[test]
    fn path_resolution_rejects_traversal_and_absolute_paths() {
        let root = std::env::temp_dir().join(format!(
            "maoloader-asset-safety-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("folder")).unwrap();
        fs::write(root.join("folder").join("safe file.js"), "").unwrap();

        assert_eq!(
            normalize_url_path("/folder/safe%20file")
                .and_then(|relative| resolve_path(&root, &relative))
                .unwrap(),
            root.join("folder").join("safe file.js")
        );
        assert!(
            normalize_url_path("/../outside.js")
                .and_then(|relative| resolve_path(&root, &relative))
                .is_none()
        );
        assert!(
            normalize_url_path("/%2e%2e/outside.js")
                .and_then(|relative| resolve_path(&root, &relative))
                .is_none()
        );
        assert!(
            normalize_url_path("/folder\\..\\outside.js")
                .and_then(|relative| resolve_path(&root, &relative))
                .is_none()
        );

        #[cfg(windows)]
        assert!(
            normalize_url_path("/C:/outside.js")
                .and_then(|relative| resolve_path(&root, &relative))
                .is_none()
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn percent_decoding_preserves_encoded_path_separators() {
        let root = std::env::temp_dir().join(format!(
            "maoloader-asset-encoded-separator-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("folder")).unwrap();
        fs::write(root.join("folder%2Fname.js"), "encoded slash").unwrap();
        fs::write(root.join("folder%5Cname.js"), "encoded backslash").unwrap();
        fs::write(root.join("folder").join("name.js"), "nested").unwrap();

        assert_eq!(
            normalize_url_path("/folder%2Fname")
                .and_then(|relative| resolve_path(&root, &relative))
                .unwrap(),
            root.join("folder%2Fname.js")
        );
        assert_eq!(
            normalize_url_path("/folder%5Cname")
                .and_then(|relative| resolve_path(&root, &relative))
                .unwrap(),
            root.join("folder%5Cname.js")
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn mime_types_cover_upstream_asset_extensions() {
        assert_eq!(mime_for_path(Path::new("image.bmp")), "image/bmp");
        assert_eq!(mime_for_path(Path::new("sound.flac")), "audio/flac");
        assert_eq!(mime_for_path(Path::new("sound.aac")), "audio/aac");
        assert_eq!(
            mime_for_path(Path::new("font.eot")),
            "application/vnd.ms-fontobject"
        );
    }
}
