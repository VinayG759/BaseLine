import json

import boto3
import pytest
from botocore.stub import ANY, Stubber

from core.phrase import LANGUAGE_NAMES, PROMPT, phrase

TEMPLATES = {"hba1c": "Gone up 2 times in a row (5.6 → 6.1 → 6.4 %). Above the normal range (4–5.6 %)."}


def bedrock_answering(reply_text, lang="kn"):
    client = boto3.client("bedrock-runtime", region_name="us-east-1",
                          aws_access_key_id="testing", aws_secret_access_key="testing")
    stub = Stubber(client)
    stub.add_response(
        "converse",
        {
            "output": {"message": {"role": "assistant", "content": [{"text": reply_text}]}},
            "stopReason": "end_turn",
            "usage": {"inputTokens": 1, "outputTokens": 1, "totalTokens": 2},
            "metrics": {"latencyMs": 1},
        },
        expected_params={
            "modelId": "us.amazon.nova-pro-v1:0",
            "system": [{"text": PROMPT}],
            "messages": [{"role": "user", "content": [{"text": ANY}]}],
            "inferenceConfig": {"temperature": 0, "maxTokens": 2000},
        },
    )
    stub.activate()
    return client, stub


def test_reply_json_becomes_the_sentences():
    reply = {"hba1c": "HbA1c ಸತತ 2 ಬಾರಿ ಏರಿದೆ (5.6 → 6.1 → 6.4 %). ವೈದ್ಯರೊಂದಿಗೆ ಚರ್ಚಿಸುವುದು ಒಳ್ಳೆಯದು."}
    client, stub = bedrock_answering("```json\n" + json.dumps(reply, ensure_ascii=False) + "\n```")

    assert phrase(TEMPLATES, "kn", "us.amazon.nova-pro-v1:0", client) == reply
    stub.assert_no_pending_responses()


def test_the_request_names_the_language_and_carries_the_facts():
    client, _ = bedrock_answering(json.dumps(TEMPLATES))
    sent = []
    client.meta.events.register("before-parameter-build.bedrock-runtime.Converse",
                                lambda params, **_: sent.append(params))

    phrase(TEMPLATES, "hi", "us.amazon.nova-pro-v1:0", client)

    request = json.loads(sent[0]["messages"][0]["content"][0]["text"])
    assert request == {"language": "Hindi", "facts": TEMPLATES}


def test_a_reply_that_is_not_json_raises_so_the_templates_are_used():
    client, _ = bedrock_answering("Sure! Here are the sentences you asked for.")

    with pytest.raises(ValueError):
        phrase(TEMPLATES, "kn", "us.amazon.nova-pro-v1:0", client)


def test_every_supported_language_has_a_full_name():
    assert LANGUAGE_NAMES == {"en": "English", "kn": "Kannada", "hi": "Hindi"}
