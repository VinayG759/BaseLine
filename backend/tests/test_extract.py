import json

import pytest

from core.extract import ExtractionError, normalise, parse


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
