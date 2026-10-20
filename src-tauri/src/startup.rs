use std::{
    fs::OpenOptions,
    io::Write,
    time::{SystemTime, UNIX_EPOCH},
};
/// Record optional startup timing only for explicitly instrumented test runs.
pub fn probe(stage: &str) {
    if let Some(path) = std::env::var_os("WORKBENCH_STARTUP_TRACE")
        && let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path)
    {
        let millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        let _ = writeln!(file, "{}|{}|{}", std::process::id(), millis, stage);
    }
}
