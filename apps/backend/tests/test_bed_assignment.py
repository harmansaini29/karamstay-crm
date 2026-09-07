"""
Integration tests for bed assignment, vacate, and conflict-rejection workflows.
Runs entirely against the SQLite in-memory engine set up in conftest.py — no
real DB or network required.
"""
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.features.properties.schemas import BedAssign, BedVacate

# ─── BedAssign Schema Validation ─────────────────────────────────────────────

def test_bed_assign_requires_at_least_one_bed_id() -> None:
    with pytest.raises(ValidationError):
        BedAssign(bed_ids=[], tenant_id=1)


def test_bed_assign_requires_positive_tenant_id() -> None:
    with pytest.raises(ValidationError):
        BedAssign(bed_ids=[1], tenant_id=0)


def test_bed_assign_single_bed_valid() -> None:
    payload = BedAssign(bed_ids=[42], tenant_id=7)
    assert payload.bed_ids == [42]
    assert payload.tenant_id == 7


def test_bed_assign_multi_bed_valid() -> None:
    payload = BedAssign(bed_ids=[1, 2, 3], tenant_id=5)
    assert len(payload.bed_ids) == 3


def test_bed_vacate_requires_at_least_one_bed_id() -> None:
    with pytest.raises(ValidationError):
        BedVacate(bed_ids=[])


def test_bed_vacate_single_valid() -> None:
    payload = BedVacate(bed_ids=[10])
    assert payload.bed_ids == [10]


# ─── Service-layer integration (SQLite in-memory) ─────────────────────────────

def _get_or_create_owner(db_session, email="owner@test.com"):
    """Helper: create an owner user without external dependencies."""
    from sqlalchemy import select

    from app.features.auth.models import Role, User

    role = db_session.scalar(select(Role).where(Role.name == "owner"))
    if not role:
        role = Role(name="owner", description="Owner")
        db_session.add(role)
        db_session.flush()

    user = User(role_id=role.id, name="Test Owner", email=email, is_active=True)
    db_session.add(user)
    db_session.flush()
    return user


def _seed_unit_with_beds(db_session, owner, n_master=2, n_common=1, n_hall=0):
    """Helper: create a property + unit + beds, return (unit, beds)."""
    from app.features.properties.models import Bed, Property, Unit

    prop = Property(
        owner_id=owner.id,
        name="Test Property",
        address="123 Main St, Jaipur",
        property_type="PG",
        created_by_id=owner.id,
        updated_by_id=owner.id,
    )
    db_session.add(prop)
    db_session.flush()

    unit = Unit(
        property_id=prop.id,
        unit_no="101",
        unit_type="room",
        rent=Decimal("5000"),
        deposit=Decimal("10000"),
        capacity=n_master + n_common + n_hall,
        created_by_id=owner.id,
        updated_by_id=owner.id,
    )
    db_session.add(unit)
    db_session.flush()

    beds = []
    blocks = [(n_master, "MB", "MASTER_BED"), (n_common, "CB", "COMMON_BED"), (n_hall, "H", "HALL")]
    for cap, code, rt in blocks:
        for i in range(1, cap + 1):
            bed = Bed(
                unit_id=unit.id,
                bed_no=f"Bed {code} {i}",
                status="vacant",
                room_type=rt,
                created_by_id=owner.id,
                updated_by_id=owner.id,
            )
            db_session.add(bed)
            beds.append(bed)
    db_session.flush()
    db_session.commit()
    for b in beds:
        db_session.refresh(b)
    db_session.refresh(unit)
    return unit, beds


def test_single_bed_assignment_vacant_to_occupied(db_session) -> None:
    """Single bed: VACANT → OCCUPIED after assign_beds call."""
    from app.features.properties.schemas import BedAssign
    from app.features.properties.service import PropertyService

    owner = _get_or_create_owner(db_session, email="owner_sb@test.com")
    unit, beds = _seed_unit_with_beds(db_session, owner)
    mb1 = beds[0]
    assert mb1.status == "vacant"

    payload = BedAssign(bed_ids=[mb1.id], tenant_id=99)
    svc = PropertyService(db_session)
    result = svc.assign_beds(unit.id, payload, owner)

    assert len(result) == 1
    assert result[0].status == "occupied"
    db_session.refresh(unit)
    assert unit.status == "occupied"


