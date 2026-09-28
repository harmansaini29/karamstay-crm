"""
KaramStay In-Code Property Payment & UPI Registry.

================================================================================
SAFE IN-CODE UPI / GPAY CONFIGURATION
================================================================================
This module defines the central authoritative in-code registry for property
UPI / Google Pay payment IDs. Modifying UPI IDs inside the mobile application
poses financial security risks (e.g. unauthorized tampering or redirecting rent).
Therefore, all property UPI IDs can be safely defined, updated, and versioned
here in code.

HOW TO ADD OR MODIFY A PROPERTY'S UPI / GPAY ID:
1. Locate PROPERTY_PAYMENT_REGISTRY below.
2. Add or update the property name or ID with its current UPI ID:
   e.g. "Property Alpha": "alpha.karamstay@okhdfcbank"
        "DLF Cyber City": "dlf.rent@okaxis"
        1: "owner@okhdfcbank"  # by numeric property_id
3. Deploy or restart the backend server, or run the sync script:
   `python scripts/sync_property_payment_ids.py`
================================================================================
"""

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

logger = logging.getLogger("karamstay.property_payments")

# ─────────────────────────────────────────────────────────────────────────────
# Authoritative In-Code Registry: Property Identifier -> UPI / GPay ID
# ─────────────────────────────────────────────────────────────────────────────
PROPERTY_PAYMENT_REGISTRY: dict[str | int, str] = {
    # Default fallback for any newly created property without a specific entry
    "default": "karamstay@okhdfcbank",

    # Property-specific UPI / GPay IDs (mapped by property name)
    "Property Alpha": "alpha.karamstay@okhdfcbank",
    "Property Beta": "beta.karamstay@okaxis",
    "DLF Phase 1, Gurgaon": "alpha.karamstay@okhdfcbank",
    "Sector 62, Noida": "beta.karamstay@okaxis",

    # Add future properties and their verified UPI IDs below:
    # "KaramStay Residency": "karamresidency@okhdfcbank",
    # "Greenwood Apartments": "greenwood@okicici",
}


def _normalize_key(key: str) -> str:
    """Normalize property name for resilient matching (lowercase, stripped)."""
    return key.strip().lower()


def get_configured_upi_for_property(
    property_name: str | None = None,
    property_id: int | None = None,
) -> str:
    """Resolve the authoritative UPI / GPay ID for a property from the in-code registry.

    Resolution precedence:
      1. Explicit integer property_id in registry
      2. Exact or case-insensitive property_name match
      3. Registry 'default' value
      4. Hardcoded fallback 'karamstay@okhdfcbank'
    """
    if property_id is not None:
        if property_id in PROPERTY_PAYMENT_REGISTRY:
            return PROPERTY_PAYMENT_REGISTRY[property_id]
        if str(property_id) in PROPERTY_PAYMENT_REGISTRY:
            return PROPERTY_PAYMENT_REGISTRY[str(property_id)]


    if property_name:
        # Check exact name match
        if property_name in PROPERTY_PAYMENT_REGISTRY:
            return PROPERTY_PAYMENT_REGISTRY[property_name]

        # Check normalized (case-insensitive) match
        norm_name = _normalize_key(property_name)
        for reg_key, upi in PROPERTY_PAYMENT_REGISTRY.items():
            if isinstance(reg_key, str) and reg_key != "default":
                if _normalize_key(reg_key) == norm_name:
                    return upi

    return PROPERTY_PAYMENT_REGISTRY.get("default", "karamstay@okhdfcbank")


def register_property_payment_override(identifier: str | int, upi_id: str) -> None:
    """Dynamically register or update an in-code UPI mapping (useful in tests and configs)."""
    PROPERTY_PAYMENT_REGISTRY[identifier] = upi_id.strip()
    logger.info("Registered property payment override for '%s': %s", identifier, upi_id)


def sync_property_payment_ids_to_db(db: Session) -> dict[str, Any]:
    """Synchronize all database properties with the authoritative in-code UPI registry.

    Updates property payment_upi_id in the database whenever an entry in
    PROPERTY_PAYMENT_REGISTRY matches the property by ID or name and differs
    from the current DB state, or when a property has no UPI ID set.
    """
    # Import Property model lazily to avoid circular imports during module load
    from app.features.properties.models import Property

    stmt = select(Property).where(Property.deleted_at.is_(None))
    properties = list(db.scalars(stmt))

    updated_properties: list[dict[str, Any]] = []

    for prop in properties:
        configured_upi = get_configured_upi_for_property(property_name=prop.name, property_id=prop.id)
        current_upi = prop.payment_upi_id

        # Update if not set or if different from authoritative in-code configuration
        if current_upi != configured_upi:
            prop.payment_upi_id = configured_upi
            updated_properties.append({
                "property_id": prop.id,
                "property_name": prop.name,
                "old_upi_id": current_upi,
                "new_upi_id": configured_upi,
            })
            logger.info(
                "Updated Property #%d (%s) UPI ID from '%s' to '%s'",
                prop.id,
                prop.name,
                current_upi,
                configured_upi,
            )

    if updated_properties:
        db.commit()
        logger.info("Successfully synced %d properties with in-code UPI registry", len(updated_properties))
    else:
        logger.debug("All %d properties are already up-to-date with in-code UPI registry", len(properties))

    return {
        "total_properties": len(properties),
        "updated_count": len(updated_properties),
        "updated_properties": updated_properties,
    }
