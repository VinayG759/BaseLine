from datetime import date

import pytest
from fastapi.testclient import TestClient

from app import Services, create_app
from core.extract import Extracted, ExtractionError
from core.people import Person
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


SLOTS = ("read_report", "save_image", "save_readings", "load_readings", "list_people", "save_person",
         "save_account", "load_account", "save_session", "load_session", "delete_session")
OWNER = "vinay@example.com"
PASSWORD = "correct horse battery"


class FakeBackend:
    def __init__(self):
        self.rows = {}      # (person, test_key, date) -> Reading, like the DynamoDB keys
        self.images = {}
        self.people = {OWNER: {p.person_id: p for p in (Person("amma", "Mrs", "Sunita Rao", False),
                                                        Person("appa", "Mr", "Ramesh Rao", False))}}
        self.accounts = {}
        self.sessions = {}

    def list_people(self, owner):
        return list(self.people.get(owner, {}).values())

    def save_person(self, owner, person):
        self.people.setdefault(owner, {})[person.person_id] = person

    def save_account(self, account):
        self.accounts[account.email] = account

    def load_account(self, email):
        return self.accounts.get(email)

    def save_session(self, session):
        self.sessions[session.token_hash] = session

    def load_session(self, token_hash):
        return self.sessions.get(token_hash)

    def delete_session(self, token_hash):
        self.sessions.pop(token_hash, None)

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


def services_for(backend, **overrides):
    """The fake backend's slots, with any of them replaced by `overrides`."""
    return Services(**{**{name: getattr(backend, name) for name in SLOTS}, **overrides})


def log_in(client, email=OWNER, password=PASSWORD):
    """Register (if needed), log in, and send the session token with every later request."""
    client.post("/api/auth/register", json={"email": email, "password": password, "username": "Vinay G"})
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    client.headers["Authorization"] = f"Bearer {r.json()['token']}"
    return client


def make_client(backend, raise_server_exceptions=True, **overrides):
    app = create_app(services_for(backend, **overrides), today=lambda: date(2026, 9, 19))
    return log_in(TestClient(app, raise_server_exceptions=raise_server_exceptions))


@pytest.fixture
def client(backend):
    return make_client(backend)


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
    assert r.json() == {"person_id": "appa", "report": None, "trends": [], "reminder": None}


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


@pytest.mark.parametrize("slot", ["read_report", "save_image", "save_readings", "load_readings", "list_people"])
def test_a_failing_service_still_answers_in_the_contract_shape_with_cors(backend, slot):
    def broken(*args):
        raise RuntimeError("AWS is having a bad day")

    client = make_client(backend, raise_server_exceptions=False, **{slot: broken})

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


def test_trends_carry_a_next_test_reminder(client):
    upload(client, b"march")
    r = upload(client, b"august")

    assert r.json()["reminder"] == {"last_report": "2026-08-08", "next_due": "2026-11-06", "overdue": False}


def test_kannada_summaries_come_from_the_phrase_service(backend):
    kn = "HbA1c ಸತತ 2 ಬಾರಿ ಏರಿದೆ (5.6 → 6.1 → 6.4 %)."
    client = make_client(backend, phrase=lambda templates, lang: {"hba1c": kn} if lang == "kn" else templates)
    upload(client, b"march")
    upload(client, b"august")

    kannada = upload(client, b"september", lang="kn").json()["trends"][0]
    english = client.get("/api/trends", params={"person_id": "amma"}).json()["trends"][0]

    assert kannada["summary"] == kn
    assert kannada["current"] == 6.4 and kannada["test_name"] == "HbA1c"
    assert english["summary"].startswith("Gone up 2 times in a row")


def test_a_failing_phrase_service_still_answers_200_in_english(backend):
    def broken(templates, lang):
        raise RuntimeError("Bedrock unavailable")

    client = make_client(backend, phrase=broken)
    upload(client, b"march")

    r = client.get("/api/trends", params={"person_id": "amma", "lang": "hi"})

    assert r.status_code == 200
    assert r.json()["trends"][0]["summary"].startswith("First result on record.")


# ---- Chat ----

def chat_client(backend, chat):
    return make_client(backend, chat=chat)


def test_chat_answers_about_the_persons_own_readings(backend):
    asked = []

    def chat(question, lang, readings):
        asked.append((question, lang, [r.value for r in readings]))
        return "HbA1c has gone up."

    client = chat_client(backend, chat)
    upload(client, b"march")

    r = client.post("/api/chat", json={"person_id": "amma", "question": "Anything rising?", "lang": "kn"})

    assert r.status_code == 200
    assert r.json() == {"person_id": "amma", "reply": "HbA1c has gone up."}
    assert asked == [("Anything rising?", "kn", [5.6])]


