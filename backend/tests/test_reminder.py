from datetime import date

from core.reminder import reminder
from core.trends import Reading


def on(day):
    return Reading("hba1c", "HbA1c", 6.4, "%", 4.0, 5.6, day)


def test_no_reports_means_no_reminder():
    assert reminder([], today=date(2026, 9, 19)) is None


def test_next_test_is_due_90_days_after_the_latest_report():
    assert reminder([on("2026-03-04"), on("2026-09-12")], today=date(2026, 9, 19)) == {
        "last_report": "2026-09-12",
        "next_due": "2026-12-11",
        "overdue": False,
    }


def test_overdue_once_the_due_date_has_passed():
    assert reminder([on("2026-03-04")], today=date(2026, 9, 19))["overdue"] is True


def test_not_overdue_on_the_due_date_itself():
    assert reminder([on("2026-09-12")], today=date(2026, 12, 11))["overdue"] is False
