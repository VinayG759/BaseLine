"""The doctor view: every result as a clinical table, not friendly sentences.

Each result keeps its own unit, range and flag, because different labs print
different ranges; a doctor needs to see the value against the range it was
reported with.
"""
from core.trends import Reading, group_by_test, range_status

FLAGS = {"high": "H", "low": "L"}


def doctor_view(person_id: str, readings: list[Reading]) -> dict:
    tests = []
    for group in group_by_test(readings):
        ordered = sorted(group, key=lambda r: r.taken_on)
        newest = ordered[-1]
        tests.append({
            "test_key": newest.test_key,
            "test_name": newest.test_name,
            "results": [
                {
                    "date": r.taken_on,
                    "value": r.value,
                    "unit": r.unit,
                    "ref_low": r.ref_low,
                    "ref_high": r.ref_high,
                    "flag": FLAGS.get(range_status(r.value, r.ref_low, r.ref_high), ""),
                }
                for r in ordered
            ],
        })
    tests.sort(key=lambda t: t["test_name"].lower())
    return {
        "person_id": person_id,
        "report_dates": sorted({r.taken_on for r in readings}),
        "tests": tests,
    }
