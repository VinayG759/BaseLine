"""The four things the API needs done, and the AWS implementation of each.

The API only ever calls a Services object, so tests can plug in fakes and the
real one below plugs in S3 and DynamoDB, plus a model provider for the three
AI slots (read_report, phrase, chat). Settings (environment variables):

    AWS_REGION, BUCKET, TABLE      always
    MODEL_PROVIDER                 "bedrock" (default) or "openrouter"
    MODEL_ID                       with bedrock
    OPENROUTER_API_KEY             with openrouter
    OPENROUTER_MODEL               optional, default google/gemini-3.5-flash-lite
"""
import os
from dataclasses import dataclass
from functools import cache
from typing import Callable

import boto3

from core import openrouter, store
from core.chat import answer
from core.auth import Account, Session
from core.extract import Extracted, extract
from core.people import Person
from core.phrase import phrase as bedrock_phrase
from core.phrase import write_summary as bedrock_write_summary
from core.reports import Report
from core.trends import Reading


@dataclass(frozen=True)
class Services:
    read_report: Callable[[bytes, str], Extracted]                 # image, "jpeg"|"png"
    save_image: Callable[[str, str, bytes, str], str]              # person, report id, image, format -> key
    save_readings: Callable[[str, list[Reading], str, str], None]  # person, readings, report id, key
    load_readings: Callable[[str], list[Reading]]                  # person
    list_people: Callable[[str], list[Person]]                     # owner email
    save_person: Callable[[str, Person], None]                     # owner email, person
    save_account: Callable[[Account], None]
    load_account: Callable[[str], Account | None]                  # email
    save_session: Callable[[Session], None]
    load_session: Callable[[str], Session | None]                  # token hash
    delete_session: Callable[[str], None]                          # token hash
    save_report: Callable[[str, Report], None]                     # person, report
    list_reports: Callable[[str], list[Report]]                    # person -> newest first
    get_report: Callable[[str, str], Report | None]                # person, report id
    update_report_summary: Callable[[str, str, str, str], None]    # person, report id, lang, text
    delete_report: Callable[[str, str], None]                      # person, report id (record + its readings)
    image_url: Callable[[str], str]                                # photo key -> short-lived link
    delete_image: Callable[[str], None]                            # photo key
    write_summary: Callable[[list[str], str], str] | None = None           # facts, lang -> report summary
    phrase: Callable[[dict[str, str], str], dict[str, str]] | None = None  # templates, lang -> sentences
    chat: Callable[[str, str, list[Reading]], str] | None = None            # question, lang, readings -> reply


def _setting(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Set the {name} environment variable.")
    return value


PROVIDERS = ("bedrock", "openrouter")
DEFAULT_OPENROUTER_MODEL = "google/gemini-3.5-flash-lite"   # as accurate as 3.8 Flash on our test report, 2-6x faster


def _provider() -> str:
    provider = os.environ.get("MODEL_PROVIDER") or "bedrock"
    if provider not in PROVIDERS:
        raise RuntimeError(f"Set MODEL_PROVIDER to one of: {', '.join(PROVIDERS)}.")
    return provider


def _openrouter_model() -> str:
    return os.environ.get("OPENROUTER_MODEL") or DEFAULT_OPENROUTER_MODEL


def aws_services() -> Services:
    """AWS clients are created on first use, so the app starts even when a setting is missing."""

    @cache
    def bedrock():
        return boto3.client("bedrock-runtime", region_name=_setting("AWS_REGION"))

    @cache
    def s3():
        return boto3.client("s3", region_name=_setting("AWS_REGION"))

    @cache
    def table():
        return boto3.resource("dynamodb", region_name=_setting("AWS_REGION")).Table(_setting("TABLE"))

    @cache
    def openrouter_client():
        return openrouter.make_client(_setting("OPENROUTER_API_KEY"))

    def read_report(image, image_format):
        if _provider() == "openrouter":
            return openrouter.read_report(image, image_format, _openrouter_model(), openrouter_client())
        return extract(image, image_format, _setting("MODEL_ID"), bedrock())

    def save_image(person_id, report_id, image, image_format):
        return store.save_image(s3(), _setting("BUCKET"), person_id, report_id, image, image_format)

    def save_readings(person_id, readings, report_id, s3_key):
        store.save_readings(table(), person_id, readings, report_id, s3_key)

    def load_readings(person_id):
        return store.load_readings(table(), person_id)

    def list_people(owner):
        return store.load_people(table(), owner)

    def save_person(owner, person):
        store.save_person(table(), owner, person)

    def save_account(account):
        store.save_account(table(), account)

    def load_account(email):
        return store.load_account(table(), email)

    def save_session(session):
        store.save_session(table(), session)

    def load_session(token_hash):
        return store.load_session(table(), token_hash)

    def delete_session(token_hash):
        store.delete_session(table(), token_hash)

    def save_report(person_id, report):
        store.save_report(table(), person_id, report)

    def list_reports(person_id):
        return store.load_reports(table(), person_id)

    def get_report(person_id, report_id):
        return store.load_report(table(), person_id, report_id)

    def update_report_summary(person_id, report_id, lang, text):
        store.update_report_summary(table(), person_id, report_id, lang, text)

    def delete_report(person_id, report_id):
        store.delete_report(table(), person_id, report_id)

    def image_url(key):
        return store.image_url(s3(), _setting("BUCKET"), key)

    def delete_image(key):
        store.delete_image(s3(), _setting("BUCKET"), key)

    def write_summary(facts, lang):
        if _provider() == "openrouter":
            return openrouter.write_summary(facts, lang, _openrouter_model(), openrouter_client())
        return bedrock_write_summary(facts, lang, _setting("MODEL_ID"), bedrock())

    def phrase(templates, lang):
        if _provider() == "openrouter":
            return openrouter.phrase(templates, lang, _openrouter_model(), openrouter_client())
        return bedrock_phrase(templates, lang, _setting("MODEL_ID"), bedrock())

    def chat(question, lang, readings):
        if _provider() == "openrouter":
            model = openrouter.chat_model(_setting("OPENROUTER_API_KEY"), _openrouter_model())
        else:
            from strands.models.bedrock import BedrockModel   # imported here: only chat needs it
            model = BedrockModel(model_id=_setting("MODEL_ID"), region_name=_setting("AWS_REGION"), temperature=0)
        return answer(question, lang, readings, model)

    return Services(
        read_report=read_report, save_image=save_image, save_readings=save_readings, load_readings=load_readings,
        list_people=list_people, save_person=save_person, save_account=save_account, load_account=load_account,
        save_session=save_session, load_session=load_session, delete_session=delete_session,
        save_report=save_report, list_reports=list_reports, get_report=get_report,
        update_report_summary=update_report_summary, delete_report=delete_report, image_url=image_url,
        delete_image=delete_image, write_summary=write_summary, phrase=phrase, chat=chat,
    )
