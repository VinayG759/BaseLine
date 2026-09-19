"""The four things the API needs done, and the AWS implementation of each.

The API only ever calls a Services object, so tests can plug in fakes and the
real one below can plug in Bedrock, S3 and DynamoDB, configured by four
environment variables: AWS_REGION, MODEL_ID, BUCKET, TABLE.
"""
import os
from dataclasses import dataclass
from functools import cache
from typing import Callable

import boto3

from core import store
from core.chat import answer
from core.extract import Extracted, extract
from core.people import Person
from core.phrase import phrase as bedrock_phrase
from core.trends import Reading


@dataclass(frozen=True)
class Services:
    read_report: Callable[[bytes, str], Extracted]                 # image, "jpeg"|"png"
    save_image: Callable[[str, str, bytes, str], str]              # person, report id, image, format -> key
    save_readings: Callable[[str, list[Reading], str, str], None]  # person, readings, report id, key
    load_readings: Callable[[str], list[Reading]]                  # person
    list_people: Callable[[], list[Person]]
    save_person: Callable[[Person], None]
    phrase: Callable[[dict[str, str], str], dict[str, str]] | None = None  # templates, lang -> sentences
    chat: Callable[[str, str, list[Reading]], str] | None = None            # question, lang, readings -> reply


def _setting(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Set the {name} environment variable.")
    return value


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

    def read_report(image, image_format):
        return extract(image, image_format, _setting("MODEL_ID"), bedrock())

    def save_image(person_id, report_id, image, image_format):
        return store.save_image(s3(), _setting("BUCKET"), person_id, report_id, image, image_format)

    def save_readings(person_id, readings, report_id, s3_key):
        store.save_readings(table(), person_id, readings, report_id, s3_key)

    def load_readings(person_id):
        return store.load_readings(table(), person_id)

    def list_people():
        return store.load_people(table())

    def save_person(person):
        store.save_person(table(), person)

    def phrase(templates, lang):
        return bedrock_phrase(templates, lang, _setting("MODEL_ID"), bedrock())

    def chat(question, lang, readings):
        from strands.models.bedrock import BedrockModel   # imported here: only chat needs it
        model = BedrockModel(model_id=_setting("MODEL_ID"), region_name=_setting("AWS_REGION"), temperature=0)
        return answer(question, lang, readings, model)

    return Services(read_report, save_image, save_readings, load_readings, list_people, save_person,
                    phrase, chat)
