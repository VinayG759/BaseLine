import pytest
from fastapi.testclient import TestClient

from app import Services, create_app
from core.extract import Extracted, ExtractionError
from core.trends import Reading


def hba1c(value):
    return Reading("hba1c", "HbA1c", value, "%", 4.0, 5.6, "")


# What the fake "model" reads off each fake image.
REPORTS = {
    b"march": Extracted("2026-03-04", "Sri Sai Diagnostics", [hba1c(5.6)]),
    b"august": Extracted("2026-08-08", "Sri Sai Diagnostics", [hba1c(6.1)]),
    b"september": Extracted("2026-09-12", "Sri Sai Diagnostics", [hba1c(6.4)]),
    b"no-date": Extracted(None, None, [hba1c(6.4)]),
    b"no-rows": Extracted("2026-09-12", None, []),
}


class FakeBackend:
    def __init__(self):
        self.rows = {}      # (person, test_key, date) -> Reading, like the DynamoDB keys
        self.images = {}

    def read_report(self, image: bytes, image_format: str) -> Extracted:
        if image not in REPORTS:
            raise ExtractionError("This image couldn’t be read as a lab report. Try a sharper, flatter photo.")
        return REPORTS[image]

    def save_image(self, person_id, report_id, image, image_format):
        key = f"{person_id}/{report_id}.{image_format}"
        self.images[key] = image
        return key

    def save_readings(self, person_id, readings, report_id, s3_key):
        for r in readings:
            self.rows[(person_id, r.test_key, r.taken_on)] = r

    def load_readings(self, person_id):
        return [r for (p, _, _), r in self.rows.items() if p == person_id]


@pytest.fixture
def backend():
    return FakeBackend()


@pytest.fixture
def client(backend):
    return TestClient(create_app(Services(
        read_report=backend.read_report,
        save_image=backend.save_image,
        save_readings=backend.save_readings,
        load_readings=backend.load_readings,
    )))


def upload(client, image, person_id="amma", report_date=None, content_type="image/jpeg", lang=None):
    data = {"person_id": person_id}
    if report_date:
        data["report_date"] = report_date
    if lang:
        data["lang"] = lang
    return client.post("/api/reports", data=data, files={"file": ("r.jpg", image, content_type)})


def test_person_with_no_reports_has_empty_history(client):
    r = client.get("/api/trends", params={"person_id": "appa"})

    assert r.status_code == 200
    assert r.json() == {"person_id": "appa", "report": None, "trends": []}


def test_invalid_person_id_is_rejected_with_an_error_sentence(client):
    r = client.get("/api/trends", params={"person_id": "Amma!"})

    assert r.status_code == 400
    assert set(r.json()) == {"error"}


def test_unknown_language_is_rejected(client):
    r = client.get("/api/trends", params={"person_id": "amma", "lang": "fr"})

    assert r.status_code == 400
    assert "English, Kannada or Hindi" in r.json()["error"]


def test_third_upload_returns_contract_shaped_rising_trend(client):
    upload(client, b"march")
    upload(client, b"august")

    r = upload(client, b"september", lang="kn")

    assert r.status_code == 200
    body = r.json()
    assert body["person_id"] == "amma"
    assert body["report"]["report_date"] == "2026-09-12"
    assert body["report"]["lab_name"] == "Sri Sai Diagnostics"
    assert body["report"]["report_id"]
    [trend] = body["trends"]
    assert list(trend) == [
        "test_key", "test_name", "unit", "current", "previous", "direction", "streak",
        "status", "ref_low", "ref_high", "history", "summary", "updated",
    ]
    assert trend["direction"] == "rising"
    assert trend["streak"] == 2
    assert trend["history"] == [
        {"date": "2026-03-04", "value": 5.6},
        {"date": "2026-08-08", "value": 6.1},
        {"date": "2026-09-12", "value": 6.4},
    ]
    assert trend["summary"] == "Gone up 2 times in a row (5.6 → 6.1 → 6.4 %). Above the normal range (4–5.6 %)."
    assert trend["updated"] is True


