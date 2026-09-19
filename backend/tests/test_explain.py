from core.explain import summarise, template_summary
from core.trends import Reading, compute_trend


def trend(values, unit="%", ref_low=4.0, ref_high=5.6, test_key="hba1c", test_name="HbA1c"):
    dates = ["2026-03-04", "2026-08-08", "2026-09-12"][-len(values):]
    return compute_trend([
        Reading(test_key, test_name, v, unit, ref_low, ref_high, d) for v, d in zip(values, dates)
    ])


def test_first_reading_says_so():
    assert template_summary(trend([5.1])) == "First result on record. Within the normal range."


def test_streak_of_two_lists_the_whole_run_and_the_range():
    assert template_summary(trend([5.6, 6.1, 6.4])) == (
        "Gone up 2 times in a row (5.6 → 6.1 → 6.4 %). Above the normal range (4–5.6 %)."
    )


def test_single_rise_shows_previous_and_current():
    assert template_summary(trend([5.6, 6.1])) == (
        "Gone up since the last report (5.6 → 6.1 %). Above the normal range (4–5.6 %)."
    )


def test_single_fall_within_range():
    t = trend([13.9, 13.6], unit="g/dL", ref_low=13.0, ref_high=17.0,
              test_key="haemoglobin", test_name="Haemoglobin")

    assert template_summary(t) == (
        "Gone down since the last report (13.9 → 13.6 g/dL). Within the normal range."
    )


def test_unchanged_with_no_range_says_nothing_about_range():
    t = trend([1.1, 1.1], unit="mg/dL", ref_low=None, ref_high=None)

    assert template_summary(t) == "Unchanged since the last report."


def test_one_sided_high_limit_is_described_as_below():
    t = trend([224, 215, 212], unit="mg/dL", ref_low=None, ref_high=200,
              test_key="totalcholesterol", test_name="Total Cholesterol")

    assert template_summary(t) == (
        "Gone down 2 times in a row (224 → 215 → 212 mg/dL). Above the normal range (below 200 mg/dL)."
    )


def test_summarise_maps_each_test_key_to_its_sentence():
    hba1c = trend([5.6, 6.1, 6.4])
    glucose = trend([98, 109], unit="mg/dL", ref_low=70, ref_high=100,
                    test_key="fastingbloodglucose", test_name="Fasting Blood Glucose")

    assert summarise([hba1c, glucose], "kn") == {
        "hba1c": template_summary(hba1c),
        "fastingbloodglucose": "Gone up since the last report (98 → 109 mg/dL). Above the normal range (70–100 mg/dL).",
    }


def test_only_the_latest_run_is_shown_not_the_whole_history():
    t = trend([13.9, 13.6, 13.8], unit="g/dL", ref_low=13.0, ref_high=17.0,
              test_key="haemoglobin", test_name="Haemoglobin")

    assert template_summary(t) == (
        "Gone up since the last report (13.6 → 13.8 g/dL). Within the normal range."
    )
