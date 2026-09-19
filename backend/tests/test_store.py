from decimal import Decimal

from core.store import from_item, to_item
from core.trends import Reading

HBA1C = Reading("hba1c", "HbA1c", 6.4, "%", 4.0, 5.6, "2026-09-12")


def test_item_is_keyed_by_person_and_test_then_date():
    item = to_item("amma", HBA1C, "r1", "amma/r1.jpg")

    assert item["personId"] == "amma"
    assert item["sk"] == "hba1c#2026-09-12"
    assert item["reportId"] == "r1"
    assert item["s3Key"] == "amma/r1.jpg"


def test_numbers_are_stored_as_exact_decimals():
    item = to_item("amma", HBA1C, "r1", "amma/r1.jpg")

    assert item["value"] == Decimal("6.4")
    assert str(item["value"]) == "6.4"


def test_missing_range_limit_stays_missing():
    one_sided = Reading("totalcholesterol", "Total Cholesterol", 212, "mg/dL", None, 200, "2026-09-12")

    item = to_item("amma", one_sided, "r1", "amma/r1.jpg")

    assert item["ref_low"] is None
    assert item["ref_high"] == Decimal("200")


def test_round_trip_gives_back_the_same_reading():
    assert from_item(to_item("amma", HBA1C, "r1", "amma/r1.jpg")) == HBA1C
