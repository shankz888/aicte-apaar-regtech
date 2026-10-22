from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = (
        "postgresql+psycopg://postgres:postgres@localhost:5432/aicte_verification"
    )
    upload_dir: str = "uploads"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def uploads_path(self) -> Path:
        p = Path(self.upload_dir)
        if not p.is_absolute():
            # Resolve relative to project backend root
            backend_root = Path(__file__).resolve().parent.parent.parent
            p = backend_root / p
        p.mkdir(parents=True, exist_ok=True)
        return p


settings = Settings()
