pub mod commands;
pub mod db;
pub mod desktop;
pub mod domain;
pub mod error;
pub mod events;
pub mod paths;
pub mod repo;
pub mod services;
pub mod startup;
pub mod state;
use tauri::{Emitter, Manager};
/// Start the desktop application and its offline database.
pub fn run() {
    startup::probe("rust-entry");
    // Compile the fixed template pattern at startup; an invalid built-in is unrecoverable.
    let _ = services::template::variables("");
    let result = tauri::Builder::default()
        .manage(state::Ready::default())
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            let _ = desktop::windows::show_main(app);
        }))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_denylist(&["quick"])
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::MAXIMIZED,
                )
                .build(),
        )
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Warn)
                .filter(|metadata| metadata.target() == "workbench")
                .targets([tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("workbench".into()),
                    },
                )])
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .on_page_load(|webview, payload| {
            if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                startup::probe(&format!("{}-page-loaded", webview.label()));
            }
        })
        .on_window_event(|window, event| {
            if window.label() == "quick" && matches!(event, tauri::WindowEvent::Focused(false)) {
                let _ = window.hide();
            }
            if window.label() == "main"
                && window.app_handle().tray_by_id("workbench").is_some()
                && let tauri::WindowEvent::CloseRequested { api, .. } = event
                && let Some(state) = window.app_handle().try_state::<state::AppState>()
                && state
                    .db
                    .with_conn(repo::settings::get_all)
                    .is_ok_and(|s| s.general_close_to_tray)
            {
                api.prevent_close();
                if window.hide().is_ok() {
                    let _ = window.emit("main-window-visibility", false);
                }
            }
        })
        .setup(|app| {
            startup::probe("setup-start");
            let paths =
                paths::AppPaths::resolve(app.path().app_config_dir()?, app.path().app_data_dir()?)?;
            let db = db::Db::open(&paths.db_path, &paths.backups_dir)?;
            startup::probe("database-ready");
            app.asset_protocol_scope()
                .allow_directory(&paths.assets_dir, true)?;
            services::assets::maintenance(
                &db,
                &paths.assets_dir,
                chrono::Utc::now().timestamp_millis(),
            )?;
            db.with_tx(services::ai::actions::seed_system_templates)?;
            let settings = db.with_conn(repo::settings::get_all)?;
            let ai = services::ai::AiService::new(&settings.network_proxy)?;
            let cleanup_db = db.clone();
            let cleanup_assets = paths.assets_dir.clone();
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(86400)).await;
                    let cleanup_db = cleanup_db.clone();
                    let assets = cleanup_assets.clone();
                    let result = tauri::async_runtime::spawn_blocking(move || {
                        services::assets::maintenance(
                            &cleanup_db,
                            &assets,
                            chrono::Utc::now().timestamp_millis(),
                        )
                    })
                    .await;
                    if matches!(result, Ok(Ok(()))) {
                        let _ = events::emit_data_changed(&handle, "all", "purge");
                    }
                }
            });
            app.manage(state::AppState {
                db,
                paths,
                ai,
                secrets: services::secrets::SecretStore::default(),
                shortcuts: desktop::shortcut::Shortcuts::default(),
                credential_mutations: parking_lot::Mutex::new(()),
                asset_mutations: parking_lot::Mutex::new(()),
            });
            let state = app.state::<state::AppState>();
            // An occupied/invalid user shortcut is recoverable and visible in settings.
            let _ = desktop::shortcut::update(
                app.handle(),
                &state,
                &settings.shortcut_quick_capture,
                false,
            );
            if desktop::tray::create(app.handle()).is_err() {
                log::warn!(target:"workbench","Tray initialization failed");
            }
            app.state::<state::Ready>()
                .0
                .store(true, std::sync::atomic::Ordering::Release);
            desktop::background::start(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::materials::material_list,
            commands::materials::material_get,
            commands::materials::material_create,
            commands::materials::material_update,
            commands::materials::material_set_starred,
            commands::materials::material_delete,
            commands::materials::material_import_files,
            commands::materials::material_import_bytes,
            commands::materials::asset_set_thumbnail,
            commands::materials::asset_reorder,
            commands::materials::asset_delete,
            commands::materials::material_set_cover,
            commands::materials::assets_usage,
            commands::materials::material_discard_empty,
            commands::ideas::idea_list,
            commands::ideas::idea_get,
            commands::ideas::idea_create,
            commands::ideas::idea_update,
            commands::ideas::idea_set_starred,
            commands::ideas::idea_delete,
            commands::todos::todo_list,
            commands::todos::todo_get,
            commands::todos::todo_create,
            commands::todos::todo_update,
            commands::todos::todo_set_starred,
            commands::todos::todo_delete,
            commands::tips::tip_list,
            commands::tips::tip_get,
            commands::tips::tip_create,
            commands::tips::tip_update,
            commands::tips::tip_set_starred,
            commands::tips::tip_delete,
            commands::skills::skill_list,
            commands::skills::skill_get,
            commands::skills::skill_create,
            commands::skills::skill_update,
            commands::skills::skill_set_starred,
            commands::skills::skill_delete,
            commands::prompts::prompt_list,
            commands::prompts::prompt_get,
            commands::prompts::prompt_create,
            commands::prompts::prompt_update,
            commands::prompts::prompt_set_starred,
            commands::prompts::prompt_delete,
            commands::ideas::idea_convert,
            commands::todos::todo_toggle_done,
            commands::prompts::prompt_record_use,
            commands::prompts::prompt_categories,
            commands::skills::skill_parse_markdown,
            commands::skills::skill_read_md_file,
            commands::skills::skill_export_md,
            commands::skills::skill_export_folder,
            commands::skills::link_fetch_title,
            commands::app::app_info,
            commands::app::app_ready,
            commands::settings::settings_get_all,
            commands::settings::settings_set,
            commands::tags::tag_list,
            commands::tags::tag_rename,
            commands::tags::tag_delete,
            commands::tags::tag_set_color,
            commands::search::search_query,
            commands::trash::trash_list,
            commands::trash::trash_restore,
            commands::trash::trash_purge,
            commands::trash::trash_empty,
            commands::home::home_overview,
            commands::capture::capture_analyze,
            commands::capture::capture_analyze_stream,
            commands::capture::capture_commit,
            commands::capture::capture_undo,
            commands::data::entity_bulk_delete,
            commands::data::entity_bulk_add_tags,
            commands::providers::provider_list,
            commands::providers::provider_save,
            commands::providers::provider_delete,
            commands::providers::provider_set_default,
            commands::providers::provider_test,
            commands::providers::provider_fetch_models,
            commands::ai::ai_run_action,
            commands::ai::ai_chat,
            commands::ai::ai_cancel,
            commands::ai::ai_template_list,
            commands::ai::ai_template_reset,
            commands::ai::ai_parse_result,
            commands::data::data_export_json,
            commands::data::data_export_backup,
            commands::data::data_import_json,
            commands::data::data_open_dir,
            commands::data::data_change_dir,
            commands::desktop::shortcut_status,
            commands::desktop::shortcut_update,
            commands::desktop::window_show_main,
            commands::desktop::desktop_set_labels,
            commands::desktop::quick_sync_window,
            commands::todos::todo_children,
            commands::todos::todo_create_batch,
            commands::ideas::idea_calendar,
            commands::history::prompt_version_list,
            commands::history::prompt_version_create,
            commands::history::prompt_version_restore,
            commands::history::ai_conversation_list,
            commands::history::ai_conversation_get,
            commands::history::ai_conversation_rename,
            commands::history::ai_conversation_delete,
            commands::skills::skill_scan_folder,
            commands::skills::skill_import_batch,
            commands::skills::skill_fetch_remote,
            commands::backups::backup_list,
            commands::backups::backup_now,
            commands::backups::backup_restore,
            commands::data::data_export_markdown
        ])
        .run(tauri::generate_context!());
    // Startup cannot recover without its WebView or database; surface the actual failure.
    if let Err(error) = result {
        eprintln!("Workbench startup failed: {error}");
        std::process::exit(1);
    }
}
#[cfg(test)]
mod tests;
