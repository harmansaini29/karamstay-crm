"""
KaramStay Master Bank Accounts Registry & Multi-Account Operator Control.

================================================================================
PRODUCTION-GRADE OPERATOR CONTROL & BANK ACCOUNT MANAGEMENT
================================================================================
This single authoritative file controls all bank current accounts for KaramStay.
The operator / business owner can directly manage:
  1. Adding new bank accounts or removing old ones
  2. Instant ON / OFF kill-switch for each individual bank or all banks
  3. Real bank account numbers, IFSC codes, and settlement beneficiary names
  4. Virtual Account Number (VAN) prefixes and UPI / VPA handle templates
  5. Webhook URLs, callback endpoints, and sensitive cryptographic secrets

CURRENT CONFIGURED ACCOUNTS:
  - Account 1: HDFC Bank - Current Account 1 (Prefix: KARMH1, IFSC: HDFC0000060)
  - Account 2: HDFC Bank - Current Account 2 (Prefix: KARMH2, IFSC: HDFC0000060)
  - Account 3: NKGSB Co-op Bank - Current Account (Prefix: KARMN1, IFSC: NKGS0000001)

HOW TO OPERATE THIS FILE:
  - To PAUSE collections for a bank:
      Set `is_active=False` and `status="paused"` in BANK_ACCOUNTS_REGISTRY below,
      or call `pause_bank_account("hdfc_1")`.
  - To RESUME collections for a bank:
      Set `is_active=True` and `status="active"` in BANK_ACCOUNTS_REGISTRY below,
      or call `resume_bank_account("hdfc_1")`.
  - To ADD a new bank account:
      Add a new BankAccountConfig entry in BANK_ACCOUNTS_REGISTRY or invoke `add_bank_account(...)`.
  - To SET webhook secrets securely:
      Set the respective environment variable (e.g. `HDFC_1_WEBHOOK_SECRET`) in your
      production `.env` file or hosting provider (Render / AWS / Fly). If omitted,
      the fallback secret in this file is used.
================================================================================
"""

import copy
import logging
import os
from dataclasses import asdict, dataclass
from typing import Any

logger = logging.getLogger("karamstay.bank_accounts")


