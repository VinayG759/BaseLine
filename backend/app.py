"""The Baseline API: two endpoints, shaped exactly as CONTRACT.md describes.

The API never talks to AWS or a model directly. It calls four plug-in
functions (Services), so the same API runs with Bedrock and DynamoDB, with
local stand-ins, or with fakes in the tests.

Run locally:  uvicorn app:app --reload --port 8000
On Lambda:    handler "app.handler"
"""
import logging
import os
import re
import uuid
from dataclasses import asdict, replace
from datetime import date
from typing import Callable

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from mangum import Mangum

from core.auth import (Account, AuthError, EmailTaken, check_new_account, hash_password, hash_token, new_session,
                       normalise_email, session_is_valid, utc_now, verify_password)
from core.doctor import doctor_view
from core.explain import summarise
from core.extract import ExtractionError
from core.people import PersonError, SelfProfileExists, new_person, sort_people
from core.reminder import reminder
from core.services import Services, aws_services
from core.trends import compute_trend, group_by_test, sort_trends

MAX_IMAGE_BYTES = 4 * 1024 * 1024
PERSON_ID = re.compile(r"[a-z0-9-]{1,32}")
LANGS = {"en", "kn", "hi"}
IMAGE_FORMATS = {"image/jpeg": "jpeg", "image/png": "png"}
MAX_QUESTION_CHARS = 500
NO_REPORTS_REPLY = "There are no reports for this person yet. Add a lab report first, then ask again."
UNAVAILABLE = "Baseline can’t reach its storage or reading service right now. Try again in a minute."

log = logging.getLogger("baseline")


def _fail(status: int, sentence: str):
    raise HTTPException(status_code=status, detail=sentence)


LOGIN_NEEDED = "Please log in to continue."
BAD_LOGIN = "Email or password is incorrect."


class Credentials(BaseModel):
    email: str | None = None
    password: str | None = None


class NewPerson(BaseModel):
    title: str | None = None
    name: str | None = None
    is_self: bool = False


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
) -> FastAPI:
    app = FastAPI(title="Baseline")
    app.state.now = now
    # Checked against when an email doesn't exist, so a wrong email takes as long as a wrong password.
    dummy_hash = hash_password("not a real password")
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"], allow_headers=["*"])

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

    def start_session(email: str) -> dict:
        token, session = new_session(email, app.state.now())
        _call(services.save_session, session)
        return {"token": token, "email": email}

    def check_person(person_id: str | None, owner: str) -> str:
        """A valid ID that belongs to one of this account's people, or a 400/404 with a sentence."""
        person_id = _check_person(person_id)
        if person_id not in {p.person_id for p in _call(services.list_people, owner)}:
            _fail(404, "This person isn’t in Baseline yet. Add them first.")
        return person_id

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
            check_new_account(email, password, _call(services.load_account, email))
        except EmailTaken as e:
            _fail(409, str(e))
        except AuthError as e:
            _fail(400, str(e))
        _call(services.save_account, Account(email, hash_password(password)))
        return {"email": email}   # no session: the person logs in next, on the login page

    @app.post("/api/auth/login")
    def login(body: Credentials):
        email, password = normalise_email(body.email), body.password or ""
        account = _call(services.load_account, email)
        if not verify_password(password, account.password_hash if account else dummy_hash) or account is None:
            _fail(401, BAD_LOGIN)
        return start_session(email)

    @app.post("/api/auth/logout")
    def logout(request: Request, owner: str = Depends(current_owner)):
        _call(services.delete_session, request.state.token_hash)
        return {"ok": True}

    @app.get("/api/auth/me")
    def me(owner: str = Depends(current_owner)):
        return {"email": owner}

    @app.get("/api/people")
    def get_people(owner: str = Depends(current_owner)):
        return {"people": [p.as_dict() for p in sort_people(_call(services.list_people, owner))]}

    @app.post("/api/people", status_code=201)
    def post_person(body: NewPerson, owner: str = Depends(current_owner)):
        existing = _call(services.list_people, owner)
        try:
            person = new_person(body.title or "", body.name or "", body.is_self, existing)
        except SelfProfileExists as e:
            _fail(409, str(e))
        except PersonError as e:
            _fail(400, str(e))
        _call(services.save_person, owner, person)
        return person.as_dict()

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
        person_id = check_person(person_id, owner)
        lang = _check_lang(lang)
        if report_date and not _is_iso_date(report_date):
            _fail(400, "Enter the report date as a calendar date.")
        if file is None:
            _fail(400, "Choose a photo of the report to upload.")

        image = await file.read()
        if len(image) > MAX_IMAGE_BYTES:
            _fail(413, "This photo is too large. Try a smaller photo, under 4 MB.")
        image_format = IMAGE_FORMATS.get(file.content_type or "")
        if image_format is None:
            _fail(400, "Upload a JPEG or PNG photo of the report.")

        try:
            extracted = _call(services.read_report, image, image_format)
        except ExtractionError as e:
            _fail(422, str(e))

        taken_on = report_date or extracted.report_date
        if not taken_on:
            _fail(422, "Couldn’t read a date on this report. Enter the report date and upload again.")
        if not extracted.readings:
            _fail(422, "No test results were found on this report. Try a sharper, flatter photo.")

        readings = [replace(r, taken_on=taken_on) for r in extracted.readings]
        report_id = uuid.uuid4().hex
        s3_key = _call(services.save_image, person_id, report_id, image, image_format)
        _call(services.save_readings, person_id, readings, report_id, s3_key)

        report = {"report_id": report_id, "report_date": taken_on, "lab_name": extracted.lab_name}
        return build_response(person_id, lang, report, touched={r.test_key for r in readings})

    return app


app = create_app(aws_services(), reword_english=os.environ.get("PHRASE") == "1")
handler = Mangum(app)   # lets the same app run on Lambda
