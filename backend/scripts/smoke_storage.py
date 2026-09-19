"""Check the real S3 bucket and DynamoDB table work with our code, then clean up.

Usage (from backend/, with AWS_REGION, BUCKET and TABLE set):
    python scripts/smoke_storage.py

Writes one test profile, two test readings and one test image, reads them back
through the same functions the API uses, then deletes exactly those items.
"""
import os
import sys
from pathlib import Path

import boto3
from boto3.dynamodb.conditions import Key

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))   # so `core` imports from backend/

from core import store
from core.people import Person
from core.services import aws_services
from core.trends import Reading

TEST_ID = "zz-smoke-test-0000"
TEST_OWNER = "smoke-test@baseline.invalid"


def main() -> int:
    services = aws_services()
    person = Person(TEST_ID, "", "Smoke Test", False)
    readings = [
        Reading("hba1c", "HbA1c", 6.4, "%", 4.0, 5.6, "2026-09-12"),
        Reading("totalcholesterol", "Total Cholesterol", 212, "mg/dL", None, 200, "2026-09-12"),
    ]
    ok = True
    key = None
    try:
        services.save_person(TEST_OWNER, person)
        key = services.save_image(TEST_ID, "smoke", b"smoke-test-bytes", "jpeg")
        services.save_readings(TEST_ID, readings, "smoke", key)

        found = [p for p in services.list_people(TEST_OWNER) if p.person_id == TEST_ID]
        loaded = sorted(services.load_readings(TEST_ID), key=lambda r: r.test_key)
        checks = {
            "profile saved and listed": found == [person],
            "readings round-trip exactly (6.4 stays 6.4, missing limit stays missing)":
                loaded == sorted(readings, key=lambda r: r.test_key),
            "image stored under person/report": key == f"{TEST_ID}/smoke.jpeg",
        }
        for name, passed in checks.items():
            print(f"{'PASS' if passed else 'FAIL'}  {name}")
            ok = ok and passed
    finally:
        cleanup(key, readings)
    return 0 if ok else 1


def cleanup(key, readings):
    region = os.environ["AWS_REGION"]
    table = boto3.resource("dynamodb", region_name=region).Table(os.environ["TABLE"])
    table.delete_item(Key={"personId": store.people_partition(TEST_OWNER), "sk": TEST_ID})
    for r in readings:
        table.delete_item(Key={"personId": TEST_ID, "sk": f"{r.test_key}#{r.taken_on}"})
    if key:
        boto3.client("s3", region_name=region).delete_object(Bucket=os.environ["BUCKET"], Key=key)
    readings_left = table.query(KeyConditionExpression=Key("personId").eq(TEST_ID))["Items"]
    profile_left = table.get_item(Key={"personId": store.people_partition(TEST_OWNER), "sk": TEST_ID}).get("Item")
    print(f"cleanup: {'done' if not readings_left and not profile_left else 'ITEMS LEFT BEHIND'}")


if __name__ == "__main__":
    sys.exit(main())
