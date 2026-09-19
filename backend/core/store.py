"""Where readings and report images live: DynamoDB and S3.

DynamoDB refuses Python floats, and Decimal(6.4) straight from a float stores
6.4000000000000003552... So numbers go in as Decimal built from their text,
and come back out as floats.
"""
from decimal import Decimal

from boto3.dynamodb.conditions import Key

from core.auth import Account, Session
from core.people import Person
from core.trends import Reading

CONTENT_TYPES = {"jpeg": "image/jpeg", "png": "image/png"}
# Reserved partitions start with "#", which can't appear in a person ID, so they never collide with readings.
ACCOUNTS_PARTITION = "#accounts"
SESSIONS_PARTITION = "#sessions"


def people_partition(owner: str) -> str:
    """Each account's people live in their own partition, so accounts never see each other's."""
    return f"#people#{owner}"


def _to_decimal(x: float | None) -> Decimal | None:
    return None if x is None else Decimal(str(x))


def _to_float(x: Decimal | None) -> float | None:
    return None if x is None else float(x)


def to_item(person_id: str, r: Reading, report_id: str, s3_key: str) -> dict:
    """One DynamoDB item per reading. The sort key makes a re-upload overwrite, not duplicate."""
    return {
        "personId": person_id,
        "sk": f"{r.test_key}#{r.taken_on}",
        "test_key": r.test_key,
        "test_name": r.test_name,
        "value": _to_decimal(r.value),
        "unit": r.unit,
        "ref_low": _to_decimal(r.ref_low),
        "ref_high": _to_decimal(r.ref_high),
        "taken_on": r.taken_on,
        "reportId": report_id,
        "s3Key": s3_key,
    }


def from_item(item: dict) -> Reading:
    return Reading(
        test_key=item["test_key"],
        test_name=item["test_name"],
        value=_to_float(item["value"]),
        unit=item["unit"],
        ref_low=_to_float(item.get("ref_low")),
        ref_high=_to_float(item.get("ref_high")),
        taken_on=item["taken_on"],
    )


def save_readings(table, person_id: str, readings: list[Reading], report_id: str, s3_key: str) -> None:
    """`table` is a boto3 DynamoDB Table."""
    with table.batch_writer(overwrite_by_pkeys=["personId", "sk"]) as batch:
        for r in readings:
            batch.put_item(Item=to_item(person_id, r, report_id, s3_key))


def _query_all(table, partition: str) -> list[dict]:
    """Every item in one partition. DynamoDB answers in pages, so keep asking until it's done."""
    query = {"KeyConditionExpression": Key("personId").eq(partition)}
    items = []
    while True:
        page = table.query(**query)
        items += page["Items"]
        if "LastEvaluatedKey" not in page:
            return items
        query["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def load_readings(table, person_id: str) -> list[Reading]:
    return [from_item(item) for item in _query_all(table, person_id)]


def save_person(table, owner: str, person: Person) -> None:
    table.put_item(Item={"personId": people_partition(owner), "sk": person.person_id,
                         "title": person.title, "name": person.name, "is_self": person.is_self})


def load_people(table, owner: str) -> list[Person]:
    return [Person(item["sk"], item["title"], item["name"], item["is_self"])
            for item in _query_all(table, people_partition(owner))]


def save_account(table, account: Account) -> None:
    table.put_item(Item={"personId": ACCOUNTS_PARTITION, "sk": account.email,
                         "password_hash": account.password_hash, "username": account.username})


def load_account(table, email: str) -> Account | None:
    item = table.get_item(Key={"personId": ACCOUNTS_PARTITION, "sk": email}).get("Item")
    return Account(item["sk"], item["password_hash"], item.get("username", "")) if item else None


def save_session(table, session: Session) -> None:
    table.put_item(Item={"personId": SESSIONS_PARTITION, "sk": session.token_hash,
                         "email": session.email, "expires_at": session.expires_at})


def load_session(table, token_hash: str) -> Session | None:
    item = table.get_item(Key={"personId": SESSIONS_PARTITION, "sk": token_hash}).get("Item")
    return Session(item["sk"], item["email"], item["expires_at"]) if item else None


def delete_session(table, token_hash: str) -> None:
    table.delete_item(Key={"personId": SESSIONS_PARTITION, "sk": token_hash})


def save_image(s3, bucket: str, person_id: str, report_id: str, image: bytes, image_format: str) -> str:
    """Keep the original photo, so every extracted number can be checked against its source."""
    key = f"{person_id}/{report_id}.{image_format}"
    s3.put_object(Bucket=bucket, Key=key, Body=image, ContentType=CONTENT_TYPES[image_format])
    return key
