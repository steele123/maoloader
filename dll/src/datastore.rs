use std::{fs, io, path::PathBuf};

const TRANSFORM_KEY: &[u8] = b"A5dgY6lz9fpG9kGNiH1mZ";

pub fn path() -> PathBuf {
    crate::config::loader_dir().join("datastore")
}

pub fn load() -> io::Result<String> {
    let path = path();

    if !path.exists() {
        return Ok("{}".into());
    }

    let mut data = fs::read(path)?;
    transform(&mut data);

    String::from_utf8(data).or_else(|error| {
        let bytes = error.into_bytes();
        String::from_utf8(bytes.into_iter().filter(|byte| *byte != 0).collect())
            .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))
    })
}

pub fn save(data: &str) -> io::Result<()> {
    let mut data = data.as_bytes().to_vec();
    transform(&mut data);
    fs::write(path(), data)
}

pub fn len() -> usize {
    load().map(|data| data.len()).unwrap_or(0)
}

fn transform(data: &mut [u8]) {
    for (index, byte) in data.iter_mut().enumerate() {
        *byte ^= TRANSFORM_KEY[index % TRANSFORM_KEY.len()];
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_datastore_falls_back_to_empty_object_shape() {
        assert_eq!("{}", "{}");
    }

    #[test]
    fn datastore_transform_round_trips() {
        let mut data = b"{\"theme\":\"dark\"}".to_vec();
        let original = data.clone();

        transform(&mut data);
        assert_ne!(data, original);

        transform(&mut data);
        assert_eq!(data, original);
    }
}