def test_multi_bed_merge_assignment(db_session) -> None:
    """Multi-bed: MB 1 + CB 1 assigned together — both become OCCUPIED atomically."""
    from app.features.properties.schemas import BedAssign
    from app.features.properties.service import PropertyService

    owner = _get_or_create_owner(db_session, email="owner_mb@test.com")
    unit, beds = _seed_unit_with_beds(db_session, owner, n_master=2, n_common=1)
    mb1, mb2, cb1 = beds[0], beds[1], beds[2]

    payload = BedAssign(bed_ids=[mb1.id, cb1.id], tenant_id=100)
    svc = PropertyService(db_session)
    result = svc.assign_beds(unit.id, payload, owner)

    assert len(result) == 2
    statuses = {r.bed_no: r.status for r in result}
    assert statuses[mb1.bed_no] == "occupied"
    assert statuses[cb1.bed_no] == "occupied"
    # mb2 still vacant
    db_session.refresh(mb2)
    assert mb2.status == "vacant"


def test_assign_already_occupied_bed_raises_409(db_session) -> None:
    """Assigning a bed that's already OCCUPIED must raise HTTP 409 conflict."""
    from fastapi import HTTPException

    from app.features.properties.schemas import BedAssign
    from app.features.properties.service import PropertyService

    owner = _get_or_create_owner(db_session, email="owner_dup@test.com")
    unit, beds = _seed_unit_with_beds(db_session, owner, n_master=1, n_common=0)
    mb1 = beds[0]

    svc = PropertyService(db_session)
    # First assignment — should succeed
    svc.assign_beds(unit.id, BedAssign(bed_ids=[mb1.id], tenant_id=1), owner)

    # Second attempt on the same bed — must be rejected
    with pytest.raises(HTTPException) as exc_info:
        svc.assign_beds(unit.id, BedAssign(bed_ids=[mb1.id], tenant_id=2), owner)

    assert exc_info.value.status_code == 409
    assert "occupied" in exc_info.value.detail.lower()


def test_vacate_resets_beds_to_vacant(db_session) -> None:
    """vacate_beds resets all assigned beds back to VACANT and unit status syncs."""
    from app.features.properties.schemas import BedAssign, BedVacate
    from app.features.properties.service import PropertyService

    owner = _get_or_create_owner(db_session, email="owner_vac@test.com")
    unit, beds = _seed_unit_with_beds(db_session, owner, n_master=2, n_common=0)
    mb1, mb2 = beds[0], beds[1]

    svc = PropertyService(db_session)
    # Assign both
    svc.assign_beds(unit.id, BedAssign(bed_ids=[mb1.id, mb2.id], tenant_id=5), owner)

    db_session.refresh(unit)
    assert unit.status == "occupied"

    # Vacate both
    result = svc.vacate_beds(unit.id, BedVacate(bed_ids=[mb1.id, mb2.id]), owner)

    assert all(r.status == "vacant" for r in result)
    db_session.refresh(unit)
    # All beds vacant → unit reverts to vacant
    assert unit.status == "vacant"


def test_vacate_partial_keeps_unit_occupied(db_session) -> None:
    """Vacating only some beds keeps unit status OCCUPIED if other beds remain."""
    from app.features.properties.schemas import BedAssign, BedVacate
    from app.features.properties.service import PropertyService

    owner = _get_or_create_owner(db_session, email="owner_part@test.com")
    unit, beds = _seed_unit_with_beds(db_session, owner, n_master=2, n_common=1)
    mb1, mb2, cb1 = beds[0], beds[1], beds[2]

    svc = PropertyService(db_session)
    # Assign all three
    svc.assign_beds(unit.id, BedAssign(bed_ids=[mb1.id, mb2.id, cb1.id], tenant_id=10), owner)

    # Vacate only mb1 — mb2 and cb1 remain occupied
    svc.vacate_beds(unit.id, BedVacate(bed_ids=[mb1.id]), owner)

    db_session.refresh(mb1)
    db_session.refresh(unit)
    assert mb1.status == "vacant"
    assert unit.status == "occupied"  # Still has occupied beds


