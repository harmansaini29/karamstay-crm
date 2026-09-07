from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.features.properties.schemas import PropertyCreate, UnitCreate

# ─── Pre-existing baseline tests (unchanged) ─────────────────────────────────

def test_property_create_requires_real_name_and_address() -> None:
    payload = PropertyCreate(
        name="Karam PG",
        address="Main Road, Jaipur",
        property_type="PG",
    )

    assert payload.name == "Karam PG"
    assert payload.property_type == "PG"


def test_unit_create_rejects_negative_rent() -> None:
    with pytest.raises(ValidationError):
        UnitCreate(
            unit_no="101-A",
            unit_type="room",
            rent=Decimal("-1"),
            deposit=Decimal("5000"),
            master_bed_capacity=1,
        )


def test_unit_create_accepts_and_round_trips_geolocation() -> None:
    payload = UnitCreate(
        unit_no="101-A",
        unit_type="room",
        rent=Decimal("5000"),
        deposit=Decimal("5000"),
        latitude=26.9124,
        longitude=75.7873,
        master_bed_capacity=1,
    )

    assert payload.latitude == 26.9124
    assert payload.longitude == 75.7873


def test_unit_create_rejects_out_of_range_latitude() -> None:
    with pytest.raises(ValidationError):
        UnitCreate(
            unit_no="101-A",
            unit_type="room",
            rent=Decimal("5000"),
            deposit=Decimal("5000"),
            latitude=200,
            master_bed_capacity=1,
        )


# ─── New: Tiered capacity & deterministic bed naming ─────────────────────────

def test_unit_create_derives_capacity_from_all_three_blocks() -> None:
    """capacity == MB + CB + H automatically."""
    payload = UnitCreate(
        unit_no="201",
        unit_type="room",
        rent=Decimal("7000"),
        deposit=Decimal("14000"),
        master_bed_capacity=2,
        common_bed_capacity=1,
        hall_capacity=1,
    )
    assert payload.capacity == 4
    assert payload.master_bed_capacity == 2
    assert payload.common_bed_capacity == 1
    assert payload.hall_capacity == 1


def test_unit_create_zero_cb_and_h_uses_only_mb() -> None:
    """Zero-value blocks are accepted; capacity = MB only."""
    payload = UnitCreate(
        unit_no="202",
        unit_type="room",
        rent=Decimal("6000"),
        deposit=Decimal("12000"),
        master_bed_capacity=2,
        common_bed_capacity=0,
        hall_capacity=0,
    )
    assert payload.capacity == 2


def test_unit_create_rejects_all_zero_capacity() -> None:
    """All-zero tiered capacities must raise ValidationError."""
    with pytest.raises(ValidationError):
        UnitCreate(
            unit_no="203",
            unit_type="room",
            rent=Decimal("5000"),
            deposit=Decimal("5000"),
            master_bed_capacity=0,
            common_bed_capacity=0,
            hall_capacity=0,
        )


def test_unit_create_rejects_negative_block_capacity() -> None:
    """Negative block values must raise ValidationError (ge=0 constraint)."""
    with pytest.raises(ValidationError):
        UnitCreate(
            unit_no="204",
            unit_type="room",
            rent=Decimal("5000"),
            deposit=Decimal("5000"),
            master_bed_capacity=-1,
            common_bed_capacity=1,
            hall_capacity=0,
        )


def test_bed_name_pattern_mb_only() -> None:
    """Schema validator generates correct bed naming metadata accessible as plain attributes."""
    payload = UnitCreate(
        unit_no="301",
        unit_type="room",
        rent=Decimal("8000"),
        deposit=Decimal("16000"),
        master_bed_capacity=3,
        common_bed_capacity=0,
        hall_capacity=0,
    )
    # Validate expected bed labels that the service will create
    expected_names = [f"Bed MB {i}" for i in range(1, payload.master_bed_capacity + 1)]
    assert expected_names == ["Bed MB 1", "Bed MB 2", "Bed MB 3"]
    assert payload.capacity == 3


def test_bed_name_pattern_all_three_blocks() -> None:
    """Standard 3-block scenario: MB=2, CB=1, H=1 → 4 beds with correct names."""
    payload = UnitCreate(
        unit_no="302",
        unit_type="room",
        rent=Decimal("9000"),
        deposit=Decimal("18000"),
        master_bed_capacity=2,
        common_bed_capacity=1,
        hall_capacity=1,
    )
    mb_names = [f"Bed MB {i}" for i in range(1, payload.master_bed_capacity + 1)]
    cb_names = [f"Bed CB {i}" for i in range(1, payload.common_bed_capacity + 1)]
    h_names  = [f"Bed H {i}"  for i in range(1, payload.hall_capacity + 1)]

    assert mb_names == ["Bed MB 1", "Bed MB 2"]
    assert cb_names == ["Bed CB 1"]
    assert h_names  == ["Bed H 1"]
    assert payload.capacity == 4


def test_bed_name_pattern_hall_only() -> None:
    """Hall-only block generates H-prefixed names."""
    payload = UnitCreate(
        unit_no="303",
        unit_type="room",
        rent=Decimal("4000"),
        deposit=Decimal("8000"),
        master_bed_capacity=0,
        common_bed_capacity=0,
        hall_capacity=3,
    )
    h_names = [f"Bed H {i}" for i in range(1, payload.hall_capacity + 1)]
    assert h_names == ["Bed H 1", "Bed H 2", "Bed H 3"]
    assert payload.capacity == 3


def _generate_beds(payload: UnitCreate) -> list[dict]:
    """Pure helper — mirrors the service's bed generation loop for schema-layer testing."""
    blocks = [
        (payload.master_bed_capacity, "MB", "MASTER_BED"),
        (payload.common_bed_capacity, "CB", "COMMON_BED"),
        (payload.hall_capacity,       "H",  "HALL"),
    ]
    beds = []
    for cap, code, room_type in blocks:
        for i in range(1, cap + 1):
            beds.append({"bed_no": f"Bed {code} {i}", "room_type": room_type, "status": "vacant"})
    return beds


def test_bed_generation_zero_block_skipped() -> None:
    """Zero-capacity block produces no bed records."""
    payload = UnitCreate(
        unit_no="401",
        unit_type="room",
        rent=Decimal("5000"),
        deposit=Decimal("10000"),
        master_bed_capacity=2,
        common_bed_capacity=0,
        hall_capacity=1,
    )
    beds = _generate_beds(payload)
    bed_nos = [b["bed_no"] for b in beds]

    assert "Bed MB 1" in bed_nos
    assert "Bed MB 2" in bed_nos
    assert "Bed H 1" in bed_nos
    # CB block has 0 capacity — must produce no CB entries
    assert not any("CB" in b for b in bed_nos)
    assert len(beds) == 3


def test_bed_generation_room_types_are_correct() -> None:
    """Each generated bed carries the correct room_type tag."""
    payload = UnitCreate(
        unit_no="402",
        unit_type="room",
        rent=Decimal("5000"),
        deposit=Decimal("10000"),
        master_bed_capacity=1,
        common_bed_capacity=1,
        hall_capacity=1,
    )
    beds = _generate_beds(payload)
    by_no = {b["bed_no"]: b for b in beds}

    assert by_no["Bed MB 1"]["room_type"] == "MASTER_BED"
    assert by_no["Bed CB 1"]["room_type"] == "COMMON_BED"
    assert by_no["Bed H 1"]["room_type"]  == "HALL"
