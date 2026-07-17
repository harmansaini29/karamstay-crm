from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.settings.models import Setting


class SettingsRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, key: str) -> str | None:
        statement = select(Setting.value).where(Setting.key == key)
        return self.db.scalar(statement)

    def get_all(self, keys: list[str]) -> dict[str, str]:
        statement = select(Setting.key, Setting.value).where(Setting.key.in_(keys))
        return dict(self.db.execute(statement).all())

    def set(self, key: str, value: str) -> None:
        setting = self.db.scalar(select(Setting).where(Setting.key == key))
        if setting is None:
            self.db.add(Setting(key=key, value=value))
        else:
            setting.value = value
