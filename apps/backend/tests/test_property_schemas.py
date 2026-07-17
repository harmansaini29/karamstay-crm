from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.features.properties.schemas import PropertyCreate, UnitCreate


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
        )


def test_unit_create_accepts_and_round_trips_geolocation() -> None:
    payload = UnitCreate(
        unit_no="101-A",
        unit_type="room",
        rent=Decimal("5000"),
        deposit=Decimal("5000"),
        latitude=26.9124,
        longitude=75.7873,
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
        )
