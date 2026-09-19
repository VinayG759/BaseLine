"""Stage 3 of the pipeline: turn a computed Trend into one plain sentence.

Tonight this is a fixed template, so it is instant and always says the same
thing. Tomorrow a model may reword or translate it, and this template stays
as the fallback.
"""
from core.trends import Trend


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


def summarise(trends: list[Trend], lang: str) -> dict[str, str]:
    """test_key -> sentence. `lang` is accepted now and used once translation lands."""
    return {t.test_key: template_summary(t) for t in trends}
