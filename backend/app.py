"""The Baseline API, shaped exactly as CONTRACT.md describes.

The API never talks to AWS or a model directly. It calls plug-in functions
(Services), so the same API runs with AWS and a model provider, or with fakes
in the tests.

Run locally:  uvicorn app:app --reload --port 8000
On Lambda:    handler "app.handler"
"""
import json
import logging
import os
import re
import uuid
from dataclasses import asdict, replace
from datetime import date, timedelta
from typing import Callable

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from mangum import Mangum

from core.auth import (Account, AuthError, EmailTaken, check_new_account, check_username, display_username,
                       hash_password, hash_token, new_session, normalise_email, session_is_valid, utc_now,
                       verify_password)
from core.doctor import doctor_view
from core.explain import summarise
from core.extract import ExtractionError
from core.names import check_report_name
from core.overall import overall_summary, trends_as_of
from core.people import PersonError, SelfProfileExists, check_height, check_weight, edit_person, new_person, sort_people
from core.ratelimit import RateLimit
from core.reminder import reminder
from core.reports import Report, ReportError, check_reviewed
from core.services import Services, aws_services
from core.trends import compute_trend, group_by_test, range_status, sort_trends

MAX_IMAGE_BYTES = 4 * 1024 * 1024
PERSON_ID = re.compile(r"[a-z0-9-]{1,32}")
LANGS = {"en", "kn", "hi"}
IMAGE_FORMATS = {"image/jpeg": "jpeg", "image/png": "png"}
MAX_QUESTION_CHARS = 500
NO_REPORTS_REPLY = "There are no reports for this person yet. Add a lab report first, then ask again."
UNAVAILABLE = "Baseline can’t reach its storage or reading service right now. Try again in a minute."
FREE_ANALYSES_PER_HOUR = 5
TOO_MANY_FREE = ("That’s several reports in a short time. Set up an account to keep reading reports, "
                 "or try again in an hour.")

log = logging.getLogger("baseline")


def _fail(status: int, sentence: str):
    raise HTTPException(status_code=status, detail=sentence)


LOGIN_NEEDED = "Please log in to continue."
BAD_LOGIN = "Email or password is incorrect."


class Credentials(BaseModel):
    email: str | None = None
    password: str | None = None
    username: str | None = None   # register only


class NewPerson(BaseModel):
    title: str | None = None
    name: str | None = None
    is_self: bool = False
    gender: str | None = None
    age: int | str | None = None
    height_cm: float | str | None = None
    weight_kg: float | str | None = None


class PersonChanges(BaseModel):
    """Only the fields that are sent are changed."""
    title: str | None = None
    name: str | None = None
    gender: str | None = None
    age: int | str | None = None
    height_cm: float | str | None = None
    weight_kg: float | str | None = None


class ReportEdit(BaseModel):
    person_id: str | None = None
    readings: list[dict] | None = None
    report_date: str | None = None
    lang: str | None = None


class ChatRequest(BaseModel):
    person_id: str | None = None
    question: str | None = None
    lang: str | None = None


def _call(slot: Callable, *args):
    """Run one service. If AWS (or anything behind it) fails, log why and answer 503.

    Raising HTTPException here, not relying on a catch-all handler, keeps the
    CORS headers on the response, so the browser shows our sentence.
    """
    try:
        return slot(*args)
    except (HTTPException, ExtractionError):
        raise
    except Exception:
        log.exception("service %s failed", getattr(slot, "__name__", slot))
        _fail(503, UNAVAILABLE)


def _check_person(person_id: str | None) -> str:
    if not person_id or not PERSON_ID.fullmatch(person_id):
        _fail(400, "Choose a person from the list.")
    return person_id


def _check_lang(lang: str | None) -> str:
    lang = lang or "en"
    if lang not in LANGS:
        _fail(400, "Language must be English, Kannada or Hindi.")
    return lang


def _is_iso_date(text: str) -> bool:
    try:
        return re.fullmatch(r"\d{4}-\d{2}-\d{2}", text) is not None and bool(date.fromisoformat(text))
    except ValueError:
        return False


