import re
from decimal import Decimal

import boto3
import pytest
from moto import mock_aws

from core.people import Person
from core.auth import Account, Session
from core.store import (ACCOUNTS_PARTITION, SESSIONS_PARTITION, delete_session, from_item, load_account, load_people,
                        load_readings, load_session, people_partition, save_account, save_image, save_person,
                        save_readings, save_session, to_item)
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


# ---- Against moto: an imitation of S3 and DynamoDB that runs on this laptop ----

REGION = "us-east-1"


@pytest.fixture
def aws(monkeypatch):
    # Fake credentials so nothing can ever reach a real AWS account from the tests.
    for name, value in {"AWS_ACCESS_KEY_ID": "testing", "AWS_SECRET_ACCESS_KEY": "testing",
                        "AWS_SESSION_TOKEN": "testing", "AWS_DEFAULT_REGION": REGION}.items():
        monkeypatch.setenv(name, value)
    with mock_aws():
        yield


@pytest.fixture
def table(aws):
    return boto3.resource("dynamodb", region_name=REGION).create_table(
        TableName="baseline-readings",
        KeySchema=[{"AttributeName": "personId", "KeyType": "HASH"},
                   {"AttributeName": "sk", "KeyType": "RANGE"}],
        AttributeDefinitions=[{"AttributeName": "personId", "AttributeType": "S"},
                              {"AttributeName": "sk", "AttributeType": "S"}],
        BillingMode="PAY_PER_REQUEST",
    )


@pytest.fixture
def s3(aws):
    client = boto3.client("s3", region_name=REGION)
    client.create_bucket(Bucket="baseline-reports-test")
    return client


def test_saved_readings_load_back_unchanged(table):
    cholesterol = Reading("totalcholesterol", "Total Cholesterol", 212, "mg/dL", None, 200, "2026-09-12")

    save_readings(table, "amma", [HBA1C, cholesterol], "r1", "amma/r1.jpeg")

    assert sorted(load_readings(table, "amma"), key=lambda r: r.test_key) == [HBA1C, cholesterol]


def test_readings_are_kept_per_person(table):
    save_readings(table, "amma", [HBA1C], "r1", "amma/r1.jpeg")

    assert load_readings(table, "appa") == []


def test_saving_the_same_report_again_overwrites_it(table):
    save_readings(table, "amma", [HBA1C], "r1", "amma/r1.jpeg")
    save_readings(table, "amma", [HBA1C], "r2", "amma/r2.jpeg")

    assert load_readings(table, "amma") == [HBA1C]


def test_loading_reads_every_page_of_a_long_history(table):
    many = [Reading(f"test{i:03d}", f"Test {i}", float(i), "u", None, None, "2026-09-12") for i in range(300)]
    padding = "x" * 5000   # 300 items x 5 KB > the 1 MB DynamoDB returns per page
    many = [Reading(r.test_key, r.test_name + padding, r.value, r.unit, None, None, r.taken_on) for r in many]

    save_readings(table, "amma", many, "r1", "amma/r1.jpeg")

    assert len(load_readings(table, "amma")) == 300


def test_image_is_stored_under_person_and_report(s3):
    key = save_image(s3, "baseline-reports-test", "amma", "r1", b"photo-bytes", "jpeg")

    assert key == "amma/r1.jpeg"
    obj = s3.get_object(Bucket="baseline-reports-test", Key=key)
    assert obj["Body"].read() == b"photo-bytes"
    assert obj["ContentType"] == "image/jpeg"


def test_saved_people_load_back_for_their_owner(table):
    sunita = Person("sunita-rao-4f2a", "Mrs", "Sunita Rao", False)
    me = Person("arjun-rao-1a2b", "Mr", "Arjun Rao", True)

    save_person(table, "vinay@example.com", sunita)
    save_person(table, "vinay@example.com", me)

    assert sorted(load_people(table, "vinay@example.com"), key=lambda p: p.person_id) == [me, sunita]


def test_each_account_sees_only_its_own_people(table):
    save_person(table, "vinay@example.com", Person("sunita-rao-4f2a", "Mrs", "Sunita Rao", False))

    assert load_people(table, "chethan@example.com") == []


def test_people_are_not_mixed_up_with_readings(table):
    save_person(table, "vinay@example.com", Person("sunita-rao-4f2a", "Mrs", "Sunita Rao", False))
    save_readings(table, "sunita-rao-4f2a", [HBA1C], "r1", "k")

    assert load_readings(table, "sunita-rao-4f2a") == [HBA1C]
    assert [p.person_id for p in load_people(table, "vinay@example.com")] == ["sunita-rao-4f2a"]


def test_reserved_partitions_can_never_be_a_person_id():
    # Person IDs must match the contract pattern; reserved partitions must not,
    # so a person's readings can never land among accounts, sessions or profiles.
    for partition in (ACCOUNTS_PARTITION, SESSIONS_PARTITION, people_partition("vinay@example.com")):
        assert not re.fullmatch(r"[a-z0-9-]{1,32}", partition)


def test_accounts_save_and_load_by_email(table):
    account = Account("vinay@example.com", "pbkdf2_sha256$1000$salt$hash")

    save_account(table, account)

    assert load_account(table, "vinay@example.com") == account
    assert load_account(table, "nobody@example.com") is None


def test_sessions_save_load_and_delete(table):
    session = Session("abc123", "vinay@example.com", "2026-09-26T00:00:00+00:00")

    save_session(table, session)
    assert load_session(table, "abc123") == session

    delete_session(table, "abc123")
    assert load_session(table, "abc123") is None
