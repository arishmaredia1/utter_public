use std::sync::Mutex;

mod env;
mod errors;
mod state;
mod mongo;
mod groq;

use crate::state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = dotenvy::dotenv();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState { session: Mutex::new(None) })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
