import logging
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.audit import AuditLogService
from app.core.security import utc_now
from app.core.storage import get_storage
from app.features.auth.models import User
from app.features.notifications.dispatcher import notify_push_all_devices, notify_whatsapp
from app.features.payments.models import Expense, Invoice, LedgerEntry, Payment
from app.features.payments.receipts import generate_receipt_pdf
from app.features.payments.repository import PaymentRepository
from app.features.payments.schemas import ExpenseCreate, InvoiceCreate, PaymentVerifyRequest, UpiSubmitRequest
from app.features.properties.repository import PropertyRepository
from app.features.settings.keys import KEY_WHATSAPP_PAYMENT_CONFIRMATION_TEMPLATE, get_whatsapp_template
from app.features.tenants.models import Tenancy

logger = logging.getLogger("karamstay.payments")


class PaymentService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = PaymentRepository(db)
        self.property_repository = PropertyRepository(db)
        self.audit = AuditLogService(db)

    # -- Invoices ---------------------------------------------------------

    def list_invoices(self, current_user: User) -> list[Invoice]:
        role = current_user.role.name
        if role in ("owner", "accountant"):
            return self.repository.list_invoices_for_owner()
        if role == "manager":
            return self.repository.list_invoices_for_manager(current_user.id)
        tenant = self.repository.get_tenant_by_user_id(current_user.id)
        if tenant is None:
            return []
        return self.repository.list_invoices_for_tenant(tenant.id)

    def create_invoice(self, payload: InvoiceCreate, current_user: User) -> Invoice:
        tenancy = self.repository.get_tenancy(payload.tenancy_id)
        if tenancy is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenancy not found")
        if current_user.role.name == "manager" and not self.repository.manager_has_tenancy(
            current_user.id,
            tenancy.id,
        ):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenancy access denied")
        if self.repository.get_invoice_for_period(payload.tenancy_id, payload.billing_period) is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An invoice already exists for this tenancy and billing period",
            )

        invoice = Invoice(
            tenancy_id=payload.tenancy_id,
            billing_period=payload.billing_period,
            due_date=payload.due_date,
            amount=payload.amount,
            created_by_id=current_user.id,
            updated_by_id=current_user.id,
        )
        self.repository.add_invoice(invoice)
        self.db.flush()
        self.audit.record(
            user_id=current_user.id,
            action="invoice.create",
            entity_type="invoice",
            entity_id=invoice.id,
        )
        self.db.commit()
        self.db.refresh(invoice)
        return invoice

    def _get_invoice_for_user(self, invoice_id: int, current_user: User) -> Invoice:
        invoice = self.repository.get_invoice(invoice_id)
        if invoice is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
        role = current_user.role.name
        if role == "manager" and not self.repository.manager_has_tenancy(current_user.id, invoice.tenancy_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invoice access denied")
        if role == "tenant":
            tenant = self.repository.get_tenant_by_user_id(current_user.id)
            tenancy = self.repository.get_tenancy(invoice.tenancy_id)
            if tenant is None or tenancy is None or tenancy.tenant_id != tenant.id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invoice access denied")
        return invoice

    def _outstanding_amount(self, invoice: Invoice) -> Decimal:
        # `invoice.payments` may already be loaded (and cached) from an earlier point in
        # this session before a new payment existed for it — refresh so a payment created
        # moments ago in the same request/session is never missed.
        self.db.refresh(invoice, attribute_names=["payments"])
        paid = sum(
            (p.amount for p in invoice.payments if p.status == "captured"),
            Decimal("0.00"),
        )
        return max(invoice.amount + invoice.late_fee_amount - paid, Decimal("0.00"))

    def _settle_payment(
        self,
        payment: Payment,
        *,
        description: str,
        verified_by_id: int | None,
        background_tasks,
    ) -> None:
        """Shared by every payment-capture path (currently: UPI verify) so ledger/invoice
        settlement logic exists in exactly one place."""
        payment.status = "captured"
        payment.paid_at = utc_now()

        if payment.tenancy_id is not None:
            self.repository.add_ledger_entry(
                LedgerEntry(
                    tenancy_id=payment.tenancy_id,
                    payment_id=payment.id,
                    entry_type=payment.payment_type,
                    direction="credit",
                    amount=payment.amount,
                    occurred_on=utc_now().date(),
                    description=description,
                ),
            )

        if payment.invoice_id is not None:
            invoice = self.repository.get_invoice(payment.invoice_id)
            if invoice is not None:
                outstanding = self._outstanding_amount(invoice)
                invoice.status = "paid" if outstanding <= 0 else "partial"

        self.audit.record(
            user_id=verified_by_id,
            action="payment.captured",
            entity_type="payment",
            entity_id=payment.id,
            metadata={"mode": payment.mode},
        )
        self.db.commit()

        if background_tasks is not None:
            background_tasks.add_task(self._issue_receipt, payment.id)
        else:
            self._issue_receipt(payment.id)

    # -- UPI (manual, tenant-submitted UTR) --------------------------------

    def submit_upi_payment(self, payload: UpiSubmitRequest, current_user: User) -> Payment:
        invoice = self._get_invoice_for_user(payload.invoice_id, current_user)
        outstanding = self._outstanding_amount(invoice)
        if outstanding <= 0:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Invoice is already settled")

        payment = Payment(
            invoice_id=invoice.id,
            tenancy_id=invoice.tenancy_id,
            amount=payload.amount,
            payment_type="rent",
            mode="upi",
            status="submitted_pending_verification",
            utr_number=payload.utr_number,
            submitted_at=utc_now(),
            created_by_id=current_user.id,
            updated_by_id=current_user.id,
        )
        self.repository.add_payment(payment)
        self.db.flush()
        self.audit.record(
            user_id=current_user.id,
            action="payment.upi_submit",
            entity_type="payment",
            entity_id=payment.id,
            metadata={"invoice_id": invoice.id, "utr_number": payload.utr_number},
        )
        self.db.commit()
        self.db.refresh(payment)
        return payment

    def verify_payment(
        self,
        payment_id: int,
        payload: PaymentVerifyRequest,
        current_user: User,
        background_tasks=None,
    ) -> Payment:
        payment = self.repository.get_payment(payment_id)
        if payment is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
        if current_user.role.name == "manager" and payment.tenancy_id is not None:
            if not self.repository.manager_has_tenancy(current_user.id, payment.tenancy_id):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenancy access denied")
        if payment.status != "submitted_pending_verification":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Payment is not pending verification",
            )

        if payload.approve:
            self._settle_payment(
                payment,
                description=f"UPI payment verified, UTR {payment.utr_number}",
                verified_by_id=current_user.id,
                background_tasks=background_tasks,
            )
            payment.verified_by_id = current_user.id
            payment.verified_at = utc_now()
        else:
            payment.status = "rejected"
            payment.rejection_reason = payload.rejection_reason
            payment.verified_by_id = current_user.id
            payment.verified_at = utc_now()
            self.audit.record(
                user_id=current_user.id,
                action="payment.reject",
                entity_type="payment",
                entity_id=payment.id,
                metadata={"rejection_reason": payload.rejection_reason},
            )
        self.db.commit()
        self.db.refresh(payment)
        return payment

    def _issue_receipt(self, payment_id: int) -> None:
        """Best-effort: a receipt/notification failure must never roll back a captured payment."""
        try:
            payment = self.repository.get_payment(payment_id)
            if payment is None or payment.tenancy_id is None:
                return
            tenancy = self.db.get(Tenancy, payment.tenancy_id)
            if tenancy is None:
                return
            tenant = tenancy.tenant
            unit = tenancy.unit

            pdf_bytes = generate_receipt_pdf(
                receipt_no=f"RCPT-{payment.id}",
                tenant_name=tenant.name,
                unit_label=unit.unit_no,
                amount=payment.amount,
                payment_mode=payment.mode,
                paid_at=payment.paid_at or utc_now(),
            )
            storage = get_storage()
            key = storage.build_key(prefix=f"receipts/tenant-{tenant.id}", file_name=f"receipt-{payment.id}.pdf")
            storage.upload_bytes(key=key, data=pdf_bytes, content_type="application/pdf")

            message = f"Payment of Rs. {payment.amount:,.2f} received. Thank you!"
            notify_whatsapp(
                self.db,
                user_id=tenant.user_id,
                phone=tenant.phone,
                notification_type="payment_confirmation",
                title="Payment Received",
                message=message,
                template_name=get_whatsapp_template(self.db, KEY_WHATSAPP_PAYMENT_CONFIRMATION_TEMPLATE),
            )
            if tenant.user_id is not None:
                notify_push_all_devices(
                    self.db,
                    user_id=tenant.user_id,
                    notification_type="payment_confirmation",
                    title="Payment Received",
                    message=message,
                )
        except Exception:
            logger.exception("Failed to issue receipt/notification for payment %s", payment_id)

    # -- Ledger ---------------------------------------------------------

    def list_ledger(self, tenancy_id: int, current_user: User) -> list[LedgerEntry]:
        tenancy = self.repository.get_tenancy(tenancy_id)
        if tenancy is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenancy not found")
        role = current_user.role.name
        if role == "manager" and not self.repository.manager_has_tenancy(current_user.id, tenancy_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenancy access denied")
        if role == "tenant":
            tenant = self.repository.get_tenant_by_user_id(current_user.id)
            if tenant is None or tenancy.tenant_id != tenant.id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenancy access denied")
        return self.repository.list_ledger_for_tenancy(tenancy_id)

    # -- Payments ---------------------------------------------------------

    def list_payments(self, current_user: User, status_filter: str | None = None) -> list[Payment]:
        role = current_user.role.name
        if role in ("owner", "accountant", "manager"):
            payments = self.repository.list_payments_for_owner()
        else:
            tenant = self.repository.get_tenant_by_user_id(current_user.id)
            payments = self.repository.list_payments_for_tenant(tenant.id) if tenant else []
        if status_filter is not None:
            payments = [p for p in payments if p.status == status_filter]
        return payments

    # -- Expenses ---------------------------------------------------------

    def create_expense(self, payload: ExpenseCreate, current_user: User) -> Expense:
        property_ = self.property_repository.get_property(payload.property_id)
        if property_ is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")
        if current_user.role.name == "manager" and not self.property_repository.manager_has_property(
            current_user.id,
            payload.property_id,
        ):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Property access denied")

        expense = Expense(
            property_id=payload.property_id,
            category=payload.category,
            amount=payload.amount,
            expense_date=payload.expense_date,
            description=payload.description,
            created_by_id=current_user.id,
            updated_by_id=current_user.id,
        )
        self.repository.add_expense(expense)
        self.db.flush()
        self.audit.record(
            user_id=current_user.id,
            action="expense.create",
            entity_type="expense",
            entity_id=expense.id,
        )
        self.db.commit()
        self.db.refresh(expense)
        return expense

    def list_expenses(self, current_user: User, property_id: int | None) -> list[Expense]:
        if property_id is not None:
            if current_user.role.name == "manager" and not self.property_repository.manager_has_property(
                current_user.id,
                property_id,
            ):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Property access denied")
            return self.repository.list_expenses_for_property(property_id)
        return self.repository.list_expenses_all()
