import boto3
import pytest
from fastapi.testclient import TestClient

from app import create_app
from core.services import aws_services
from core.trends import Reading

REGION = "us-east-1"
HBA1C = Reading("hba1c", "HbA1c", 6.4, "%", 4.0, 5.6, "2026-09-12")


def test_settings_connect_the_slots_to_s3_and_dynamodb(configured_aws):
    services = aws_services()

    key = services.save_image("amma", "r1", b"photo", "jpeg")
    services.save_readings("amma", [HBA1C], "r1", key)

    assert services.load_readings("amma") == [HBA1C]
    stored = boto3.client("s3", region_name=REGION).get_object(Bucket="baseline-reports-test", Key=key)
    assert stored["Body"].read() == b"photo"


def test_a_missing_setting_is_named_in_the_error(no_settings, monkeypatch):
    monkeypatch.setenv("AWS_REGION", REGION)

    with pytest.raises(RuntimeError, match="BUCKET"):
        aws_services().save_image("amma", "r1", b"photo", "jpeg")


def test_unconfigured_app_starts_and_answers_503_instead_of_crashing(no_settings):
    client = TestClient(create_app(aws_services()))

    r = client.get("/api/trends", params={"person_id": "amma"})

    assert r.status_code == 503
    assert set(r.json()) == {"error"}


def test_the_app_and_lambda_handler_exist_for_uvicorn_and_lambda():
    import app as module

    assert module.app is not None
    assert callable(module.handler)


def test_aws_services_include_a_phrase_slot(no_settings):
    assert callable(aws_services().phrase)


def test_aws_services_include_a_chat_slot(no_settings):
    assert callable(aws_services().chat)


def test_people_are_saved_and_listed_through_dynamodb(configured_aws):
    from core.people import Person
    services = aws_services()
    sunita = Person("sunita-rao-4f2a", "Mrs", "Sunita Rao", False)

    services.save_person(sunita)

    assert services.list_people() == [sunita]