def test_chat_without_reports_says_so_without_calling_the_model(backend):
    def chat(*args):
        raise AssertionError("the model should not be called")

    r = chat_client(backend, chat).post("/api/chat", json={"person_id": "appa", "question": "Hi"})

    assert r.status_code == 200
    assert "no reports" in r.json()["reply"].lower()


@pytest.mark.parametrize("question", ["", "   ", "x" * 501])
def test_chat_rejects_empty_or_overlong_questions(backend, question):
    r = chat_client(backend, lambda *a: "ok").post("/api/chat", json={"person_id": "amma", "question": question})

    assert r.status_code == 400
    assert set(r.json()) == {"error"}


def test_chat_checks_person_and_language(backend):
    client = chat_client(backend, lambda *a: "ok")

    assert client.post("/api/chat", json={"person_id": "Amma!", "question": "Hi"}).status_code == 400
    assert client.post("/api/chat", json={"person_id": "amma", "question": "Hi", "lang": "fr"}).status_code == 400


def test_chat_when_the_model_fails_answers_503_in_contract_shape(backend):
    def broken(*args):
        raise RuntimeError("Bedrock unavailable")

    client = chat_client(backend, broken)
    upload(client, b"march")

    r = client.post("/api/chat", json={"person_id": "amma", "question": "Hi"})

    assert r.status_code == 503
    assert set(r.json()) == {"error"}


def test_chat_when_no_model_is_configured_answers_503(client):
    upload(client, b"march")

    assert client.post("/api/chat", json={"person_id": "amma", "question": "Hi"}).status_code == 503


# ---- People ----

def test_people_are_listed_yourself_first(client):
    client.post("/api/people", json={"title": "Mr", "name": "Arjun Rao", "is_self": True})

    people = client.get("/api/people").json()["people"]

    assert [p["display_name"] for p in people] == ["Mr Arjun Rao", "Mr Ramesh Rao", "Mrs Sunita Rao"]
    assert people[0]["is_self"] is True


def test_adding_a_person_returns_them_and_their_reports_start_empty(client):
    r = client.post("/api/people", json={"title": "Ms", "name": "Kavya Rao", "is_self": False})

    assert r.status_code == 201
    person = r.json()
    assert person["display_name"] == "Ms Kavya Rao"
    trends = client.get("/api/trends", params={"person_id": person["person_id"]}).json()
    assert trends["trends"] == [] and trends["reminder"] is None


def test_a_bad_name_is_rejected_with_a_sentence(client):
    r = client.post("/api/people", json={"title": "Ms", "name": "R2D2"})

    assert r.status_code == 400
    assert "name" in r.json()["error"]


def test_a_second_self_profile_is_a_conflict(client):
    client.post("/api/people", json={"name": "Arjun Rao", "is_self": True})

    r = client.post("/api/people", json={"name": "Someone Else", "is_self": True})

    assert r.status_code == 409
    assert "yourself" in r.json()["error"]


@pytest.mark.parametrize("call", [
    lambda c: c.get("/api/trends", params={"person_id": "nobody-1234"}),
    lambda c: c.get("/api/doctor", params={"person_id": "nobody-1234"}),
    lambda c: c.post("/api/chat", json={"person_id": "nobody-1234", "question": "Hi"}),
    lambda c: upload(c, b"september", person_id="nobody-1234"),
])
def test_unknown_people_get_404_everywhere(client, backend, call):
    r = call(client)

    assert r.status_code == 404
    assert set(r.json()) == {"error"}
    assert backend.rows == {} and backend.images == {}


# ---- Login ----

@pytest.fixture
def anonymous(backend):
    return TestClient(create_app(services_for(backend), today=lambda: date(2026, 9, 19)))


def test_register_creates_the_account_but_does_not_log_in(anonymous, backend):
    r = anonymous.post("/api/auth/register",
                       json={"email": " Vinay@Example.com ", "password": PASSWORD, "username": " Vinay G "})

    assert r.status_code == 201
    assert r.json() == {"email": "vinay@example.com", "username": "Vinay G"}
    assert backend.sessions == {}
    assert PASSWORD not in backend.accounts["vinay@example.com"].password_hash


def test_registering_the_same_email_twice_is_a_conflict(anonymous):
    anonymous.post("/api/auth/register", json={"email": OWNER, "password": PASSWORD, "username": "Vinay"})

    r = anonymous.post("/api/auth/register", json={"email": OWNER.upper(), "password": PASSWORD, "username": "Vinay"})

    assert r.status_code == 409
    assert set(r.json()) == {"error"}