def test_assign_nonexistent_bed_raises_404(db_session) -> None:
    """Assigning a bed ID that does not belong to the unit must raise HTTP 404."""
    from fastapi import HTTPException

    from app.features.properties.schemas import BedAssign
    from app.features.properties.service import PropertyService

    owner = _get_or_create_owner(db_session, email="owner_404@test.com")
    unit, _ = _seed_unit_with_beds(db_session, owner, n_master=1, n_common=0)

    svc = PropertyService(db_session)
    with pytest.raises(HTTPException) as exc_info:
        svc.assign_beds(unit.id, BedAssign(bed_ids=[999999], tenant_id=1), owner)

    assert exc_info.value.status_code == 404


def test_e2e_unit_creation_5_beds_assignment_and_counters_sync(db_session) -> None:
    """E2E workflow:
    1. Create Unit with MB: 2, CB: 2, H: 1 (Total: 5 beds)
    2. Verify DB commits 5 distinct beds with correct block codes and room_types
    3. Eagerly fetch unit -> verify all 5 beds are serialized
    4. Assign Bed MB 1 to tenant -> bed becomes OCCUPIED, parent unit becomes OCCUPIED
    5. Vacate Bed MB 1 -> bed returns to VACANT, parent unit returns to VACANT
    """
    from app.features.properties.models import Property
    from app.features.properties.schemas import BedAssign, BedVacate, UnitCreate
    from app.features.properties.service import PropertyService

    owner = _get_or_create_owner(db_session, email="owner_e2e@test.com")
    prop = Property(
        owner_id=owner.id,
        name="Grand Residency PG",
        address="Koramangala, Bengaluru",
        property_type="PG",
        created_by_id=owner.id,
        updated_by_id=owner.id,
    )
    db_session.add(prop)
    db_session.commit()
    db_session.refresh(prop)

    svc = PropertyService(db_session)

    # 1. Create Unit with MB: 2, CB: 2, H: 1
    create_payload = UnitCreate(
        unit_no="301",
        unit_type="shared",
        rent=Decimal("25000"),
        deposit=Decimal("50000"),
        master_bed_capacity=2,
        common_bed_capacity=2,
        hall_capacity=1,
    )
    created_unit = svc.create_unit(prop.id, create_payload, owner)

    assert created_unit.capacity == 5
    assert len(created_unit.beds) == 5

    # 2. Verify all 5 beds have deterministic names and room types
    bed_names = [b.bed_no for b in created_unit.beds]
    assert bed_names == ["Bed MB 1", "Bed MB 2", "Bed CB 1", "Bed CB 2", "Bed H 1"]
    assert all(b.status == "vacant" for b in created_unit.beds)

    # 3. Eagerly fetch unit
    fetched_unit = svc.get_unit_for_user(created_unit.id, owner)
    assert len(fetched_unit.beds) == 5

    # 4. Assign tenant to Bed MB 1
    mb1 = next(b for b in fetched_unit.beds if b.bed_no == "Bed MB 1")
    assign_result = svc.assign_beds(fetched_unit.id, BedAssign(bed_ids=[mb1.id], tenant_id=77), owner)

    assert len(assign_result) == 1
    assert assign_result[0].status == "occupied"

    # Verify parent unit status syncs to occupied
    db_session.refresh(fetched_unit)
    assert fetched_unit.status == "occupied"

    # Other 4 beds remain vacant
    remaining_beds = svc.list_beds(fetched_unit.id, owner)
    vacant_beds = [b for b in remaining_beds if b.status == "vacant"]
    assert len(vacant_beds) == 4

    # 5. Vacate Bed MB 1
    vacate_result = svc.vacate_beds(fetched_unit.id, BedVacate(bed_ids=[mb1.id]), owner)
    assert len(vacate_result) == 1
    assert vacate_result[0].status == "vacant"

    # Verify parent unit status reverts to vacant (0 occupied beds)
    db_session.refresh(fetched_unit)
    assert fetched_unit.status == "vacant"


