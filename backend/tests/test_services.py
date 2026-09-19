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

    r = client.post("/api/auth/register", json={"email": "vinay@example.com", "password": "long enough", "username": "Vinay"})

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

    services.save_person("vinay@example.com", sunita)

    assert services.list_people("vinay@example.com") == [sunita]


# ---- Choosing the model provider ----

def test_openrouter_provider_reads_reports_through_openrouter(no_settings, monkeypatch):
    import json

    from core import openrouter
    from tests.test_openrouter import REPLY, FakeClient

    fake = FakeClient(json.dumps(REPLY))
    monkeypatch.setenv("MODEL_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test")
    monkeypatch.setattr(openrouter, "make_client", lambda key: fake)

    result = aws_services().read_report(b"photo", "jpeg")

    assert result.readings[0].test_key == "hba1c"
    assert fake.requests[0]["model"] == "google/gemini-3.5-flash-lite"


def test_openrouter_model_can_be_changed_by_setting(no_settings, monkeypatch):
    import json

    from core import openrouter
    from tests.test_openrouter import FakeClient

    fake = FakeClient(json.dumps({"hba1c": "ok"}))
    monkeypatch.setenv("MODEL_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test")
    monkeypatch.setenv("OPENROUTER_MODEL", "google/gemini-3.8-flash")
    monkeypatch.setattr(openrouter, "make_client", lambda key: fake)

    aws_services().phrase({"hba1c": "x"}, "kn")

    assert fake.requests[0]["model"] == "google/gemini-3.8-flash"


def test_openrouter_without_a_key_names_the_missing_setting(no_settings, monkeypatch):
    monkeypatch.setenv("MODEL_PROVIDER", "openrouter")

    with pytest.raises(RuntimeError, match="OPENROUTER_API_KEY"):
        aws_services().read_report(b"photo", "jpeg")


def test_an_unknown_provider_is_named_in_the_error(no_settings, monkeypatch):
    monkeypatch.setenv("MODEL_PROVIDER", "openai")

    with pytest.raises(RuntimeError, match="MODEL_PROVIDER"):
        aws_services().read_report(b"photo", "jpeg")
