"""The Baseline API: two endpoints, shaped exactly as CONTRACT.md describes.

The API never talks to AWS or a model directly. It calls four plug-in
functions (Services), so the same API runs with Bedrock and DynamoDB, with
local stand-ins, or with fakes in the tests.
"""
import re
import uuid
from dataclasses import asdict, dataclass, replace
from datetime import date
from typing import Callable

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from core.explain import summarise
from core.extract import Extracted, ExtractionError
from core.trends import Reading, compute_trend, group_by_test, sort_trends

MAX_IMAGE_BYTES = 4 * 1024 * 1024
PERSON_ID = re.compile(r"[a-z0-9-]{1,32}")
LANGS = {"en", "kn", "hi"}
IMAGE_FORMATS = {"image/jpeg": "jpeg", "image/png": "png"}


@dataclass(frozen=True)
class Services:
    read_report: Callable[[bytes, str], Extracted]              # image, "jpeg"|"png"
    save_image: Callable[[str, str, bytes, str], str]           # person, report id, image, format -> key
    save_readings: Callable[[str, list[Reading], str, str], None]  # person, readings, report id, key
    load_readings: Callable[[str], list[Reading]]               # person


def _fail(status: int, sentence: str):
    raise HTTPException(status_code=status, detail=sentence)


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


def create_app(services: Services) -> FastAPI:
    app = FastAPI(title="Baseline")
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"], allow_headers=["*"])

    @app.exception_handler(HTTPException)
    async def http_error(_: Request, exc: HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"error": str(exc.detail)})

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError):
        return JSONResponse(status_code=400, content={"error": "Something in the request was missing or malformed."})

    def build_response(person_id: str, lang: str, report: dict | None, touched: set[str]) -> dict:
        readings = services.load_readings(person_id)
        trends = sort_trends([compute_trend(group) for group in group_by_test(readings)])
        sentences = summarise(trends, lang)
        return {
            "person_id": person_id,
            "report": report,
            "trends": [
                {**asdict(t), "summary": sentences[t.test_key], "updated": t.test_key in touched}
                for t in trends
            ],
        }

    @app.get("/api/trends")
    def get_trends(person_id: str | None = None, lang: str | None = None):
        person_id = _check_person(person_id)
        lang = _check_lang(lang)
        return build_response(person_id, lang, report=None, touched=set())

    @app.post("/api/reports")
    async def post_report(
        person_id: str | None = Form(None),
        file: UploadFile | None = File(None),
        report_date: str | None = Form(None),
        lang: str | None = Form(None),
    ):
        person_id = _check_person(person_id)
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
            extracted = services.read_report(image, image_format)
        except ExtractionError as e:
            _fail(422, str(e))

        taken_on = report_date or extracted.report_date
        if not taken_on:
            _fail(422, "Couldn’t read a date on this report. Enter the report date and upload again.")
        if not extracted.readings:
            _fail(422, "No test results were found on this report. Try a sharper, flatter photo.")

        readings = [replace(r, taken_on=taken_on) for r in extracted.readings]
        report_id = uuid.uuid4().hex
        s3_key = services.save_image(person_id, report_id, image, image_format)
        services.save_readings(person_id, readings, report_id, s3_key)

        report = {"report_id": report_id, "report_date": taken_on, "lab_name": extracted.lab_name}
        return build_response(person_id, lang, report, touched={r.test_key for r in readings})

    return app
