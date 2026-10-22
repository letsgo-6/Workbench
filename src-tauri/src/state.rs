use crate::{db::Db, paths::AppPaths};
#[derive(Default)]
pub struct Ready(pub std::sync::atomic::AtomicBool);
pub struct AppState {
    pub db: Db,
    pub paths: AppPaths,
    pub ai: crate::services::ai::AiService,
    pub secrets: crate::services::secrets::SecretStore,
    pub shortcuts: crate::desktop::shortcut::Shortcuts,
    pub credential_mutations: parking_lot::Mutex<()>,
    pub asset_mutations: parking_lot::Mutex<()>,
}
