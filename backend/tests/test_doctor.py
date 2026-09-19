from core.doctor import doctor_view
from core.trends import Reading


def reading(key, name, value, date, unit="%", ref_low=4.0, ref_high=5.6):
    return Reading(key, name, value, unit, ref_low, ref_high, date)


def test_empty_history_gives_an_empty_table():
    assert doctor_view("appa", []) == {"person_id": "appa", "report_dates": [], "tests": []}


def test_tests_are_alphabetical_and_results_oldest_first():
    view = doctor_view("amma", [
        reading("hba1c", "HbA1c", 6.4, "2026-09-12"),
        reading("fastingbloodglucose", "Fasting Blood Glucose", 98, "2026-03-04", "mg/dL", 70, 100),
        reading("hba1c", "HbA1c", 5.6, "2026-03-04"),
    ])

    assert [t["test_name"] for t in view["tests"]] == ["Fasting Blood Glucose", "HbA1c"]
    assert [r["date"] for r in view["tests"][1]["results"]] == ["2026-03-04", "2026-09-12"]
    assert view["report_dates"] == ["2026-03-04", "2026-09-12"]


def test_each_result_keeps_its_own_range_unit_and_flag():
    # Two labs, two different printed ranges: each value is judged against its own report.
    view = doctor_view("amma", [
        reading("hba1c", "HbA1c", 5.8, "2026-03-04", ref_high=5.6),
        reading("hba1c", "HbA1c", 5.8, "2026-09-12", ref_high=6.0),
    ])

    assert view["tests"][0]["results"] == [
        {"date": "2026-03-04", "value": 5.8, "unit": "%", "ref_low": 4.0, "ref_high": 5.6, "flag": "H"},
        {"date": "2026-09-12", "value": 5.8, "unit": "%", "ref_low": 4.0, "ref_high": 6.0, "flag": ""},
    ]


def test_low_and_unknown_ranges_are_flagged_correctly():
    view = doctor_view("amma", [
        reading("haemoglobin", "Haemoglobin", 11.2, "2026-09-12", "g/dL", 13.0, 17.0),
        reading("vitamind", "Vitamin D", 30, "2026-09-12", "ng/mL", None, None),
    ])

    assert [r["flag"] for t in view["tests"] for r in t["results"]] == ["L", ""]


def test_order_follows_the_printed_name_not_the_internal_key():
    view = doctor_view("amma", [
        reading("a-key", "Zinc", 90, "2026-09-12", "ug/dL", 60, 120),
        reading("z-key", "Albumin", 4.2, "2026-09-12", "g/dL", 3.5, 5.2),
    ])

    assert [t["test_name"] for t in view["tests"]] == ["Albumin", "Zinc"]
