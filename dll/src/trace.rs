use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    sync::OnceLock,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

const MAX_TRACE_BYTES: u64 = 1024 * 1024;
static SESSION_ID: OnceLock<String> = OnceLock::new();

pub fn record(event: &str, fields: &[(&str, String)]) {
    let path = trace_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    rotate_trace_if_needed(&path);

    let record = format_record(event, fields);
    let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) else {
        return;
    };

    let _ = writeln!(file, "{record}");
    let _ = fs::write(latest_path(), record);
}

pub fn trace_path() -> PathBuf {
    diagnostics_dir().join("core-trace.log")
}

pub fn latest_path() -> PathBuf {
    diagnostics_dir().join("latest.json")
}

fn rotated_trace_path() -> PathBuf {
    diagnostics_dir().join("core-trace.1.log")
}

fn diagnostics_dir() -> PathBuf {
    crate::config::loader_dir().join("diagnostics")
}

fn format_record(event: &str, fields: &[(&str, String)]) -> String {
    let mut record = format!(
        "{{\"ts\":{},\"session\":\"{}\",\"pid\":{},\"event\":\"{}\"",
        unix_millis(),
        escape_json(session_id()),
        std::process::id(),
        escape_json(event)
    );

    for (key, value) in fields {
        record.push_str(&format!(
            ",\"{}\":\"{}\"",
            escape_json(key),
            escape_json(value)
        ));
    }

    record.push('}');
    record
}

fn rotate_trace_if_needed(path: &PathBuf) {
    let Ok(metadata) = fs::metadata(path) else {
        return;
    };

    if metadata.len() < MAX_TRACE_BYTES {
        return;
    }

    let _ = fs::remove_file(rotated_trace_path());
    let _ = fs::rename(path, rotated_trace_path());
}

fn session_id() -> &'static str {
    SESSION_ID.get_or_init(|| {
        format!(
            "{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or(Duration::ZERO)
                .as_millis()
        )
    })
}

fn unix_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn escape_json(value: &str) -> String {
    let mut escaped = String::new();
    for ch in value.chars() {
        match ch {
            '"' => escaped.push_str("\\\""),
            '\\' => escaped.push_str("\\\\"),
            '\n' => escaped.push_str("\\n"),
            '\r' => escaped.push_str("\\r"),
            '\t' => escaped.push_str("\\t"),
            ch if ch.is_control() => escaped.push_str(&format!("\\u{:04x}", ch as u32)),
            ch => escaped.push(ch),
        }
    }
    escaped
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trace_records_escape_json_values() {
        let record = format_record("core\"init", &[("path", "C:\\League\ncore.dll".into())]);

        assert!(record.contains("\"event\":\"core\\\"init\""));
        assert!(record.contains("\"path\":\"C:\\\\League\\ncore.dll\""));
        assert!(record.contains("\"session\":\""));
        assert!(record.contains("\"pid\":"));
    }
}
