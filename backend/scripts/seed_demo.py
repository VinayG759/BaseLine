"""Seed the demo: Mrs Sunita Rao with her March and August reports, and Mr Ramesh Rao with none.

Usage (from backend/, with AWS_REGION, BUCKET and TABLE set):
    python scripts/seed_demo.py --email you@example.com            # seed into that account
    python scripts/seed_demo.py --email you@example.com --reset    # also remove later uploads for Mrs Sunita Rao

Register the account in the app first; the people are added to that account.

Made-up people and made-up results (the sample-report table in docs/FRONTEND_PLAN.md).
The September report is deliberately left out: it is the live upload in the demo.
Safe to run again: profiles are reused by name and readings overwrite, never duplicate.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))   # so `core` imports from backend/

from datetime import date, datetime, timezone

from core.people import new_person
from core.reports import Report
from core.trends import Reading

# test_key, test_name, unit, ref_low, ref_high
TESTS = [
    ("hba1c", "HbA1c", "%", 4.0, 5.6),
    ("fastingbloodglucose", "Fasting Blood Glucose", "mg/dL", 70, 100),
    ("totalcholesterol", "Total Cholesterol", "mg/dL", None, 200),
    ("haemoglobin", "Haemoglobin", "g/dL", 13.0, 17.0),
    ("serumcreatinine", "Serum Creatinine", "mg/dL", 0.7, 1.3),
]
VALUES = {
    "2026-03-04": [5.6, 98, 224, 13.9, 1.0],
    "2026-08-08": [6.1, 109, 215, 13.6, 1.1],
}
READINGS = {
    day: [Reading(key, name, value, unit, low, high, day)
          for (key, name, unit, low, high), value in zip(TESTS, values)]
    for day, values in VALUES.items()
}
# title, name, gender, age
PEOPLE = [("Mrs", "Sunita Rao", "female", 54), ("Mr", "Ramesh Rao", "male", 58)]


def _find_or_create(services, owner, title, name, gender, age):
    for person in services.list_people(owner):
        if person.title == title and person.name == name:
            return person
    person = new_person(title, name, False, services.list_people(owner), gender=gender, age=age,
                        today=date.today())
    services.save_person(owner, person)
    return person


def seed(services, owner: str, reset: bool = False) -> None:
    sunita, ramesh = (_find_or_create(services, owner, *details) for details in PEOPLE)
    if reset:
        _clear_readings(services, sunita.person_id)
    for day, readings in READINGS.items():
        report_id = f"seed-{day}"
        services.save_readings(sunita.person_id, readings, report_id, "")
        services.save_report(sunita.person_id, Report(
            report_id=report_id, report_date=day, lab_name="Sri Sai Diagnostics", patient_name="Mrs Sunita Rao",
            s3_key="", uploaded_at=datetime.now(timezone.utc).isoformat(),
            test_keys=[r.test_key for r in readings]))   # seeded: no photo
    print(f"{sunita.display_name} ({sunita.person_id}): reports on {', '.join(VALUES)}")
    print(f"{ramesh.display_name} ({ramesh.person_id}): no reports")


def _clear_readings(services, person_id: str) -> None:
    import os

    import boto3

    table = boto3.resource("dynamodb", region_name=os.environ["AWS_REGION"]).Table(os.environ["TABLE"])
    for r in services.load_readings(person_id):
        table.delete_item(Key={"personId": person_id, "sk": f"{r.test_key}#{r.taken_on}"})
    for report in services.list_reports(person_id):
        services.delete_report(person_id, report.report_id)
        if report.s3_key:
            services.delete_image(report.s3_key)


if __name__ == "__main__":
    from core.services import aws_services

    import argparse

    from core.auth import normalise_email

    parser = argparse.ArgumentParser(description="Seed the Baseline demo people into one account.")
    parser.add_argument("--email", required=True, help="the account to seed into (register it in the app first)")
    parser.add_argument("--reset", action="store_true", help="also remove later uploads for Mrs Sunita Rao")
    args = parser.parse_args()
    seed(aws_services(), normalise_email(args.email), reset=args.reset)
