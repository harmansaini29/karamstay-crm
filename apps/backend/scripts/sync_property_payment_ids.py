"""
CLI script to sync Property UPI / GPay payment IDs from in-code configuration to database.

Usage:
    python scripts/sync_property_payment_ids.py
"""

import sys
from pathlib import Path

# Add project root to sys.path so app modules are resolvable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.property_payments import PROPERTY_PAYMENT_REGISTRY, sync_property_payment_ids_to_db  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402


def main() -> None:
    print("=" * 60)
    print("KaramStay: Synchronizing Property Payment UPI / GPay IDs")
    print("=" * 60)
    print(f"[INFO] In-code registry entries count: {len(PROPERTY_PAYMENT_REGISTRY)}")
    for k, v in PROPERTY_PAYMENT_REGISTRY.items():
        print(f"  • {k} -> {v}")

    try:
        with SessionLocal() as db:
            result = sync_property_payment_ids_to_db(db)

        print("\n[RESULT]")
        print(f"  Total properties checked: {result['total_properties']}")
        print(f"  Properties updated:       {result['updated_count']}")
        for u in result["updated_properties"]:
            print(f"    - #{u['property_id']} {u['property_name']}: '{u['old_upi_id']}' -> '{u['new_upi_id']}'")
        print("\n[SUCCESS] In-code property payment sync completed successfully.")
    except Exception as exc:
        print(f"\n[ERROR] Property payment sync failed: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
