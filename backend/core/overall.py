"""The written summary of a whole report, in simple words.

Code decides the facts (how many results, which are out of range, which keep rising, judged as of the
report's own date). A model may turn those facts into a few plain sentences in the reader's language;
the number safety check guards it, and a template written from the same facts is the fallback.
"""
import logging
import re
from typing import Callable

from core.explain import numbers_are_safe, template_summary
from core.trends import Reading, Trend, compute_trend, group_by_test, sort_trends

log = logging.getLogger("baseline")

FACTS_INTRO = "This report has"
MAX_SUMMARY_CHARS = 700


def trends_as_of(readings: list[Reading], test_keys: list[str], report_date: str) -> list[Trend]:
    """Trends for the tests on one report, using only readings up to that report's date."""
    wanted = set(test_keys)
    upto = [r for r in readings if r.test_key in wanted and r.taken_on <= report_date]
    return sort_trends([compute_trend(g) for g in group_by_test(upto)])


def _out_of_range(trends: list[Trend]) -> list[Trend]:
    return [t for t in trends if t.status in ("high", "low")]


def _runs(trends: list[Trend]) -> list[Trend]:
    return [t for t in trends if t.streak >= 2]


def _join(names: list[str]) -> str:
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]


def report_facts(trends: list[Trend]) -> list[str]:
    """What the model may say: the counts, plus the per-test sentence for anything out of range or rising."""
    out = _out_of_range(trends)
    counts = f"{FACTS_INTRO} {len(trends)} result{'s' if len(trends) != 1 else ''}. "
    counts += f"{len(out)} {'is' if len(out) == 1 else 'are'} outside the normal range." if out \
        else "All are within the normal range."
    key_tests = [t for t in trends if t in out or t.streak >= 2]
    return [counts] + [f"{t.test_name}: {template_summary(t)}" for t in key_tests]


def template_overall(trends: list[Trend]) -> str:
    """The same facts as a short English paragraph, used whenever the model can't be."""
    n = len(trends)
    out = sorted(t.test_name for t in _out_of_range(trends))
    parts = [f"This report has {n} result{'s' if n != 1 else ''}."]
    if out:
        verb = "is" if len(out) == 1 else "are"
        parts.append(f"{len(out)} {verb} outside the normal range: {_join(out)}.")
    else:
        parts.append("It is within the normal range." if n == 1 else "All are within the normal range.")
    runs = _runs(trends)
    by_direction = {}
    for t in runs:
        by_direction.setdefault((t.direction, t.streak), []).append(t.test_name)
    for (direction, streak), names in sorted(by_direction.items()):
        verb = "have" if len(names) > 1 else "has"
        moved = "gone up" if direction == "rising" else "gone down"
        parts.append(f"{_join(sorted(names))} {verb} {moved} {streak} times in a row.")
    if out:
        parts.append("These are worth discussing with a doctor." if len(out) > 1
                     else "This is worth discussing with a doctor.")
    return " ".join(parts)


def overall_summary(trends: list[Trend], lang: str, writer: Callable[[list[str], str], str] | None) -> str:
    fallback = template_overall(trends)
    if writer is None or not trends:
        return fallback
    facts = report_facts(trends)
    try:
        text = (writer(facts, lang) or "").strip()
    except Exception:
        log.exception("report summary failed; sending the template")
        return fallback
    checked = text
    for name in {t.test_name for t in trends}:
        checked = re.sub(re.escape(name), " ", checked, flags=re.IGNORECASE)
    if not text or len(text) > MAX_SUMMARY_CHARS or not numbers_are_safe(checked, " ".join(facts)):
        return fallback
    return text
