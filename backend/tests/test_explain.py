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


# ---- Rewording and translation by a model, with the number safety check ----

HBA1C_TEMPLATE = "Gone up 2 times in a row (5.6 → 6.1 → 6.4 %). Above the normal range (4–5.6 %)."
GLUCOSE_TEMPLATE = "Gone up since the last report (98 → 109 mg/dL). Above the normal range (70–100 mg/dL)."


def two_trends():
    return [
        trend([5.6, 6.1, 6.4]),
        trend([98, 109], unit="mg/dL", ref_low=70, ref_high=100,
              test_key="fastingbloodglucose", test_name="Fasting Blood Glucose"),
    ]


def test_kannada_uses_the_model_sentences():
    kn = {"hba1c": "HbA1c ಸತತ 2 ಬಾರಿ ಏರಿದೆ (5.6 → 6.1 → 6.4 %).",
          "fastingbloodglucose": "Fasting Blood Glucose ಏರಿದೆ (98 → 109 mg/dL)."}

    assert summarise(two_trends(), "kn", phrase=lambda templates, lang: kn) == kn


def test_the_model_is_given_the_templates_and_the_language():
    calls = []

    def phrase(templates, lang):
        calls.append((templates, lang))
        return templates

    summarise(two_trends(), "hi", phrase=phrase)

    assert calls == [({"hba1c": "HbA1c: " + HBA1C_TEMPLATE,
                       "fastingbloodglucose": "Fasting Blood Glucose: " + GLUCOSE_TEMPLATE}, "hi")]


def test_a_sentence_with_an_invented_number_is_replaced_by_the_template():
    out = summarise(two_trends(), "kn", phrase=lambda t, lang: {
        "hba1c": "HbA1c ಏರಿದೆ, ಈಗ 64 %.",                       # 64 is not in the facts
        "fastingbloodglucose": "Glucose ಏರಿದೆ (98 → 109 mg/dL).",
    })

    assert out == {"hba1c": HBA1C_TEMPLATE, "fastingbloodglucose": "Glucose ಏರಿದೆ (98 → 109 mg/dL)."}


def test_numbers_in_other_scripts_are_not_trusted():
    out = summarise(two_trends(), "hi", phrase=lambda t, lang: {
        "hba1c": "HbA1c लगातार बढ़ा है (५.६ → ६.१ → ६.४ %).",
        "fastingbloodglucose": GLUCOSE_TEMPLATE,
    })

    assert out["hba1c"] == HBA1C_TEMPLATE


def test_the_same_number_written_differently_is_accepted():
    out = summarise(two_trends(), "kn", phrase=lambda t, lang: {
        "hba1c": "HbA1c ಏರಿದೆ; ಸಾಮಾನ್ಯ ಮಿತಿ 4.0–5.6 %.",           # template says "4"
        "fastingbloodglucose": GLUCOSE_TEMPLATE,
    })

    assert out["hba1c"] == "HbA1c ಏರಿದೆ; ಸಾಮಾನ್ಯ ಮಿತಿ 4.0–5.6 %."


def test_missing_or_empty_sentences_fall_back_to_the_template():
    out = summarise(two_trends(), "kn", phrase=lambda t, lang: {"hba1c": "   "})

    assert out == {"hba1c": HBA1C_TEMPLATE, "fastingbloodglucose": GLUCOSE_TEMPLATE}


def test_a_failing_model_falls_back_to_all_templates():
    def broken(templates, lang):
        raise RuntimeError("Bedrock unavailable")

    assert summarise(two_trends(), "kn", phrase=broken) == {
        "hba1c": HBA1C_TEMPLATE, "fastingbloodglucose": GLUCOSE_TEMPLATE,
    }


def test_english_skips_the_model_unless_rewording_is_switched_on():
    calls = []

    def phrase(templates, lang):
        calls.append(lang)
        return {k: "Reworded." for k in templates}

    plain = summarise(two_trends(), "en", phrase=phrase)
    reworded = summarise(two_trends(), "en", phrase=phrase, reword_english=True)

    assert plain["hba1c"] == HBA1C_TEMPLATE
    assert reworded["hba1c"] == "Reworded."
    assert calls == ["en"]


def test_without_a_model_every_language_gets_the_template():
    assert summarise(two_trends(), "kn")["hba1c"] == HBA1C_TEMPLATE


def test_digits_inside_the_test_name_are_not_mistaken_for_numbers():
    b12 = trend([180, 160], unit="pg/mL", ref_low=200, ref_high=900,
                test_key="vitaminb12", test_name="Vitamin B12")

    out = summarise([b12], "kn", phrase=lambda t, lang: {"vitaminb12": "Vitamin B12 ಇಳಿದಿದೆ (180 → 160 pg/mL)."})

    assert out["vitaminb12"] == "Vitamin B12 ಇಳಿದಿದೆ (180 → 160 pg/mL)."
