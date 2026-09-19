"""Where readings and report images live: DynamoDB and S3.

DynamoDB refuses Python floats, and Decimal(6.4) straight from a float stores
6.4000000000000003552... So numbers go in as Decimal built from their text,
and come back out as floats.
"""
from decimal import Decimal

from boto3.dynamodb.conditions import Key

from core.auth import Account, Session
from core.people import Person
from core.reports import Report
from core.trends import Reading

CONTENT_TYPES = {"jpeg": "image/jpeg", "png": "image/png"}
# Reserved partitions start with "#", which can't appear in a person ID, so they never collide with readings.
ACCOUNTS_PARTITION = "#accounts"
SESSIONS_PARTITION = "#sessions"


REPORT_PREFIX = "~report#"   # "~" never appears in a test key, so report records can't collide with readings


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
    # Consistent reads: right after a save, the new rows must already be visible.
    query = {"KeyConditionExpression": Key("personId").eq(partition), "ConsistentRead": True}
    items = []
    while True:
        page = table.query(**query)
        items += page["Items"]
        if "LastEvaluatedKey" not in page:
            return items
        query["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def load_readings(table, person_id: str) -> list[Reading]:
    return [from_item(item) for item in _query_all(table, person_id) if not item["sk"].startswith(REPORT_PREFIX)]


def save_person(table, owner: str, person: Person) -> None:
    table.put_item(Item={"personId": people_partition(owner), "sk": person.person_id,
                         "title": person.title, "name": person.name, "is_self": person.is_self,
                         "gender": person.gender, "age": person.age, "age_recorded_on": person.age_recorded_on,
                         "height_cm": _to_decimal(person.height_cm), "weight_kg": _to_decimal(person.weight_kg)})


def load_people(table, owner: str) -> list[Person]:
    return [Person(item["sk"], item["title"], item["name"], item["is_self"], item.get("gender", ""),
                   int(item["age"]) if item.get("age") is not None else None, item.get("age_recorded_on", ""),
                   _to_float(item.get("height_cm")), _to_float(item.get("weight_kg")))
            for item in _query_all(table, people_partition(owner))]


def _report_from_item(item: dict) -> Report:
    return Report(
        report_id=item["sk"][len(REPORT_PREFIX):], report_date=item["report_date"], lab_name=item.get("lab_name"),
        patient_name=item.get("patient_name"), s3_key=item["s3Key"], uploaded_at=item["uploaded_at"],
        height_cm=_to_float(item.get("height_cm")), weight_kg=_to_float(item.get("weight_kg")),
        test_keys=list(item.get("test_keys", [])), summaries=dict(item.get("summaries", {})),
    )


def save_report(table, person_id: str, report: Report) -> None:
    table.put_item(Item={
        "personId": person_id, "sk": REPORT_PREFIX + report.report_id, "report_date": report.report_date,
        "lab_name": report.lab_name, "patient_name": report.patient_name, "s3Key": report.s3_key,
        "uploaded_at": report.uploaded_at, "height_cm": _to_decimal(report.height_cm),
        "weight_kg": _to_decimal(report.weight_kg), "test_keys": list(report.test_keys),
        "summaries": dict(report.summaries),
    })


def load_reports(table, person_id: str) -> list[Report]:
    """Newest report first."""
    items = _query_all(table, person_id)
    reports = [_report_from_item(i) for i in items if i["sk"].startswith(REPORT_PREFIX)]
    return sorted(reports, key=lambda r: (r.report_date, r.uploaded_at), reverse=True)


def load_report(table, person_id: str, report_id: str) -> Report | None:
    item = table.get_item(Key={"personId": person_id, "sk": REPORT_PREFIX + report_id}, ConsistentRead=True).get("Item")
    return _report_from_item(item) if item else None


def update_report_summary(table, person_id: str, report_id: str, lang: str, text: str) -> None:
    table.update_item(Key={"personId": person_id, "sk": REPORT_PREFIX + report_id},
                      UpdateExpression="SET summaries.#lang = :text",
                      ExpressionAttributeNames={"#lang": lang}, ExpressionAttributeValues={":text": text})


def delete_report(table, person_id: str, report_id: str) -> None:
    """The report record and every reading that came from it; other reports' readings stay."""
    for item in _query_all(table, person_id):
        if item["sk"] == REPORT_PREFIX + report_id or item.get("reportId") == report_id:
            table.delete_item(Key={"personId": person_id, "sk": item["sk"]})


def delete_image(s3, bucket: str, key: str) -> None:
    s3.delete_object(Bucket=bucket, Key=key)


def image_url(s3, bucket: str, key: str, seconds: int = 600) -> str:
    """A short-lived link to the private photo, so the page can show it without making the bucket public."""
    return s3.generate_presigned_url("get_object", Params={"Bucket": bucket, "Key": key}, ExpiresIn=seconds)


def save_account(table, account: Account) -> None:
    table.put_item(Item={"personId": ACCOUNTS_PARTITION, "sk": account.email,
                         "password_hash": account.password_hash, "username": account.username})


def load_account(table, email: str) -> Account | None:
    item = table.get_item(Key={"personId": ACCOUNTS_PARTITION, "sk": email}, ConsistentRead=True).get("Item")
    return Account(item["sk"], item["password_hash"], item.get("username", "")) if item else None


def save_session(table, session: Session) -> None:
    table.put_item(Item={"personId": SESSIONS_PARTITION, "sk": session.token_hash,
                         "email": session.email, "expires_at": session.expires_at})


def load_session(table, token_hash: str) -> Session | None:
    item = table.get_item(Key={"personId": SESSIONS_PARTITION, "sk": token_hash}, ConsistentRead=True).get("Item")
    return Session(item["sk"], item["email"], item["expires_at"]) if item else None


def delete_session(table, token_hash: str) -> None:
    table.delete_item(Key={"personId": SESSIONS_PARTITION, "sk": token_hash})


def save_image(s3, bucket: str, person_id: str, report_id: str, image: bytes, image_format: str) -> str:
    """Keep the original photo, so every extracted number can be checked against its source."""
    key = f"{person_id}/{report_id}.{image_format}"
    s3.put_object(Bucket=bucket, Key=key, Body=image, ContentType=CONTENT_TYPES[image_format])
    return key
