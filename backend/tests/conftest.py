"""Fixtures shared by several test files."""
import boto3
import pytest
from moto import mock_aws

REGION = "us-east-1"


@pytest.fixture
def no_settings(monkeypatch):
    for name in ("AWS_REGION", "AWS_DEFAULT_REGION", "MODEL_ID", "BUCKET", "TABLE"):
        monkeypatch.delenv(name, raising=False)
    for name, value in {"AWS_ACCESS_KEY_ID": "testing", "AWS_SECRET_ACCESS_KEY": "testing",
                        "AWS_SESSION_TOKEN": "testing"}.items():
        monkeypatch.setenv(name, value)


@pytest.fixture
def configured_aws(no_settings, monkeypatch):
    for name, value in {"AWS_REGION": REGION, "MODEL_ID": "us.amazon.nova-pro-v1:0",
                        "BUCKET": "baseline-reports-test", "TABLE": "baseline-readings"}.items():
        monkeypatch.setenv(name, value)
    with mock_aws():
        boto3.client("s3", region_name=REGION).create_bucket(Bucket="baseline-reports-test")
        boto3.resource("dynamodb", region_name=REGION).create_table(
            TableName="baseline-readings",
            KeySchema=[{"AttributeName": "personId", "KeyType": "HASH"},
                       {"AttributeName": "sk", "KeyType": "RANGE"}],
            AttributeDefinitions=[{"AttributeName": "personId", "AttributeType": "S"},
                                  {"AttributeName": "sk", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        yield


@pytest.fixture(autouse=True)
def fast_password_hashing(monkeypatch):
    """600,000 rounds is right for real passwords but slow for tests; the strength test checks the default."""
    from core import auth
    monkeypatch.setattr(auth, "ITERATIONS", 1_000)
