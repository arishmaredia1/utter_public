use std::sync::Mutex;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct Session {
    pub token: String,
}

pub struct AppState {
    pub session: Mutex<Option<Session>>,
}

impl AppState {
    pub fn issue_session(&self) -> String {
        let token = Uuid::new_v4().to_string();
        *self.session.lock().expect("session lock") = Some(Session { token: token.clone() });
        token
    }
    pub fn validate(&self, token: &str) -> bool {
        let g = self.session.lock().expect("session lock");
        match &*g {
            Some(s) => s.token == token,
            None => false,
        }
    }
    pub fn clear(&self) {
        *self.session.lock().expect("session lock") = None;
    }
}
