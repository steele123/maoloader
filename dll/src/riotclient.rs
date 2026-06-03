use std::sync::{OnceLock, RwLock};

#[derive(Debug, Clone, Default)]
pub struct Credentials {
    pub origin: String,
    pub authorization: String,
}

static CREDENTIALS: OnceLock<RwLock<Option<Credentials>>> = OnceLock::new();

pub fn set_credentials(port: &str, token: &str) {
    if port.trim().is_empty() || token.trim().is_empty() {
        return;
    }

    let credentials = Credentials {
        origin: format!("https://127.0.0.1:{}", port.trim()),
        authorization: format!(
            "Basic {}",
            base64_encode(format!("riot:{token}").as_bytes())
        ),
    };

    let lock = CREDENTIALS.get_or_init(|| RwLock::new(None));
    if let Ok(mut guard) = lock.write() {
        *guard = Some(credentials);
    }
}

pub fn credentials() -> Option<Credentials> {
    CREDENTIALS
        .get_or_init(|| RwLock::new(None))
        .read()
        .ok()
        .and_then(|guard| guard.clone())
}

pub fn credentials_ready() -> bool {
    credentials().is_some()
}

pub fn target_url(proxy_url: &str) -> Option<String> {
    let credentials = credentials()?;
    rewrite_url(proxy_url, &credentials.origin)
}

fn rewrite_url(proxy_url: &str, origin: &str) -> Option<String> {
    let suffix = proxy_url.strip_prefix("https://riotclient")?;
    Some(format!("{origin}{suffix}"))
}

fn base64_encode(data: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    let mut output = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0];
        let b1 = *chunk.get(1).unwrap_or(&0);
        let b2 = *chunk.get(2).unwrap_or(&0);

        output.push(ALPHABET[(b0 >> 2) as usize] as char);
        output.push(ALPHABET[(((b0 & 0b0000_0011) << 4) | (b1 >> 4)) as usize] as char);

        if chunk.len() > 1 {
            output.push(ALPHABET[(((b1 & 0b0000_1111) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            output.push('=');
        }

        if chunk.len() > 2 {
            output.push(ALPHABET[(b2 & 0b0011_1111) as usize] as char);
        } else {
            output.push('=');
        }
    }

    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_matches_riot_auth_shape() {
        assert_eq!(base64_encode(b"riot:token"), "cmlvdDp0b2tlbg==");
    }

    #[test]
    fn riotclient_url_rewrite_preserves_path_and_query() {
        assert_eq!(
            rewrite_url(
                "https://riotclient/product-session/v1/external-sessions?x=1",
                "https://127.0.0.1:1234"
            )
            .as_deref(),
            Some("https://127.0.0.1:1234/product-session/v1/external-sessions?x=1")
        );
    }

    #[test]
    fn riotclient_url_rewrite_handles_root() {
        assert_eq!(
            rewrite_url("https://riotclient", "https://127.0.0.1:1234").as_deref(),
            Some("https://127.0.0.1:1234")
        );
    }

    #[test]
    fn riotclient_url_rewrite_rejects_other_domains() {
        assert!(rewrite_url("https://plugins/foo.js", "https://127.0.0.1:1234").is_none());
    }
}