def create_app(
    services: Services,
    today: Callable[[], date] = date.today,
    reword_english: bool = False,
    now: Callable = utc_now,
    free_analyses_per_hour: int = FREE_ANALYSES_PER_HOUR,
) -> FastAPI:
    app = FastAPI(title="Baseline")
    app.state.now = now
    # Reading a report costs money and /api/analyze needs no login, so one visitor gets a few per hour.
    free_analyses = RateLimit(limit=free_analyses_per_hour, window=timedelta(hours=1))
    # Checked against when an email doesn't exist, so a wrong email takes as long as a wrong password.
    dummy_hash = hash_password("not a real password")
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
                       allow_headers=["*"])

    @app.middleware("http")
    async def no_store(request: Request, call_next):
        """Health data: browsers must never keep a copy of an API answer (and never show a stale one)."""
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(HTTPException)
    async def http_error(_: Request, exc: HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"error": str(exc.detail)})

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError):
        return JSONResponse(status_code=400, content={"error": "Something in the request was missing or malformed."})

    def current_owner(request: Request) -> str:
        """The logged-in account's email, from the "Authorization: Bearer <token>" header, or a 401."""
        scheme, _, token = request.headers.get("authorization", "").partition(" ")
        if scheme.lower() != "bearer" or not token:
            _fail(401, LOGIN_NEEDED)
        token_hash = hash_token(token)
        session = _call(services.load_session, token_hash)
        if not session_is_valid(session, request.app.state.now()):
            _fail(401, LOGIN_NEEDED)
        request.state.token_hash = token_hash
        return session.email

    def start_session(account: Account) -> dict:
        token, session = new_session(account.email, app.state.now())
        _call(services.save_session, session)
        return {"token": token, "email": account.email, "username": display_username(account)}

    def check_person(person_id: str | None, owner: str) -> str:
        """A valid ID that belongs to one of this account's people, or a 400/404 with a sentence."""
        return find_person(person_id, owner).person_id

    def find_person(person_id: str | None, owner: str):
        person_id = _check_person(person_id)
        for person in _call(services.list_people, owner):
            if person.person_id == person_id:
                return person
        _fail(404, "This person isn’t in Baseline yet. Add them first.")

    def find_report(person_id: str, report_id: str) -> Report:
        report = _call(services.get_report, person_id, report_id)
        if report is None:
            _fail(404, "This report isn’t in Baseline.")
        return report

    def reading_rows(readings) -> list[dict]:
        return [{"test_key": r.test_key, "test_name": r.test_name, "value": r.value, "unit": r.unit,
                 "ref_low": r.ref_low, "ref_high": r.ref_high, "status": range_status(r.value, r.ref_low, r.ref_high)}
                for r in readings]

    def summary_for(person_id: str, report: Report, lang: str) -> str:
        """The report's overall summary in `lang`: from the cache, or written once and cached."""
        if lang in report.summaries:
            return report.summaries[lang]
        trends = trends_as_of(_call(services.load_readings, person_id), report.test_keys, report.report_date)
        text = overall_summary(trends, lang, services.write_summary)
        _call(services.update_report_summary, person_id, report.report_id, lang, text)
        return text

    def check_name_for_saving(person, owner: str, patient_name, name_confirmed: bool) -> None:
        """Refuse to save a report printed with someone else's name (or no name, unless confirmed)."""
        check = check_report_name(patient_name, person, _call(services.list_people, owner))
        if check["status"] == "different":
            _fail(409, f"This report is for {check['detected_name']}, not {person.display_name}. It was not saved.")
        if check["status"] == "other_person":
            _fail(409, f"This report looks like {check['display_name']}’s. Choose them and upload it again. "
                       "It was not saved.")
        if check["status"] == "unknown" and not name_confirmed:
            _fail(409, f"No name was found on this report. Confirm it belongs to {person.display_name} to save it.")

    def save_new_report(owner: str, person, readings, report_date: str, lab_name, patient_name,
                        image: bytes, image_format: str, lang: str, height_cm=None, weight_kg=None) -> dict:
        """Photo, readings, report record and summary; the profile's height/weight follow the latest report."""
        readings = [replace(r, taken_on=report_date) for r in readings]
        report_id = uuid.uuid4().hex
        s3_key = _call(services.save_image, person.person_id, report_id, image, image_format)
        _call(services.save_readings, person.person_id, readings, report_id, s3_key)
        report = Report(report_id=report_id, report_date=report_date, lab_name=lab_name, patient_name=patient_name,
                        s3_key=s3_key, uploaded_at=app.state.now().isoformat(), height_cm=height_cm,
                        weight_kg=weight_kg, test_keys=[r.test_key for r in readings])
        _call(services.save_report, person.person_id, report)
        if height_cm is not None or weight_kg is not None:
            changes = {k: v for k, v in (("height_cm", height_cm), ("weight_kg", weight_kg)) if v is not None}
            _call(services.save_person, owner, edit_person(person, changes, today=today()))
        summary = summary_for(person.person_id, report, lang)
        return build_response(person.person_id, lang, {**report.as_dict(), "summary": summary},
                              touched={r.test_key for r in readings})

    async def read_image(file: UploadFile | None) -> tuple[bytes, str]:
        if file is None:
            _fail(400, "Choose a photo of the report to upload.")
        image = await file.read()
        if len(image) > MAX_IMAGE_BYTES:
            _fail(413, "This photo is too large. Try a smaller photo, under 4 MB.")
        image_format = IMAGE_FORMATS.get(file.content_type or "")
        if image_format is None:
            _fail(400, "Upload a JPEG or PNG photo of the report.")
        return image, image_format

    def extract_or_fail(image: bytes, image_format: str):
        try:
            return _call(services.read_report, image, image_format)
        except ExtractionError as e:
            _fail(422, str(e))

    def analysis_of(readings, taken_on: str, lang: str) -> dict:
        """One report read on its own: cards and an overall summary, compared with nothing and saved nowhere.

        Used for a report printed with a stranger's name, and for a visitor with no account.
        """
        stamped = [replace(r, taken_on=taken_on) for r in readings]
        trends = sort_trends([compute_trend(group) for group in group_by_test(stamped)])
        sentences = summarise(trends, lang, services.phrase, reword_english)
        return {
            "trends": [{**asdict(t), "summary": sentences[t.test_key], "updated": False} for t in trends],
            "summary": overall_summary(trends, lang, services.write_summary),
        }

    def build_response(person_id: str, lang: str, report: dict | None, touched: set[str]) -> dict:
        readings = _call(services.load_readings, person_id)
        trends = sort_trends([compute_trend(group) for group in group_by_test(readings)])
        sentences = summarise(trends, lang, services.phrase, reword_english)
        return {
            "person_id": person_id,
            "report": report,
            "trends": [
                {**asdict(t), "summary": sentences[t.test_key], "updated": t.test_key in touched}
                for t in trends
            ],
            "reminder": reminder(readings, today()),
        }

    @app.post("/api/auth/register", status_code=201)
    def register(body: Credentials):
        email, password = normalise_email(body.email), body.password or ""
        try:
            username = check_username(body.username or "")
            check_new_account(email, password, _call(services.load_account, email))
        except EmailTaken as e:
            _fail(409, str(e))
        except AuthError as e:
            _fail(400, str(e))
        _call(services.save_account, Account(email, hash_password(password), username))
        return {"email": email, "username": username}   # no session: the person logs in next

    @app.post("/api/auth/login")
    def login(body: Credentials):
        email, password = normalise_email(body.email), body.password or ""
        account = _call(services.load_account, email)
        if not verify_password(password, account.password_hash if account else dummy_hash) or account is None:
            _fail(401, BAD_LOGIN)
        return start_session(account)

    @app.post("/api/auth/logout")
    def logout(request: Request, owner: str = Depends(current_owner)):
        _call(services.delete_session, request.state.token_hash)
        return {"ok": True}

    @app.get("/api/auth/me")
    def me(owner: str = Depends(current_owner)):
        account = _call(services.load_account, owner)
        return {"email": owner, "username": display_username(account) if account else owner.split("@")[0]}

    @app.get("/api/people")
    def get_people(owner: str = Depends(current_owner)):
        return {"people": [p.as_dict(today()) for p in sort_people(_call(services.list_people, owner))]}

    @app.post("/api/people", status_code=201)
    def post_person(body: NewPerson, owner: str = Depends(current_owner)):
        existing = _call(services.list_people, owner)
        try:
            person = new_person(body.title or "", body.name or "", body.is_self, existing, gender=body.gender,
                                age=body.age, today=today(), height_cm=body.height_cm, weight_kg=body.weight_kg)
        except SelfProfileExists as e:
            _fail(409, str(e))
        except PersonError as e:
            _fail(400, str(e))
        _call(services.save_person, owner, person)
        return person.as_dict(today())

    @app.patch("/api/people/{person_id}")
    def patch_person(person_id: str, body: PersonChanges, owner: str = Depends(current_owner)):
        person = find_person(person_id, owner)
        try:
            edited = edit_person(person, body.model_dump(exclude_unset=True), today=today())
        except PersonError as e:
            _fail(400, str(e))
        _call(services.save_person, owner, edited)
        return edited.as_dict(today())

    @app.get("/api/trends")
    def get_trends(person_id: str | None = None, lang: str | None = None, owner: str = Depends(current_owner)):
        person_id = check_person(person_id, owner)
        lang = _check_lang(lang)
        return build_response(person_id, lang, report=None, touched=set())

    @app.get("/api/doctor")
    def get_doctor_view(person_id: str | None = None, owner: str = Depends(current_owner)):
        person_id = check_person(person_id, owner)
        return doctor_view(person_id, _call(services.load_readings, person_id))

    @app.post("/api/chat")
    def post_chat(body: ChatRequest, owner: str = Depends(current_owner)):
        person_id = check_person(body.person_id, owner)
        lang = _check_lang(body.lang)
        question = (body.question or "").strip()
        if not question or len(question) > MAX_QUESTION_CHARS:
            _fail(400, f"Type a question of up to {MAX_QUESTION_CHARS} characters.")
        readings = _call(services.load_readings, person_id)
        if not readings:
            return {"person_id": person_id, "reply": NO_REPORTS_REPLY}
        if services.chat is None:
            _fail(503, UNAVAILABLE)
        return {"person_id": person_id, "reply": _call(services.chat, question, lang, readings)}

    @app.post("/api/reports")
    async def post_report(
        person_id: str | None = Form(None),
        file: UploadFile | None = File(None),
        report_date: str | None = Form(None),
        lang: str | None = Form(None),
        owner: str = Depends(current_owner),
    ):
        """One step: read and save (no review). Still refuses a report printed with someone else's name."""
        person = find_person(person_id, owner)
        lang = _check_lang(lang)
        if report_date and not _is_iso_date(report_date):
            _fail(400, "Enter the report date as a calendar date.")
        image, image_format = await read_image(file)
        extracted = extract_or_fail(image, image_format)

        taken_on = report_date or extracted.report_date
        if not taken_on:
            _fail(422, "Couldn’t read a date on this report. Enter the report date and upload again.")
        if not extracted.readings:
            _fail(422, "No test results were found on this report. Try a sharper, flatter photo.")
        check_name_for_saving(person, owner, extracted.patient_name, name_confirmed=True)
        return save_new_report(owner, person, extracted.readings, taken_on, extracted.lab_name,
                               extracted.patient_name, image, image_format, lang)

    @app.post("/api/reports/preview")
    async def preview_report(
        person_id: str | None = Form(None),
        file: UploadFile | None = File(None),
        report_date: str | None = Form(None),
        lang: str | None = Form(None),
        owner: str = Depends(current_owner),
    ):
        """Step 1: read the photo and check the name. Nothing is saved."""
        person = find_person(person_id, owner)
        lang = _check_lang(lang)
        if report_date and not _is_iso_date(report_date):
            _fail(400, "Enter the report date as a calendar date.")
        image, image_format = await read_image(file)
        extracted = extract_or_fail(image, image_format)
        if not extracted.readings:
            _fail(422, "No test results were found on this report. Try a sharper, flatter photo.")

        name_check = check_report_name(extracted.patient_name, person, _call(services.list_people, owner))
        taken_on = report_date or extracted.report_date
        body = {"person_id": person.person_id, "name_check": name_check, "report_date": taken_on,
                "lab_name": extracted.lab_name, "patient_name": extracted.patient_name,
                "readings": reading_rows(extracted.readings), "saved": False}
        if name_check["status"] == "different":
            # Helping someone else: show what their report says, keep nothing.
            body["analysis"] = analysis_of(extracted.readings, taken_on or today().isoformat(), lang)
        return body

    @app.post("/api/reports/confirm")
    async def confirm_report(
        person_id: str | None = Form(None),
        file: UploadFile | None = File(None),
        payload: str | None = Form(None),
        owner: str = Depends(current_owner),
    ):
        """Step 2: save the values the person reviewed (and maybe corrected), with the photo."""
        person = find_person(person_id, owner)
        try:
            data = json.loads(payload or "{}")
        except json.JSONDecodeError:
            _fail(400, "Something in the request was missing or malformed.")
        if not isinstance(data, dict):
            _fail(400, "Something in the request was missing or malformed.")
        lang = _check_lang(data.get("lang"))
        report_date = data.get("report_date") or ""
        if not _is_iso_date(report_date):
            _fail(400, "Enter the report date as a calendar date.")
        try:
            readings = check_reviewed(data.get("readings") or [])
            height_cm, weight_kg = check_height(data.get("height_cm")), check_weight(data.get("weight_kg"))
        except (ReportError, PersonError) as e:
            _fail(400, str(e))
        image, image_format = await read_image(file)
        check_name_for_saving(person, owner, data.get("patient_name"), bool(data.get("name_confirmed")))
        return save_new_report(owner, person, readings, report_date, data.get("lab_name"), data.get("patient_name"),
                               image, image_format, lang, height_cm, weight_kg)

    @app.post("/api/analyze")
    async def analyse_without_an_account(
        request: Request,
        file: UploadFile | None = File(None),
        lang: str | None = Form(None),
    ):
        """One report, read for a visitor who has no account. Nothing is stored and nothing is remembered.

        No login, so reading is capped per visitor: the model call costs money.
        """
        lang = _check_lang(lang)
        image, image_format = await read_image(file)
        # Counted only once the upload is about to reach the model, which is the part that costs
        # money. Choosing the wrong file, or one that is too large, must not use up someone's
        # allowance: that would lock out a person fumbling with their photos, not an abuser.
        visitor = request.client.host if request.client else "unknown"
        if not free_analyses.allow(visitor, app.state.now()):
            _fail(429, TOO_MANY_FREE)
        extracted = extract_or_fail(image, image_format)
        if not extracted.readings:
            _fail(422, "No test results were found on this report. Try a sharper, flatter photo.")
        # A missing date is no reason to refuse: nothing is filed, so today simply labels the reading.
        analysis = analysis_of(extracted.readings, extracted.report_date or today().isoformat(), lang)
        return {"report_date": extracted.report_date, "lab_name": extracted.lab_name,
                "readings": reading_rows(extracted.readings), "saved": False, **analysis}

    @app.get("/api/reports")
    def list_reports(person_id: str | None = None, owner: str = Depends(current_owner)):
        person_id = check_person(person_id, owner)
        return {"person_id": person_id, "reports": [r.as_dict() for r in _call(services.list_reports, person_id)]}

    @app.get("/api/reports/{report_id}")
    def report_detail(report_id: str, person_id: str | None = None, lang: str | None = None,
                      owner: str = Depends(current_owner)):
        person_id = check_person(person_id, owner)
        lang = _check_lang(lang)
        report = find_report(person_id, report_id)
        keys = set(report.test_keys)
        readings = [r for r in _call(services.load_readings, person_id)
                    if r.test_key in keys and r.taken_on == report.report_date]
        photo = _call(services.image_url, report.s3_key) if report.s3_key else None   # seeded reports have none
        return {**report.as_dict(), "image_url": photo,
                "readings": reading_rows(sorted(readings, key=lambda r: r.test_name.lower())),
                "summary": summary_for(person_id, report, lang)}

    @app.put("/api/reports/{report_id}")
    def edit_report(report_id: str, body: ReportEdit, owner: str = Depends(current_owner)):
        """Replace a saved report's values (and date). The photo stays; summaries are written afresh."""
        person_id = check_person(body.person_id, owner)
        lang = _check_lang(body.lang)
        report = find_report(person_id, report_id)
        report_date = body.report_date or report.report_date
        if not _is_iso_date(report_date):
            _fail(400, "Enter the report date as a calendar date.")
        try:
            readings = [replace(r, taken_on=report_date) for r in check_reviewed(body.readings or [])]
        except ReportError as e:
            _fail(400, str(e))
        _call(services.delete_report, person_id, report_id)
        _call(services.save_readings, person_id, readings, report_id, report.s3_key)
        edited = replace(report, report_date=report_date, test_keys=[r.test_key for r in readings], summaries={})
        _call(services.save_report, person_id, edited)
        return build_response(person_id, lang, {**edited.as_dict(), "summary": summary_for(person_id, edited, lang)},
                              touched={r.test_key for r in readings})

    @app.delete("/api/reports/{report_id}")
    def remove_report(report_id: str, person_id: str | None = None, owner: str = Depends(current_owner)):
        person_id = check_person(person_id, owner)
        report = find_report(person_id, report_id)
        _call(services.delete_report, person_id, report_id)
        _call(services.delete_image, report.s3_key)
        return {"ok": True}

    return app


app = create_app(aws_services(), reword_english=os.environ.get("PHRASE") == "1")
handler = Mangum(app)   # lets the same app run on Lambda
