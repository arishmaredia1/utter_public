use std::sync::Mutex;

mod env;
mod errors;
mod state;
mod mongo;
mod groq;
mod cmds;

use crate::state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = dotenvy::dotenv();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState { session: Mutex::new(None) })
        .invoke_handler(tauri::generate_handler![
            cmds::login,
            cmds::logout,
            cmds::get_secrets,
            cmds::list_recent,
            cmds::register_recording,
            cmds::transcribe_recording,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
