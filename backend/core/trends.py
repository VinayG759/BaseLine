"""Stage 2 of the pipeline: plain code decides what the numbers are doing.

The model only reads values off a report. Whether a value is rising, how long
it has been rising, and whether it is out of range is decided here, by code
that gives the same answer every time.
"""
from dataclasses import dataclass
from itertools import groupby


@dataclass(frozen=True)
class Reading:
    """One result from one report."""
    test_key: str            # normalised name, e.g. "hba1c"
    test_name: str           # as printed, e.g. "HbA1c"
    value: float
    unit: str
    ref_low: float | None
    ref_high: float | None
    taken_on: str            # YYYY-MM-DD


@dataclass(frozen=True)
class Trend:
    """The verdict for one test. Field names match the contract's trend object."""
    test_key: str
    test_name: str
    unit: str
    current: float
    previous: float | None
    direction: str           # first | rising | falling | stable
    streak: int
    status: str              # normal | high | low | unknown
    ref_low: float | None
    ref_high: float | None
    history: list[dict]      # [{"date", "value"}], oldest first


def _move(before: float, after: float) -> str:
    if after > before:
        return "rising"
    if after < before:
        return "falling"
    return "stable"


def range_status(value: float, ref_low: float | None, ref_high: float | None) -> str:
    """normal | high | low | unknown. A one-sided range only checks the side it has."""
    if ref_low is None and ref_high is None:
        return "unknown"
    if ref_low is not None and value < ref_low:
        return "low"
    if ref_high is not None and value > ref_high:
        return "high"
    return "normal"


def compute_trend(readings: list[Reading]) -> Trend:
    """Every reading for one test, in any order, becomes one Trend."""
    ordered = sorted(readings, key=lambda r: r.taken_on)
    values = [r.value for r in ordered]
    newest = ordered[-1]

    moves = [_move(a, b) for a, b in zip(values, values[1:])]
    direction = moves[-1] if moves else "first"

    streak = 0
    if direction in ("rising", "falling"):
        for move in reversed(moves):
            if move != direction:
                break
            streak += 1

    return Trend(
        test_key=newest.test_key,
        test_name=newest.test_name,
        unit=newest.unit,
        current=newest.value,
        previous=values[-2] if len(values) > 1 else None,
        direction=direction,
        streak=streak,
        status=range_status(newest.value, newest.ref_low, newest.ref_high),
        ref_low=newest.ref_low,
        ref_high=newest.ref_high,
        history=[{"date": r.taken_on, "value": r.value} for r in ordered],
    )


def group_by_test(readings: list[Reading]) -> list[list[Reading]]:
    """Split a mixed pile of readings into one list per test_key."""
    by_key = sorted(readings, key=lambda r: r.test_key)
    return [list(group) for _, group in groupby(by_key, key=lambda r: r.test_key)]


def sort_trends(trends: list[Trend]) -> list[Trend]:
    """Out of range first, then the longest streak, then alphabetical by name."""
    return sorted(
        trends,
        key=lambda t: (t.status not in ("high", "low"), -t.streak, t.test_name.lower()),
    )
