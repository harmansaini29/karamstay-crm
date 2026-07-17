from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.consents.models import Consent, DataRequest


class ConsentRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def add_consent(self, consent: Consent) -> Consent:
        self.db.add(consent)
        return consent

    def list_consents_for_user(self, user_id: int) -> list[Consent]:
        statement = select(Consent).where(Consent.user_id == user_id).order_by(Consent.created_at.desc())
        return list(self.db.scalars(statement))

    def add_data_request(self, data_request: DataRequest) -> DataRequest:
        self.db.add(data_request)
        return data_request

    def list_data_requests_for_user(self, user_id: int) -> list[DataRequest]:
        statement = (
            select(DataRequest).where(DataRequest.user_id == user_id).order_by(DataRequest.created_at.desc())
        )
        return list(self.db.scalars(statement))

    def list_all_data_requests(self) -> list[DataRequest]:
        statement = select(DataRequest).order_by(DataRequest.created_at.desc())
        return list(self.db.scalars(statement))

    def get_data_request(self, data_request_id: int) -> DataRequest | None:
        statement = select(DataRequest).where(DataRequest.id == data_request_id)
        return self.db.scalar(statement)
