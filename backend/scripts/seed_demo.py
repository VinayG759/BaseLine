"""Seed the demo: Mrs Sunita Rao with her March and August reports, and Mr Ramesh Rao with none.

Usage (from backend/, with AWS_REGION, BUCKET, TABLE and MODEL_ID set):
    python scripts/seed_demo.py            # create or refresh the demo data
    python scripts/seed_demo.py --reset    # also remove any later uploads for Mrs Sunita Rao

Made-up people and made-up results (the sample-report table in docs/FRONTEND_PLAN.md).
The September report is deliberately left out: it is the live upload in the demo.
Safe to run again: profiles are reused by name and readings overwrite, never duplicate.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))   # so `core` imports from backend/

from core.people import new_person
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
PEOPLE = [("Mrs", "Sunita Rao"), ("Mr", "Ramesh Rao")]


def _find_or_create(services, title, name):
    for person in services.list_people():
        if person.title == title and person.name == name:
            return person
    person = new_person(title, name, False, services.list_people())
    services.save_person(person)
    return person


def seed(services, reset: bool = False) -> None:
    sunita, ramesh = (_find_or_create(services, title, name) for title, name in PEOPLE)
    if reset:
        _clear_readings(services, sunita.person_id)
    for day, readings in READINGS.items():
        services.save_readings(sunita.person_id, readings, f"seed-{day}", "seed:no-image")
    print(f"{sunita.display_name} ({sunita.person_id}): reports on {', '.join(VALUES)}")
    print(f"{ramesh.display_name} ({ramesh.person_id}): no reports")


def _clear_readings(services, person_id: str) -> None:
    import os

    import boto3

    table = boto3.resource("dynamodb", region_name=os.environ["AWS_REGION"]).Table(os.environ["TABLE"])
    for r in services.load_readings(person_id):
        table.delete_item(Key={"personId": person_id, "sk": f"{r.test_key}#{r.taken_on}"})


if __name__ == "__main__":
    from core.services import aws_services

    seed(aws_services(), reset="--reset" in sys.argv[1:])