@pytest.mark.parametrize("body", [{"email": "not-an-email", "password": PASSWORD, "username": "Vinay"},
                                  {"email": OWNER, "password": "short", "username": "Vinay"}, {}])
def test_bad_registration_details_are_a_400_with_a_sentence(anonymous, body):
    r = anonymous.post("/api/auth/register", json=body)

    assert r.status_code == 400
    assert set(r.json()) == {"error"}


def test_login_with_the_right_password_gives_a_working_token(anonymous):
    anonymous.post("/api/auth/register", json={"email": OWNER, "password": PASSWORD, "username": "Vinay"})

    r = anonymous.post("/api/auth/login", json={"email": OWNER, "password": PASSWORD})
    me = anonymous.get("/api/auth/me", headers={"Authorization": f"Bearer {r.json()['token']}"})

    assert r.status_code == 200
    assert me.json() == {"email": OWNER, "username": "Vinay"}


@pytest.mark.parametrize("body", [{"email": OWNER, "password": "wrong password"},
                                  {"email": "nobody@example.com", "password": PASSWORD}])
def test_wrong_password_and_unknown_email_get_the_same_answer(anonymous, body):
    anonymous.post("/api/auth/register", json={"email": OWNER, "password": PASSWORD, "username": "Vinay"})

    r = anonymous.post("/api/auth/login", json=body)

    assert r.status_code == 401
    assert r.json() == {"error": "Email or password is incorrect."}


@pytest.mark.parametrize("call", [
    lambda c: c.get("/api/people"),
    lambda c: c.post("/api/people", json={"name": "Kavya Rao"}),
    lambda c: c.get("/api/trends", params={"person_id": "amma"}),
    lambda c: c.get("/api/doctor", params={"person_id": "amma"}),
    lambda c: c.post("/api/chat", json={"person_id": "amma", "question": "Hi"}),
    lambda c: upload(c, b"september"),
    lambda c: c.get("/api/auth/me"),
])
def test_every_data_endpoint_needs_a_login(anonymous, backend, call):
    r = call(anonymous)

    assert r.status_code == 401
    assert set(r.json()) == {"error"}
    assert backend.rows == {} and backend.images == {}


def test_a_made_up_token_is_refused(anonymous):
    r = anonymous.get("/api/people", headers={"Authorization": "Bearer not-a-real-token"})

    assert r.status_code == 401


def test_an_expired_session_is_refused(backend):
    from datetime import datetime, timezone
    later = datetime(2027, 1, 1, tzinfo=timezone.utc)
    client = make_client(backend)
    client.app.state.now = lambda: later   # 7+ days after login

    assert client.get("/api/people").status_code == 401


def test_logout_ends_the_session(client):
    assert client.post("/api/auth/logout").status_code == 200

    assert client.get("/api/people").status_code == 401


def test_another_account_cannot_see_or_open_my_people(backend):
    mine = make_client(backend)
    theirs = log_in(TestClient(mine.app), email="chethan@example.com")

    assert theirs.get("/api/people").json() == {"people": []}
    assert theirs.get("/api/trends", params={"person_id": "amma"}).status_code == 404
    assert upload(theirs, b"september", person_id="amma").status_code == 404
    assert backend.rows == {}


def test_people_i_add_belong_to_my_account(backend):
    mine = make_client(backend)
    theirs = log_in(TestClient(mine.app), email="chethan@example.com")

    theirs.post("/api/people", json={"name": "Kavya Rao"})

    assert [p["name"] for p in mine.get("/api/people").json()["people"]] == ["Ramesh Rao", "Sunita Rao"]
    assert [p["name"] for p in theirs.get("/api/people").json()["people"]] == ["Kavya Rao"]


def test_register_needs_a_username(anonymous):
    r = anonymous.post("/api/auth/register", json={"email": OWNER, "password": PASSWORD})

    assert r.status_code == 400
    assert "username" in r.json()["error"]


def test_login_and_me_return_the_username(anonymous):
    anonymous.post("/api/auth/register", json={"email": OWNER, "password": PASSWORD, "username": "Vinay G"})

    login = anonymous.post("/api/auth/login", json={"email": OWNER, "password": PASSWORD}).json()
    me = anonymous.get("/api/auth/me", headers={"Authorization": f"Bearer {login['token']}"}).json()

    assert login["username"] == "Vinay G"
    assert me == {"email": OWNER, "username": "Vinay G"}
