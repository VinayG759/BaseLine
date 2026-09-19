"""Storage format for readings.

DynamoDB refuses Python floats, and Decimal(6.4) straight from a float stores
6.4000000000000003552... So numbers go in as Decimal built from their text,
and come back out as floats. The functions that talk to DynamoDB itself are
added once AWS access works.
"""
from decimal import Decimal

from core.trends import Reading


def _to_decimal(x: float | None) -> Decimal | None:
    return None if x is None else Decimal(str(x))


def _to_float(x: Decimal | None) -> float | None:
    return None if x is None else float(x)


def to_item(person_id: str, r: Reading, report_id: str, s3_key: str) -> dict:
    """One DynamoDB item per reading. The sort key makes a re-upload overwrite, not duplicate."""
    return {
        "personId": person_id,
        "sk": f"{r.test_key}#{r.taken_on}",
        "test_key": r.test_key,
        "test_name": r.test_name,
        "value": _to_decimal(r.value),
        "unit": r.unit,
        "ref_low": _to_decimal(r.ref_low),
        "ref_high": _to_decimal(r.ref_high),
        "taken_on": r.taken_on,
        "reportId": report_id,
        "s3Key": s3_key,
    }


def from_item(item: dict) -> Reading:
    return Reading(
        test_key=item["test_key"],
        test_name=item["test_name"],
        value=_to_float(item["value"]),
        unit=item["unit"],
        ref_low=_to_float(item.get("ref_low")),
        ref_high=_to_float(item.get("ref_high")),
        taken_on=item["taken_on"],
    )
