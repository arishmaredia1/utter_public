use std::sync::Mutex;
use tauri::{tray::TrayIconBuilder, menu::{Menu, MenuItem}, Manager, Emitter};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState, Code, Modifiers};

mod env;
mod errors;
mod state;
mod mongo;
mod groq;
mod cmds;
mod audio_setup;

use crate::state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = dotenvy::dotenv();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        let _ = app.emit("global-record-toggle", shortcut.to_string());
                    }
                })
                .build(),
        )
        .manage(AppState { session: Mutex::new(None) })
        .invoke_handler(tauri::generate_handler![
            cmds::login,
            cmds::logout,
            cmds::get_secrets,
            cmds::list_recent,
            cmds::register_recording,
            cmds::transcribe_recording,
            cmds::audio_check_blackhole,
            cmds::audio_install_blackhole,
        ])
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "Show Utter", true, None::<&str>)?;
            let record = MenuItem::with_id(app, "record", "Start recording", true, Some("CmdOrCtrl+Shift+R"))?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&record, &show, &quit])?;
            let _ = TrayIconBuilder::new()
                .menu(&menu)
                .icon(app.default_window_icon().unwrap().clone())
                .on_menu_event(|app, ev| match ev.id.as_ref() {
                    "show" => { if let Some(w) = app.get_webview_window("main") { let _ = w.show(); let _ = w.set_focus(); } }
                    "record" => { let _ = app.emit("global-record-toggle", "menu"); }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            let shortcut = Shortcut::new(Some(Modifiers::SHIFT | Modifiers::META), Code::KeyR);
            app.global_shortcut().register(shortcut)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