def test_get_after_uploads_marks_nothing_updated(client):
    upload(client, b"march")
    upload(client, b"august")

    body = client.get("/api/trends", params={"person_id": "amma"}).json()

    assert body["report"] is None
    assert [t["updated"] for t in body["trends"]] == [False]
    assert body["trends"][0]["history"][-1] == {"date": "2026-08-08", "value": 6.1}


def test_sent_date_overrides_the_date_read_off_the_report(client):
    r = upload(client, b"september", report_date="2026-09-15")

    assert r.json()["report"]["report_date"] == "2026-09-15"
    assert r.json()["trends"][0]["history"] == [{"date": "2026-09-15", "value": 6.4}]


def test_uploading_the_same_report_twice_does_not_duplicate_it(client):
    upload(client, b"september")
    r = upload(client, b"september")

    assert len(r.json()["trends"][0]["history"]) == 1


def test_report_with_no_readable_date_asks_for_one(client):
    r = upload(client, b"no-date")

    assert r.status_code == 422
    assert "date" in r.json()["error"]


def test_badly_formatted_date_is_rejected(client):
    r = upload(client, b"september", report_date="12/09/2026")

    assert r.status_code == 400


def test_unreadable_image_passes_on_the_readable_sentence(client):
    r = upload(client, b"a photo of a cat")

    assert r.status_code == 422
    assert r.json()["error"].startswith("This image couldn’t be read as a lab report")


def test_report_with_no_results_is_rejected(client):
    r = upload(client, b"no-rows")

    assert r.status_code == 422


def test_image_over_4_mb_is_rejected_before_it_is_read(client, backend):
    r = upload(client, b"x" * (4 * 1024 * 1024 + 1))

    assert r.status_code == 413
    assert backend.images == {}


def test_non_image_upload_is_rejected(client):
    r = upload(client, b"september", content_type="application/pdf")

    assert r.status_code == 400
    assert "JPEG or PNG" in r.json()["error"]


def test_missing_file_uses_the_contract_error_shape(client):
    r = client.post("/api/reports", data={"person_id": "amma"})

    assert r.status_code == 400
    assert set(r.json()) == {"error"}


def test_the_original_image_is_kept(client, backend):
    r = upload(client, b"september")

    report_id = r.json()["report"]["report_id"]
    assert backend.images == {f"amma/{report_id}.jpeg": b"september"}


def test_browser_pages_on_other_addresses_may_call_the_api(client):
    r = client.get("/api/trends", params={"person_id": "amma"},
                   headers={"Origin": "https://example.amplifyapp.com"})

    assert r.headers["access-control-allow-origin"] == "*"


def test_text_sent_in_place_of_a_file_uses_the_contract_error_shape(client):
    r = client.post("/api/reports", data={"person_id": "amma", "file": "not a file"})

    assert r.status_code == 400
    assert set(r.json()) == {"error"}


@pytest.mark.parametrize("slot", ["read_report", "save_image", "save_readings", "load_readings"])
def test_a_failing_service_still_answers_in_the_contract_shape_with_cors(backend, slot):
    def broken(*args):
        raise RuntimeError("AWS is having a bad day")

    services = {name: getattr(backend, name) for name in
                ("read_report", "save_image", "save_readings", "load_readings")}
    services[slot] = broken
    client = TestClient(create_app(Services(**services)), raise_server_exceptions=False)

    r = client.post("/api/reports", data={"person_id": "amma"},
                    files={"file": ("r.jpg", b"september", "image/jpeg")},
                    headers={"Origin": "https://example.amplifyapp.com"})

    assert r.status_code == 503
    assert set(r.json()) == {"error"}
    assert r.headers["access-control-allow-origin"] == "*"


def test_doctor_view_lists_every_result_as_a_table(client):
    upload(client, b"march")
    upload(client, b"september")

    r = client.get("/api/doctor", params={"person_id": "amma"})

    assert r.status_code == 200
    assert r.json()["report_dates"] == ["2026-03-04", "2026-09-12"]
    assert [x["flag"] for x in r.json()["tests"][0]["results"]] == ["", "H"]


def test_doctor_view_rejects_an_invalid_person(client):
    assert client.get("/api/doctor", params={"person_id": "../etc"}).status_code == 400
