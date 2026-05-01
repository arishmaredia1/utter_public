use std::env;

#[derive(Clone, Debug)]
pub struct EnvConfig {
    pub admin_username: String,
    pub admin_password: String,
    pub mongodb_uri: String,
    pub r2_account_id: String,
    pub r2_access_key_id: String,
    pub r2_secret_access_key: String,
    pub r2_bucket: String,
    pub groq_api_key: String,
}

#[derive(Debug, thiserror::Error)]
pub enum EnvError {
    #[error("missing env var: {0}")]
    Missing(&'static str),
}

fn req(name: &'static str) -> Result<String, EnvError> {
    env::var(name).map_err(|_| EnvError::Missing(name))
}

impl EnvConfig {
    pub fn load() -> Result<Self, EnvError> {
        Ok(Self {
            admin_username:        req("ADMIN_USERNAME")?,
            admin_password:        req("ADMIN_PASSWORD")?,
            mongodb_uri:           req("MONGODB_URI")?,
            r2_account_id:         req("R2_ACCOUNT_ID")?,
            r2_access_key_id:      req("R2_ACCESS_KEY_ID")?,
            r2_secret_access_key:  req("R2_SECRET_ACCESS_KEY")?,
            r2_bucket:             req("R2_BUCKET")?,
            groq_api_key:          req("GROQ_API_KEY")?,
        })
    }
}
