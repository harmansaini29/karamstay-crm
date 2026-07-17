from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.audit import AuditLogService
from app.core.security import utc_now
from app.features.auth.models import User
from app.features.consents.models import Consent, DataRequest
from app.features.consents.repository import ConsentRepository
from app.features.consents.schemas import ConsentCreate, DataRequestCreate


class ConsentService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = ConsentRepository(db)
        self.audit = AuditLogService(db)

    def record_consent(self, payload: ConsentCreate, current_user: User) -> Consent:
        consent = Consent(
            user_id=current_user.id,
            consent_type=payload.consent_type,
            granted=payload.granted,
            policy_version=payload.policy_version,
        )
        self.repository.add_consent(consent)
        self.db.flush()
        self.audit.record(
            user_id=current_user.id,
            action="consent.record",
            entity_type="consent",
            entity_id=consent.id,
            metadata={"consent_type": payload.consent_type, "granted": payload.granted},
        )
        self.db.commit()
        self.db.refresh(consent)
        return consent

    def list_my_consents(self, current_user: User) -> list[Consent]:
        return self.repository.list_consents_for_user(current_user.id)

    def create_data_request(self, payload: DataRequestCreate, current_user: User) -> DataRequest:
        data_request = DataRequest(user_id=current_user.id, request_type=payload.request_type)
        self.repository.add_data_request(data_request)
        self.db.flush()
        self.audit.record(
            user_id=current_user.id,
            action="data_request.create",
            entity_type="data_request",
            entity_id=data_request.id,
            metadata={"request_type": payload.request_type},
        )
        self.db.commit()
        self.db.refresh(data_request)
        return data_request

    def list_my_data_requests(self, current_user: User) -> list[DataRequest]:
        return self.repository.list_data_requests_for_user(current_user.id)

    def list_all_data_requests(self, current_user: User) -> list[DataRequest]:
        return self.repository.list_all_data_requests()

    def resolve_data_request(self, data_request_id: int, current_user: User) -> DataRequest:
        data_request = self.repository.get_data_request(data_request_id)
        if data_request is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Data request not found")
        if data_request.status == "completed":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Data request already resolved")
        data_request.status = "completed"
        data_request.resolved_at = utc_now()
        self.audit.record(
            user_id=current_user.id,
            action="data_request.resolve",
            entity_type="data_request",
            entity_id=data_request.id,
        )
        self.db.commit()
        self.db.refresh(data_request)
        return data_request
