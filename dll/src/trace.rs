use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

pub fn record(event: &str, fields: &[(&str, String)]) {
    let path = trace_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) else {
        return;
    };

    let _ = writeln!(file, "{}", format_record(event, fields));
}

pub fn trace_path() -> PathBuf {
    crate::config::loader_dir()
        .join("diagnostics")
        .join("core-trace.log")
}

fn format_record(event: &str, fields: &[(&str, String)]) -> String {
    let mut record = format!(
        "{{\"ts\":{},\"event\":\"{}\"",
        unix_millis(),
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
    }
}