# ─────────────────────────────────────────────────────────────────────────────
# 1. Data Model: Bank Account Configuration
# ─────────────────────────────────────────────────────────────────────────────
@dataclass
class BankAccountConfig:
    """Authoritative configuration model for a single bank current account."""

    # Unique identifier used across API, DB, and Mobile dropdowns
    key: str

    # Human-readable label for UI display
    name: str

    # Banking institution name
    bank_name: str

    # Real bank current account number
    account_number: str

    # Beneficiary name registered with bank CMS
    account_holder_name: str

    # Deterministic prefix for tenant Virtual Account Numbers (VANs)
    van_prefix: str

    # Bank IFSC code for CMS and RTGS / NEFT / IMPS transfers
    ifsc: str

    # UPI / VPA template string where {van} will be replaced by lowercase VAN
    upi_handle_template: str

    # Environment variable name holding cryptographic HMAC-SHA256 webhook secret
    webhook_secret_env_var: str

    # Secure fallback webhook secret if env variable is not set
    default_webhook_secret: str

    # Bank webhook inbound callback path
    webhook_url: str = "/api/v1/payments/webhook/smart-collect"

    # Bank API endpoint URL for CMS inquiry or balance verification
    api_endpoint_url: str | None = None

    # MASTER KILL-SWITCH: True = Active & accepting payments, False = Paused
    is_active: bool = True

    # Operational status: "active", "paused", "maintenance", "disabled"
    status: str = "active"

    # Human-readable description of account purpose
    description: str = ""

    # Flag indicating whether this is system default fallback account
    is_default: bool = False

    # Optional internal identifier or partner code provided by the bank
    cms_client_code: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert dataclass to dictionary."""
        return asdict(self)


# ─────────────────────────────────────────────────────────────────────────────
# 2. Master Authoritative Registry: In-Code Multi-Account Control
# ─────────────────────────────────────────────────────────────────────────────
# Edit or toggle accounts below. Changes take effect across virtual account
# allocation, webhook verification, and property settlement.
# ─────────────────────────────────────────────────────────────────────────────
BANK_ACCOUNTS_REGISTRY: dict[str, BankAccountConfig] = {
    # ── Bank Account 1: HDFC Bank Current Account 1 ─────────────────────────
    "hdfc_1": BankAccountConfig(
        key="hdfc_1",
        name="HDFC Bank - Current Account 1",
        bank_name="HDFC Bank",
        account_number="50200084920191",
        account_holder_name="KaramStay Hospitality LLP",
        van_prefix="KARMH1",
        ifsc="HDFC0000060",
        upi_handle_template="{van}@hdfcbank",
        webhook_secret_env_var="HDFC_1_WEBHOOK_SECRET",
        default_webhook_secret="hdfc_1_cms_secret_token_secure_prod",
        webhook_url="/api/v1/payments/webhook/smart-collect",
        is_active=True,  # <-- Toggle False to pause Account 1 collections
        status="active",
        description="Primary HDFC current account for Gurgaon & Noida properties",
        is_default=True,
        cms_client_code="KARMHDFC1",
    ),

    # ── Bank Account 2: HDFC Bank Current Account 2 ─────────────────────────
    "hdfc_2": BankAccountConfig(
        key="hdfc_2",
        name="HDFC Bank - Current Account 2",
        bank_name="HDFC Bank",
        account_number="50200093847202",
        account_holder_name="KaramStay Hospitality LLP",
        van_prefix="KARMH2",
        ifsc="HDFC0000060",
        upi_handle_template="{van}@hdfcbank",
        webhook_secret_env_var="HDFC_2_WEBHOOK_SECRET",
        default_webhook_secret="hdfc_2_cms_secret_token_secure_prod",
        webhook_url="/api/v1/payments/webhook/smart-collect",
        is_active=True,  # <-- Toggle False to pause Account 2 collections
        status="active",
        description="Secondary HDFC current account for Commercial & Luxury properties",
        is_default=False,
        cms_client_code="KARMHDFC2",
    ),

    # ── Bank Account 3: NKGSB Co-op Bank Current Account ───────────────────
    "nkgsb_1": BankAccountConfig(
        key="nkgsb_1",
        name="NKGSB Co-op Bank - Current Account",
        bank_name="NKGSB Co-op Bank",
        account_number="01210010004589",
        account_holder_name="KaramStay Hospitality LLP",
        van_prefix="KARMN1",
        ifsc="NKGS0000001",
        upi_handle_template="{van}@nkgsb",
        webhook_secret_env_var="NKGSB_1_WEBHOOK_SECRET",
        default_webhook_secret="nkgsb_1_cms_secret_token_secure_prod",
        webhook_url="/api/v1/payments/webhook/smart-collect",
        is_active=True,  # <-- Toggle False to pause NKGSB collections
        status="active",
        description="NKGSB Co-operative Bank current account for dedicated property flats",
        is_default=False,
        cms_client_code="KARMNKGSB",
    ),

    # ── Legacy Compatibility Entries (Backward Compatibility) ───────────────
    # These entries preserve zero-regression compatibility with existing tests
    # and legacy database records using 'hdfc' and 'icici' aliases.
    "hdfc": BankAccountConfig(
        key="hdfc",
        name="HDFC Bank (Legacy General)",
        bank_name="HDFC Bank",
        account_number="50200084920191",
        account_holder_name="KaramStay Hospitality LLP",
        van_prefix="KARMH",
        ifsc="HDFC0000060",
        upi_handle_template="{van}@hdfcbank",
        webhook_secret_env_var="HDFC_CMS_WEBHOOK_SECRET",
        default_webhook_secret="hdfc_cms_secret_token_legacy",
        webhook_url="/api/v1/payments/webhook/smart-collect",
        is_active=True,
        status="active",
        description="Legacy general HDFC account prefix KARMH",
        is_default=False,
    ),
    "icici": BankAccountConfig(
        key="icici",
        name="ICICI Bank (Legacy Smart Collect)",
        bank_name="ICICI Bank",
        account_number="123405009999",
        account_holder_name="KaramStay Hospitality LLP",
        van_prefix="KARMI",
        ifsc="ICIC0000104",
        upi_handle_template="{van}@icici",
        webhook_secret_env_var="ICICI_CMS_WEBHOOK_SECRET",
        default_webhook_secret="icici_cms_secret_token_legacy",
        webhook_url="/api/v1/payments/webhook/smart-collect",
        is_active=True,
        status="active",
        description="Legacy ICICI Bank Smart Collect",
        is_default=False,
    ),
}

# The primary production accounts presented to property managers & mobile UI
PRIMARY_ACCOUNT_KEYS: tuple[str, ...] = ("hdfc_1", "hdfc_2", "nkgsb_1")


# ─────────────────────────────────────────────────────────────────────────────
# 3. Operator Control Functions (ON / OFF Kill-Switch, Add, Delete)
# ─────────────────────────────────────────────────────────────────────────────

def list_bank_accounts(
    active_only: bool = False,
    include_legacy: bool = False,
) -> list[BankAccountConfig]:
    """Return configured bank accounts.

    Args:
        active_only: If True, filters only accounts where is_active is True.
        include_legacy: If True, includes legacy fallback entries (hdfc, icici).
    """
    accounts: list[BankAccountConfig] = []
    for key, config in BANK_ACCOUNTS_REGISTRY.items():
        if not include_legacy and key not in PRIMARY_ACCOUNT_KEYS:
            continue
        if active_only and not config.is_active:
            continue
        accounts.append(copy.deepcopy(config))
    return accounts


def get_bank_account(key: str | None) -> BankAccountConfig | None:
    """Retrieve bank account configuration by unique key (case-insensitive)."""
    if not key:
        return None
    normalized_key = key.strip().lower()
    if normalized_key in BANK_ACCOUNTS_REGISTRY:
        return BANK_ACCOUNTS_REGISTRY[normalized_key]

    # Resilient fallback aliases
    if normalized_key in ("hdfc1", "hdfc-1"):
        return BANK_ACCOUNTS_REGISTRY.get("hdfc_1")
    if normalized_key in ("hdfc2", "hdfc-2"):
        return BANK_ACCOUNTS_REGISTRY.get("hdfc_2")
    if normalized_key in ("nkgsb", "nkgsb1", "nkgsb-1"):
        return BANK_ACCOUNTS_REGISTRY.get("nkgsb_1")

    return None


def get_default_bank_account() -> BankAccountConfig:
    """Get the designated default bank account (falls back to hdfc_1)."""
    for config in BANK_ACCOUNTS_REGISTRY.values():
        if config.is_default and config.is_active:
            return config
    # Fallback to hdfc_1 even if paused
    return BANK_ACCOUNTS_REGISTRY.get("hdfc_1", next(iter(BANK_ACCOUNTS_REGISTRY.values())))


def add_bank_account(config: BankAccountConfig) -> None:
    """Dynamically register or update a bank account configuration."""
    key = config.key.strip().lower()
    BANK_ACCOUNTS_REGISTRY[key] = config
    logger.info("Bank account '%s' registered / updated in registry.", key)


def delete_bank_account(key: str) -> bool:
    """Remove a bank account from registry.

    Returns True if removed, False if not found.
    """
    normalized_key = key.strip().lower()
    if normalized_key in BANK_ACCOUNTS_REGISTRY:
        del BANK_ACCOUNTS_REGISTRY[normalized_key]
        logger.info("Bank account '%s' removed from registry.", normalized_key)
        return True
    return False


def set_bank_account_status(key: str, is_active: bool, status: str | None = None) -> bool:
    """Toggle a bank account service ON or OFF.

    Args:
        key: Bank account key (e.g. 'hdfc_1', 'hdfc_2', 'nkgsb_1')
        is_active: True to enable, False to pause
        status: Optional operational status string ("active", "paused", etc.)
    """
    account = get_bank_account(key)
    if account:
        account.is_active = is_active
        account.status = status or ("active" if is_active else "paused")
        logger.info(
            "Bank account '%s' status updated: is_active=%s, status=%s",
            key,
            account.is_active,
            account.status,
        )
        return True
    return False


def pause_bank_account(key: str) -> bool:
    """Convenience helper to pause/kill-switch a specific bank account."""
    return set_bank_account_status(key, is_active=False, status="paused")


def resume_bank_account(key: str) -> bool:
    """Convenience helper to resume/activate a specific bank account."""
    return set_bank_account_status(key, is_active=True, status="active")


def pause_all_accounts() -> None:
    """Global emergency kill-switch: pauses all bank account services."""
    for account in BANK_ACCOUNTS_REGISTRY.values():
        account.is_active = False
        account.status = "paused"
    logger.warning("All bank account services have been PAUSED by operator kill-switch.")


def resume_all_accounts() -> None:
    """Resumes all bank account services."""
    for account in BANK_ACCOUNTS_REGISTRY.values():
        account.is_active = True
        account.status = "active"
    logger.info("All bank account services have been RESUMED.")


def is_service_active(key_or_prefix_or_van: str) -> bool:
    """Check if collection service is currently active for a bank account or VAN."""
    account = (
        get_bank_account(key_or_prefix_or_van)
        or resolve_bank_account_for_van(key_or_prefix_or_van)
        or resolve_bank_account_by_prefix(key_or_prefix_or_van)
    )
    if account:
        return account.is_active and account.status == "active"
    return False


# ─────────────────────────────────────────────────────────────────────────────
# 4. VAN Matching & Virtual Account Allocation Helpers
# ─────────────────────────────────────────────────────────────────────────────

def resolve_bank_account_by_prefix(prefix: str) -> BankAccountConfig | None:
    """Lookup bank account by exact VAN prefix (case-insensitive)."""
    clean_prefix = prefix.strip().upper()
    for config in BANK_ACCOUNTS_REGISTRY.values():
        if config.van_prefix.upper() == clean_prefix:
            return config
    return None


def resolve_bank_account_for_van(van: str | None) -> BankAccountConfig | None:
    """Resolve the specific bank account config by inspecting the incoming VAN.

    Sorts candidate prefixes by length descending so that specific longer prefixes
    (e.g. 'KARMH1', 'KARMH2', 'KARMN1' of length 6) are matched before shorter legacy
    prefixes ('KARMH', 'KARMI' of length 5).
    """
    if not van:
        return None
    clean_van = van.strip().upper()

    # Sort accounts by prefix length descending to prevent prefix shadowing
    sorted_accounts = sorted(
        BANK_ACCOUNTS_REGISTRY.values(),
        key=lambda acc: len(acc.van_prefix),
        reverse=True,
    )

    for account in sorted_accounts:
        if clean_van.startswith(account.van_prefix.upper()):
            return account

    return None


def format_virtual_account(
    account_key: str | None,
    tenancy_id: int,
) -> dict[str, str]:
    """Deterministically allocates collision-free VAN, IFSC, and VPA.

    Args:
        account_key: Bank account key ('hdfc_1', 'hdfc_2', 'nkgsb_1', 'hdfc', 'icici')
        tenancy_id: Unique database ID of the tenancy (e.g. 501)

    Returns:
        Dictionary with virtual_account_number, virtual_ifsc, virtual_vpa, bank_provider, bank_account_key
    """
    account = get_bank_account(account_key) or get_default_bank_account()
    van = f"{account.van_prefix.upper()}{tenancy_id:06d}"
    vpa = account.upi_handle_template.replace("{van}", van.lower())

    return {
        "virtual_account_number": van,
        "virtual_ifsc": account.ifsc.upper(),
        "virtual_vpa": vpa,
        "bank_provider": account.key,
        "bank_account_key": account.key,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 5. Security & Cryptographic Webhook Secret Resolution
# ─────────────────────────────────────────────────────────────────────────────

def get_webhook_secret_for_account(account_or_key: BankAccountConfig | str) -> str | None:
    """Resolve the authoritative cryptographic webhook secret for a bank account.

    Resolution order:
      1. Environment variable specified in account.webhook_secret_env_var
      2. App settings fallback (settings.hdfc_cms_webhook_secret, etc.)
      3. Account default_webhook_secret defined in this file
    """
    if isinstance(account_or_key, str):
        account = get_bank_account(account_or_key)
    else:
        account = account_or_key

    if not account:
        return None

    # 1. Check account-specific environment variable
    if account.webhook_secret_env_var:
        env_val = os.getenv(account.webhook_secret_env_var)
        if env_val and env_val.strip():
            return env_val.strip()

    # 2. Check settings fallback if available
    try:
        from app.core.config import settings

        if account.key in ("hdfc_1", "hdfc") and settings.hdfc_cms_webhook_secret:
            return settings.hdfc_cms_webhook_secret
        if account.key == "icici" and settings.icici_cms_webhook_secret:
            return settings.icici_cms_webhook_secret
        if settings.smart_collect_webhook_secret:
            return settings.smart_collect_webhook_secret
    except Exception:
        pass

    # 3. Default fallback secret
    if account.default_webhook_secret and account.default_webhook_secret.strip():
        return account.default_webhook_secret.strip()

    return None


def get_all_candidate_webhook_secrets(priority_key: str | None = None) -> list[str]:
    """Gather all non-empty candidate secrets across registered accounts and settings.

    The secret corresponding to `priority_key` will always be placed at index 0.
    """
    candidates: list[str] = []

    # Priority account secret first
    if priority_key:
        priority_acc = get_bank_account(priority_key)
        if priority_acc:
            p_sec = get_webhook_secret_for_account(priority_acc)
            if p_sec and p_sec not in candidates:
                candidates.append(p_sec)

    # All registered bank accounts
    for acc in BANK_ACCOUNTS_REGISTRY.values():
        sec = get_webhook_secret_for_account(acc)
        if sec and sec not in candidates:
            candidates.append(sec)

    # Global settings secrets
    try:
        from app.core.config import settings

        for sec in (
            settings.hdfc_cms_webhook_secret,
            settings.icici_cms_webhook_secret,
            settings.smart_collect_webhook_secret,
        ):
            if sec and sec not in candidates:
                candidates.append(sec)
    except Exception:
        pass

    return candidates
