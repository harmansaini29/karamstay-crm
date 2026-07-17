from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.documents.models import Document
from app.features.properties.models import ManagerPropertyAssignment as MPA
from app.features.properties.models import Property, Unit
from app.features.tenants.models import Tenancy, Tenant


class DocumentRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def add_document(self, document: Document) -> Document:
        self.db.add(document)
        return document

    def get_document(self, document_id: int) -> Document | None:
        statement = select(Document).where(Document.id == document_id, Document.deleted_at.is_(None))
        return self.db.scalar(statement)

    def list_all(self) -> list[Document]:
        statement = select(Document).where(Document.deleted_at.is_(None)).order_by(Document.created_at.desc())
        return list(self.db.scalars(statement))

    def list_for_tenant(self, tenant_id: int) -> list[Document]:
        statement = (
            select(Document)
            .where(Document.tenant_id == tenant_id, Document.deleted_at.is_(None))
            .order_by(Document.created_at.desc())
        )
        return list(self.db.scalars(statement))

    def list_for_manager(self, manager_id: int) -> list[Document]:
        own_property_docs = (
            select(Document.id)
            .join(Property, Property.id == Document.property_id)
            .join(MPA, MPA.property_id == Property.id)
            .where(MPA.manager_id == manager_id)
        )
        own_tenant_docs = (
            select(Document.id)
            .join(Tenant, Tenant.id == Document.tenant_id)
            .join(Tenancy, Tenancy.tenant_id == Tenant.id)
            .join(Unit, Unit.id == Tenancy.unit_id)
            .join(Property, Property.id == Unit.property_id)
            .join(MPA, MPA.property_id == Property.id)
            .where(MPA.manager_id == manager_id)
        )
        allowed_ids = {row for row in self.db.scalars(own_property_docs)} | {
            row for row in self.db.scalars(own_tenant_docs)
        }
        if not allowed_ids:
            return []
        statement = (
            select(Document)
            .where(Document.id.in_(allowed_ids), Document.deleted_at.is_(None))
            .order_by(Document.created_at.desc())
        )
        return list(self.db.scalars(statement))

    def manager_can_access_tenant(self, manager_id: int, tenant_id: int) -> bool:
        statement = (
            select(Tenancy.id)
            .join(Unit, Unit.id == Tenancy.unit_id)
            .join(Property, Property.id == Unit.property_id)
            .join(MPA, MPA.property_id == Property.id)
            .where(MPA.manager_id == manager_id, Tenancy.tenant_id == tenant_id)
        )
        return self.db.scalar(statement) is not None

    def manager_can_access_property(self, manager_id: int, property_id: int) -> bool:
        statement = select(MPA.id).where(MPA.manager_id == manager_id, MPA.property_id == property_id)
        return self.db.scalar(statement) is not None

    def get_tenant_by_user_id(self, user_id: int) -> Tenant | None:
        statement = select(Tenant).where(Tenant.user_id == user_id, Tenant.deleted_at.is_(None))
        return self.db.scalar(statement)
