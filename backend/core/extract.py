"""Stage 1 of the pipeline: the model reads the report; this module checks what it read.

parse() needs no network, so it is tested with made-up model replies. The
function that sends the image to a model is added once model access works.
"""
import json
import re
from dataclasses import dataclass

from core.trends import Reading

UNREADABLE = "This image couldn’t be read as a lab report. Try a sharper, flatter photo."


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
