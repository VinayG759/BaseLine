from core.overall import FACTS_INTRO, overall_summary, report_facts, template_overall, trends_as_of
from core.trends import Reading


def r(key, name, value, day, low, high, unit="u"):
    return Reading(key, name, value, unit, low, high, day)


HISTORY = [
    r("hba1c", "HbA1c", 5.6, "2026-03-04", 4.0, 5.6, "%"),
    r("hba1c", "HbA1c", 6.1, "2026-08-08", 4.0, 5.6, "%"),
    r("hba1c", "HbA1c", 6.4, "2026-09-12", 4.0, 5.6, "%"),
    r("glucose", "Fasting Blood Glucose", 98, "2026-03-04", 70, 100, "mg/dL"),
    r("glucose", "Fasting Blood Glucose", 109, "2026-08-08", 70, 100, "mg/dL"),
    r("glucose", "Fasting Blood Glucose", 118, "2026-09-12", 70, 100, "mg/dL"),
    r("hb", "Haemoglobin", 13.8, "2026-09-12", 13.0, 17.0, "g/dL"),
]
SEPT_KEYS = ["hba1c", "glucose", "hb"]


def test_trends_are_judged_as_of_the_reports_own_date():
    march = trends_as_of(HISTORY, ["hba1c", "glucose"], "2026-03-04")

    assert [(t.test_key, t.current, t.direction) for t in march] == [("glucose", 98, "first"), ("hba1c", 5.6, "first")]


def test_facts_list_counts_out_of_range_tests_and_rising_runs():
    facts = report_facts(trends_as_of(HISTORY, SEPT_KEYS, "2026-09-12"))

    assert facts[0] == "This report has 3 results. 2 are outside the normal range."
    assert "HbA1c: Gone up 2 times in a row (5.6 → 6.1 → 6.4 %). Above the normal range (4–5.6 %)." in facts
    assert not any(f.startswith("Haemoglobin") for f in facts)   # normal and not moving: not a key fact


def test_template_summary_in_plain_words():
    text = template_overall(trends_as_of(HISTORY, SEPT_KEYS, "2026-09-12"))

    assert text == ("This report has 3 results. 2 are outside the normal range: Fasting Blood Glucose and HbA1c. "
                    "Fasting Blood Glucose and HbA1c have gone up 2 times in a row. "
                    "These are worth discussing with a doctor.")


def test_template_when_everything_is_normal():
    normal = [r("hb", "Haemoglobin", 13.8, "2026-09-12", 13.0, 17.0, "g/dL")]

    assert template_overall(trends_as_of(normal, ["hb"], "2026-09-12")) == (
        "This report has 1 result. It is within the normal range.")


def test_the_model_writes_the_summary_from_the_facts():
    seen = []

    def writer(facts, lang):
        seen.append((facts, lang))
        return "HbA1c ಮತ್ತು Fasting Blood Glucose ಏರುತ್ತಲೇ ಇವೆ. ವೈದ್ಯರೊಂದಿಗೆ ಚರ್ಚಿಸಿ."

    trends = trends_as_of(HISTORY, SEPT_KEYS, "2026-09-12")
    text = overall_summary(trends, "kn", writer)

    assert text.startswith("HbA1c ಮತ್ತು")
    assert seen[0][1] == "kn" and seen[0][0][0].startswith(FACTS_INTRO[:10])


def test_a_summary_with_an_invented_number_falls_back_to_the_template():
    trends = trends_as_of(HISTORY, SEPT_KEYS, "2026-09-12")

    assert overall_summary(trends, "kn", lambda f, l: "HbA1c is 7.9 now.") == template_overall(trends)


def test_a_failing_or_empty_model_falls_back_to_the_template():
    trends = trends_as_of(HISTORY, SEPT_KEYS, "2026-09-12")

    def broken(facts, lang):
        raise RuntimeError("down")

    assert overall_summary(trends, "hi", broken) == template_overall(trends)
    assert overall_summary(trends, "hi", lambda f, l: "   ") == template_overall(trends)
    assert overall_summary(trends, "hi", None) == template_overall(trends)
