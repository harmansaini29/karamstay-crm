import json
from typing import Any

from sqlalchemy.orm import Session

from app.core.security import utc_now
from app.features.audit.models import AuditLog


class AuditLogService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def record(
        self,
        *,
        user_id: int | None,
        action: str,
        entity_type: str,
        entity_id: int | None,
        metadata: dict[str, Any] | None = None,
    ) -> AuditLog:
        entry = AuditLog(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            metadata_json=json.dumps(metadata, default=str) if metadata else None,
            created_at=utc_now(),
        )
        self.db.add(entry)
        return entry
