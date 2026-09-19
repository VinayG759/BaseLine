"""Stage 1 of the pipeline: the model reads the report; this module checks what it read.

extract() sends the photo to a Bedrock model. parse() turns the model's text
into readings and needs no network, so it is tested with made-up replies.
"""
import json
import re
from dataclasses import dataclass

from core.trends import Reading

UNREADABLE = "This image couldn’t be read as a lab report. Try a sharper, flatter photo."

PROMPT = """You are reading a photo of a printed medical lab report.
Return ONLY a JSON object, with no other text, in exactly this shape:
{"report_date": "YYYY-MM-DD or null", "lab_name": "string or null",
 "readings": [{"test_name": "...", "value": 0.0, "unit": "...", "ref_low": 0.0, "ref_high": 0.0}]}

Rules:
- Copy every value exactly as printed. Never estimate, round or correct a number.
- A range printed "4.0 - 5.6" means ref_low 4.0 and ref_high 5.6.
- A range printed "< 200" means ref_low null and ref_high 200. "> 40" means ref_low 40 and ref_high null.
- If no range is printed, use null for both.
- Skip any row whose result is not a number (for example "Negative" or "Pale yellow").
- Ignore the "H" or "L" flags next to results; they are not part of the value.
- report_date is the date the sample was collected or reported, as YYYY-MM-DD. Use null if you cannot read it.
- If this is not a lab report, return {"report_date": null, "lab_name": null, "readings": []}."""


class ExtractionError(Exception):
    """Raised with a sentence the person using the page can act on."""


@dataclass(frozen=True)
class Extracted:
    report_date: str | None
    lab_name: str | None
    readings: list[Reading]


def normalise(name: str) -> str:
    """"HbA1c", "HBA1C" and "Hb A1c" all become "hba1c", so they share one history."""
    return re.sub(r"[^a-z0-9]", "", name.lower())


def strip_fence(text: str) -> str:
    """Remove a ```json ... ``` wrapper if the model added one."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else ""
        if text.rstrip().endswith("```"):
            text = text.rstrip()[:-3]
    return text.strip()


def _number(value) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def parse(text: str) -> Extracted:
    try:
        data = json.loads(strip_fence(text))
    except json.JSONDecodeError:
        raise ExtractionError(UNREADABLE)
    if not isinstance(data, dict) or not isinstance(data.get("readings"), list):
        raise ExtractionError(UNREADABLE)

    readings = []
    for row in data["readings"]:
        if not isinstance(row, dict):
            continue
        name = str(row.get("test_name") or "").strip()
        value = _number(row.get("value"))
        if not name or value is None or not normalise(name):
            continue
        readings.append(Reading(
            test_key=normalise(name),
            test_name=name,
            value=value,
            unit=str(row.get("unit") or "").strip(),
            ref_low=_number(row.get("ref_low")),
            ref_high=_number(row.get("ref_high")),
            taken_on="",  # the API stamps the report date on later
        ))

    date = data.get("report_date")
    if not (isinstance(date, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", date)):
        date = None
    lab = data.get("lab_name")

    return Extracted(report_date=date, lab_name=lab if isinstance(lab, str) and lab.strip() else None,
                     readings=readings)


def extract(image: bytes, image_format: str, model_id: str, client) -> Extracted:
    """`client` is a boto3 bedrock-runtime client. Temperature 0: same photo, same numbers."""
    response = client.converse(
        modelId=model_id,
        messages=[{
            "role": "user",
            "content": [
                {"image": {"format": image_format, "source": {"bytes": image}}},
                {"text": PROMPT},
            ],
        }],
        inferenceConfig={"temperature": 0, "maxTokens": 2000},
    )
    return parse(response["output"]["message"]["content"][0]["text"])
