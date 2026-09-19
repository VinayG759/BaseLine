"""When the next lab test is due. A reminder setting, not medical advice."""
from datetime import date, timedelta

from core.trends import Reading

REMIND_AFTER_DAYS = 90


def reminder(readings: list[Reading], today: date) -> dict | None:
    if not readings:
        return None
    last = max(r.taken_on for r in readings)
    due = date.fromisoformat(last) + timedelta(days=REMIND_AFTER_DAYS)
    return {"last_report": last, "next_due": due.isoformat(), "overdue": today > due}
