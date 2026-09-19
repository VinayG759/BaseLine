"""Stage 3 of the pipeline: turn a computed Trend into one plain sentence.

The English template is fixed, instant, and always says the same thing. A
model may reword or translate it; the template stays as the fallback.
"""
import logging
import re
from typing import Callable

from core.trends import Trend

log = logging.getLogger("baseline")


def _num(x: float) -> str:
    """4.0 -> "4", 5.6 -> "5.6", 109 -> "109"."""
    return f"{x:f}".rstrip("0").rstrip(".")


def _change(t: Trend) -> str:
    if t.direction == "first":
        return "First result on record."
    if t.direction == "stable":
        return "Unchanged since the last report."
    verb = "Gone up" if t.direction == "rising" else "Gone down"
    run = [_num(h["value"]) for h in t.history[-(t.streak + 1):]]
    values = f"({' → '.join(run)} {t.unit})"
    if t.streak >= 2:
        return f"{verb} {t.streak} times in a row {values}."
    return f"{verb} since the last report {values}."


def _range(t: Trend) -> str:
    if t.ref_low is not None and t.ref_high is not None:
        return f"{_num(t.ref_low)}–{_num(t.ref_high)} {t.unit}"
    if t.ref_high is not None:
        return f"below {_num(t.ref_high)} {t.unit}"
    return f"above {_num(t.ref_low)} {t.unit}"


def _status(t: Trend) -> str:
    if t.status == "high":
        return f"Above the normal range ({_range(t)})."
    if t.status == "low":
        return f"Below the normal range ({_range(t)})."
    if t.status == "normal":
        return "Within the normal range."
    return ""


def template_summary(t: Trend) -> str:
    return " ".join(part for part in (_change(t), _status(t)) if part)


ASCII_NUMBER = re.compile(r"[0-9]+(?:\.[0-9]+)?")
ANY_DIGIT = re.compile(r"\d")   # also matches Kannada and Devanagari digits


def numbers_are_safe(sentence: str, template: str, test_name: str = "") -> bool:
    """The model may choose words, never numbers: every number it writes must be in the template.

    The test's own name is ignored first, because names carry digits (HbA1c, Vitamin B12).
    """
    if test_name:
        sentence = re.sub(re.escape(test_name), " ", sentence, flags=re.IGNORECASE)
    if any(not ch.isascii() for ch in ANY_DIGIT.findall(sentence)):
        return False
    allowed = {float(n) for n in ASCII_NUMBER.findall(template)}
    return all(float(n) in allowed for n in ASCII_NUMBER.findall(sentence))


def summarise(
    trends: list[Trend],
    lang: str,
    phrase: Callable[[dict[str, str], str], dict[str, str]] | None = None,
    reword_english: bool = False,
) -> dict[str, str]:
    """test_key -> sentence.

    The English template is always built first. A model (`phrase`) rewrites it
    for Kannada and Hindi, and for English only when `reword_english` is on.
    Any sentence that fails the number check, and any failure of the model,
    falls back to the English template, so this can never break a response.
    """
    templates = {t.test_key: template_summary(t) for t in trends}
    names = {t.test_key: t.test_name for t in trends}
    if phrase is None or not templates or (lang == "en" and not reword_english):
        return templates
    try:
        # Each fact carries its printed test name, so the model names the test, not our key.
        written = phrase({key: f"{names[key]}: {template}" for key, template in templates.items()}, lang)
    except Exception:
        log.exception("rewording failed; sending English templates")
        return templates

    result = {}
    for key, template in templates.items():
        sentence = written.get(key) if isinstance(written, dict) else None
        ok = isinstance(sentence, str) and sentence.strip() and numbers_are_safe(sentence, template, names[key])
        result[key] = sentence.strip() if ok else template
    return result
