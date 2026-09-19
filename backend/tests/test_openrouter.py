import base64
import json

import pytest

from core import extract as extract_module
from core import phrase as phrase_module
from core.extract import ExtractionError
from core.openrouter import BASE_URL, chat_model, phrase, read_report
from fakes import REPLY, FakeClient

MODEL = "google/gemini-3.8-flash"


def test_report_photo_is_sent_as_an_image_with_the_reading_instructions():
    client = FakeClient("```json\n" + json.dumps(REPLY) + "\n```")

    result = read_report(b"photo", "jpeg", MODEL, client)

    [request] = client.requests
    assert request["model"] == MODEL
    assert request["temperature"] == 0
    [message] = request["messages"]
    image, text = message["content"]
    assert image == {"type": "image_url",
                     "image_url": {"url": "data:image/jpeg;base64," + base64.b64encode(b"photo").decode()}}
    assert text == {"type": "text", "text": extract_module.PROMPT}
    assert [(r.test_key, r.value) for r in result.readings] == [("hba1c", 6.4)]


def test_png_photos_are_labelled_as_png():
    client = FakeClient(json.dumps(REPLY))

    read_report(b"photo", "png", MODEL, client)

    url = client.requests[0]["messages"][0]["content"][0]["image_url"]["url"]
    assert url.startswith("data:image/png;base64,")


@pytest.mark.parametrize("reply", ["This looks like a cat.", None, ""])
def test_a_reply_that_is_not_a_report_gives_the_readable_error(reply):
    with pytest.raises(ExtractionError):
        read_report(b"photo", "jpeg", MODEL, FakeClient(reply))


def test_translation_sends_the_shared_instructions_and_facts():
    templates = {"hba1c": "Gone up 2 times in a row (5.6 → 6.1 → 6.4 %)."}
    kn = {"hba1c": "HbA1c ಸತತ 2 ಬಾರಿ ಏರಿದೆ (5.6 → 6.1 → 6.4 %)."}
    client = FakeClient(json.dumps(kn, ensure_ascii=False))

    assert phrase(templates, "kn", MODEL, client) == kn

    request = client.requests[0]
    assert request["temperature"] == 0
    system, user = request["messages"]
    assert system == {"role": "system", "content": phrase_module.PROMPT}
    assert json.loads(user["content"]) == {"language": "Kannada", "facts": templates}


def test_a_translation_reply_that_is_not_json_raises_so_templates_are_used():
    with pytest.raises(ValueError):
        phrase({"hba1c": "x"}, "hi", MODEL, FakeClient("Sure, here you go!"))


def test_chat_model_points_strands_at_openrouter_at_temperature_zero():
    model = chat_model("sk-or-test", MODEL)

    assert model.get_config()["model_id"] == MODEL
    assert model.get_config()["params"] == {"temperature": 0}
    assert model.client_args == {"api_key": "sk-or-test", "base_url": BASE_URL}
