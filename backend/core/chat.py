"""The chatbot: a Strands agent that answers questions about one person's results.

The model never sees the database and never does arithmetic. It can only call
two tools, and both are built per request around one person's readings, so it
cannot reach anyone else's data. Its reply then goes through the same number
check as the summaries: any number that did not come from a tool or from the
question replaces the whole reply with a safe fallback.
"""
import json
import re
from dataclasses import asdict

from strands import Agent, tool

from core.explain import numbers_are_safe, template_summary
from core.extract import normalise
from core.phrase import LANGUAGE_NAMES
from core.trends import Reading, compute_trend, group_by_test, sort_trends

FALLBACK = ("I couldn’t answer that reliably from the reports. "
            "Please look at the result cards, or ask your doctor.")

SYSTEM_PROMPT = """You help a family understand one person's lab results in Baseline.

Rules:
- Before talking about any result, call get_trends or get_history. Answer only from what they return.
- Use numbers exactly as the tools give them. Never calculate, estimate, round or convert a number.
- Write numbers with ordinary digits 0-9. Keep test names and units exactly as the tools give them.
- Never diagnose, never name a disease, never suggest treatment, medicine, supplements or diet.
- If a result is above or below its normal range, say it is worth discussing with a doctor.
- If the reports don't answer the question, say so plainly and suggest asking a doctor.
- Reply in {language}, in at most 80 words, warm and plain.
- Plain sentences only: no lists, headings, bold or other markdown."""


def make_tools(readings: list[Reading], seen: list[str]) -> list:
    """Two tools bound to one person's readings. Every output is appended to `seen`."""

    def record(payload) -> str:
        text = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False)
        seen.append(text)
        return text

    @tool
    def get_trends() -> str:
        """Every test on this person's reports: latest value, direction, streak, status and a summary."""
        trends = sort_trends([compute_trend(group) for group in group_by_test(readings)])
        return record({
            "report_count": len({r.taken_on for r in readings}),
            "report_dates": sorted({r.taken_on for r in readings}),
            "tests": [{**asdict(t), "summary": template_summary(t)} for t in trends],
        })

    @tool
    def get_history(test_name: str) -> str:
        """Every result for one test, oldest first, each with its own unit and normal range.

        Args:
            test_name: The test's name as printed on the report, e.g. "HbA1c".
        """
        key = normalise(test_name)
        results = sorted((r for r in readings if r.test_key == key), key=lambda r: r.taken_on)
        if not results:
            names = sorted({r.test_name for r in readings})
            return record(f"No results for {test_name}. Tests on record: {', '.join(names) or 'none'}.")
        return record({
            "test_name": results[-1].test_name,
            "results": [{"date": r.taken_on, "value": r.value, "unit": r.unit,
                         "ref_low": r.ref_low, "ref_high": r.ref_high} for r in results],
        })

    return [get_trends, get_history]


def answer(question: str, lang: str, readings: list[Reading], model) -> str:
    """One question, one reply. No memory between questions."""
    seen: list[str] = []
    agent = Agent(
        model=model,
        tools=make_tools(readings, seen),
        system_prompt=SYSTEM_PROMPT.format(language=LANGUAGE_NAMES[lang]),
        callback_handler=None,
    )
    reply = str(agent(question)).strip()

    # Test names carry digits (HbA1c), so they're removed before checking, never from the reply.
    checked = reply
    for name in {r.test_name for r in readings}:
        checked = re.sub(re.escape(name), " ", checked, flags=re.IGNORECASE)

    if not reply or not numbers_are_safe(checked, " ".join(seen) + " " + question):
        return FALLBACK
    return reply
