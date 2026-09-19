"""A saved lab report: the photo, when it was taken, and which results came from it.

Readings live in their own rows (one per test per date); a Report record ties them to the photo
and carries what the History tab shows, including a cached plain-language summary per language.
"""
import math
from dataclasses import dataclass, field

from core.extract import normalise
from core.trends import Reading

MAX_RESULTS = 80
MAX_TEST_NAME = 60
MAX_UNIT = 20


class ReportError(ValueError):
    """Raised with a sentence the person reviewing the values can act on."""


@dataclass(frozen=True)
class Report:
    report_id: str
    report_date: str                 # YYYY-MM-DD, the date on the report
    lab_name: str | None
    patient_name: str | None         # as printed on the report (used for the name check)
    s3_key: str                      # the original photo
    uploaded_at: str                 # ISO timestamp
    height_cm: float | None = None   # as measured around this report (optional)
    weight_kg: float | None = None
    test_keys: list[str] = field(default_factory=list)
    summaries: dict[str, str] = field(default_factory=dict)   # lang -> overall summary

    def as_dict(self) -> dict:
        return {
            "report_id": self.report_id,
            "report_date": self.report_date,
            "lab_name": self.lab_name,
            "patient_name": self.patient_name,
            "uploaded_at": self.uploaded_at,
            "height_cm": self.height_cm,
            "weight_kg": self.weight_kg,
            "result_count": len(self.test_keys),
        }


def _number(value, what: str) -> float | None:
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ReportError(f"{what} must be a number.")
    if not math.isfinite(number):
        raise ReportError(f"{what} must be a number.")
    return number


def check_reviewed(rows: list[dict]) -> list[Reading]:
    """Values the person checked or corrected on the review screen, as Readings (date stamped later)."""
    if not 1 <= len(rows or []) <= MAX_RESULTS:
        raise ReportError(f"A report needs between 1 and {MAX_RESULTS} results.")
    readings, seen = [], set()
    for row in rows:
        name = " ".join(str(row.get("test_name") or "").split())
        key = normalise(name)
        if not key or len(name) > MAX_TEST_NAME:
            raise ReportError(f"Every result needs a test name of up to {MAX_TEST_NAME} characters.")
        if key in seen:
            raise ReportError(f"{name} appears twice. Keep one row per test.")
        seen.add(key)
        value = _number(row.get("value"), f"The result for {name}")
        if value is None:
            raise ReportError(f"The result for {name} must be a number.")
        unit = " ".join(str(row.get("unit") or "").split())
        if len(unit) > MAX_UNIT:
            raise ReportError(f"The unit for {name} is too long.")
        low = _number(row.get("ref_low"), f"The lower limit for {name}")
        high = _number(row.get("ref_high"), f"The upper limit for {name}")
        if low is not None and high is not None and low > high:
            raise ReportError(f"The lower limit for {name} is above its upper limit.")
        readings.append(Reading(key, name, value, unit, low, high, ""))
    return readings
