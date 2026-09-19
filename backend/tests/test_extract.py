import json

import boto3
import pytest
from botocore.stub import ANY, Stubber

from core.extract import ExtractionError, extract, normalise, parse


def model_reply(readings, report_date="2026-09-12", lab_name="Sri Sai Diagnostics"):
    return json.dumps({"report_date": report_date, "lab_name": lab_name, "readings": readings})


HBA1C_ROW = {"test_name": "HbA1c", "value": 6.4, "unit": "%", "ref_low": 4.0, "ref_high": 5.6}


def test_different_spellings_of_one_test_share_a_key():
    assert normalise("HbA1c") == normalise("HBA1C") == normalise("Hb A1c") == "hba1c"


def test_reply_wrapped_in_a_markdown_fence_still_parses():
    fenced = "```json\n" + model_reply([HBA1C_ROW]) + "\n```"

    result = parse(fenced)

    assert result.report_date == "2026-09-12"
    assert result.lab_name == "Sri Sai Diagnostics"
    assert [(r.test_key, r.value, r.ref_low, r.ref_high) for r in result.readings] == [
        ("hba1c", 6.4, 4.0, 5.6)
    ]


def test_row_with_a_non_numeric_value_is_skipped():
    colour = {"test_name": "Colour", "value": "pale yellow", "unit": "", "ref_low": None, "ref_high": None}

    result = parse(model_reply([colour, HBA1C_ROW]))

    assert [r.test_key for r in result.readings] == ["hba1c"]


def test_date_not_in_iso_form_becomes_none():
    result = parse(model_reply([HBA1C_ROW], report_date="12/09/2026"))

    assert result.report_date is None


def test_plain_prose_raises_a_readable_error():
    with pytest.raises(ExtractionError, match="couldn’t be read as a lab report"):
        parse("Sorry, I can't see a lab report in this image.")


# ---- extract(): the Bedrock call, checked with botocore's Stubber (no AWS involved) ----

def bedrock_answering(reply_text, image=b"photo", image_format="jpeg", model_id="us.amazon.nova-pro-v1:0"):
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
            "modelId": model_id,
            "messages": [{
                "role": "user",
                "content": [
                    {"image": {"format": image_format, "source": {"bytes": image}}},
                    {"text": ANY},
                ],
            }],
            "inferenceConfig": {"temperature": 0, "maxTokens": 2000},
        },
    )
    stub.activate()
    return client, stub


def test_extract_sends_the_image_at_temperature_zero_and_parses_the_reply():
    client, stub = bedrock_answering("```json\n" + model_reply([HBA1C_ROW]) + "\n```")

    result = extract(b"photo", "jpeg", "us.amazon.nova-pro-v1:0", client)

    stub.assert_no_pending_responses()
    assert [(r.test_key, r.value) for r in result.readings] == [("hba1c", 6.4)]
    assert result.report_date == "2026-09-12"


def test_extract_passes_png_through_as_png():
    client, stub = bedrock_answering(model_reply([HBA1C_ROW]), image_format="png")

    extract(b"photo", "png", "us.amazon.nova-pro-v1:0", client)

    stub.assert_no_pending_responses()


def test_extract_turns_a_non_report_reply_into_a_readable_error():
    client, _ = bedrock_answering("This looks like a photo of a cat.")

    with pytest.raises(ExtractionError):
        extract(b"photo", "jpeg", "us.amazon.nova-pro-v1:0", client)
