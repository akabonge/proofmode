from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str
    app_secret: str
    fernet_key: str
    cors_origins: str = "http://localhost:3000"
    admin_emails: str = "takemedancing@gmail.com"
    cookie_secure: bool = False
    cookie_domain: str | None = None
    session_cookie_name: str = "pm_session"
    csrf_cookie_name: str = "pm_csrf"
    cookie_domain: str | None = None
    token_ttl_minutes: int = 60 * 12

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
