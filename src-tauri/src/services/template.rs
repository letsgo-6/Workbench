use regex::Regex;
use std::{collections::HashMap, sync::LazyLock};
// run() forces this startup invariant before registering any IPC handler.
static VARIABLE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\{\{\s*([^{}\n]+?)\s*\}\}").expect("static template regex must compile")
});
/// Extract unique variable names in order of first occurrence.
pub fn variables(body: &str) -> Vec<String> {
    let mut result = vec![];
    for cap in VARIABLE.captures_iter(body) {
        let name = cap[1].trim().to_string();
        if !name.is_empty() && !result.contains(&name) {
            result.push(name);
        }
    }
    result
}
/// Preserve unfilled placeholders, including their original whitespace.
pub fn render(body: &str, values: &HashMap<String, String>) -> String {
    VARIABLE
        .replace_all(body, |caps: &regex::Captures<'_>| {
            values
                .get(caps[1].trim())
                .filter(|s| !s.is_empty())
                .cloned()
                .unwrap_or_else(|| caps[0].to_string())
        })
        .into_owned()
}
