from core.trends import Reading, compute_trend, group_by_test, sort_trends


def reading(value, taken_on, ref_low=4.0, ref_high=5.6, test_key="hba1c", test_name="HbA1c"):
    return Reading(
        test_key=test_key,
        test_name=test_name,
        value=value,
        unit="%",
        ref_low=ref_low,
        ref_high=ref_high,
        taken_on=taken_on,
    )


def test_single_reading_is_first_with_no_streak():
    trend = compute_trend([reading(5.6, "2026-03-04")])

    assert trend.direction == "first"
    assert trend.previous is None
    assert trend.streak == 0


def test_two_rises_in_a_row_give_rising_streak_of_two():
    trend = compute_trend([
        reading(5.6, "2026-03-04"),
        reading(6.1, "2026-08-08"),
        reading(6.4, "2026-09-12"),
    ])

    assert trend.direction == "rising"
    assert trend.streak == 2
    assert trend.current == 6.4
    assert trend.previous == 6.1


def test_readings_given_out_of_order_still_give_history_oldest_first():
    trend = compute_trend([
        reading(6.4, "2026-09-12"),
        reading(5.6, "2026-03-04"),
        reading(6.1, "2026-08-08"),
    ])

    assert trend.history == [
        {"date": "2026-03-04", "value": 5.6},
        {"date": "2026-08-08", "value": 6.1},
        {"date": "2026-09-12", "value": 6.4},
    ]
    assert trend.current == 6.4


def test_a_fall_after_a_rise_breaks_the_streak():
    trend = compute_trend([
        reading(5.6, "2026-03-04"),
        reading(6.1, "2026-08-08"),
        reading(5.9, "2026-09-12"),
    ])

    assert trend.direction == "falling"
    assert trend.streak == 1


def test_unchanged_value_is_stable_with_no_streak():
    trend = compute_trend([
        reading(1.1, "2026-08-08", ref_low=0.7, ref_high=1.3),
        reading(1.1, "2026-09-12", ref_low=0.7, ref_high=1.3),
    ])

    assert trend.direction == "stable"
    assert trend.streak == 0


def test_status_compares_newest_value_with_its_range():
    assert compute_trend([reading(6.4, "2026-09-12")]).status == "high"
    assert compute_trend([reading(3.1, "2026-09-12")]).status == "low"
    assert compute_trend([reading(5.1, "2026-09-12")]).status == "normal"
    assert compute_trend([reading(5.1, "2026-09-12", ref_low=None, ref_high=None)]).status == "unknown"


def test_one_sided_range_only_checks_the_side_it_has():
    trend = compute_trend([reading(212, "2026-09-12", ref_low=None, ref_high=200)])

    assert trend.status == "high"


def test_sorting_puts_out_of_range_ahead_of_alphabetical_order():
    normal_but_first_alphabetically = compute_trend([
        reading(4.2, "2026-09-12", ref_low=3.5, ref_high=5.2,
                test_key="albumin", test_name="Albumin"),
    ])
    high = compute_trend([reading(6.4, "2026-09-12")])

    ordered = sort_trends([normal_but_first_alphabetically, high])

    assert [t.test_key for t in ordered] == ["hba1c", "albumin"]


def test_group_by_test_gives_one_list_per_test():
    hba1c_march = reading(5.6, "2026-03-04")
    glucose = reading(118, "2026-09-12", ref_low=70, ref_high=100,
                      test_key="fastingbloodglucose", test_name="Fasting Blood Glucose")
    hba1c_sept = reading(6.4, "2026-09-12")

    groups = group_by_test([hba1c_march, glucose, hba1c_sept])

    assert sorted(len(g) for g in groups) == [1, 2]
    assert {r.test_key for g in groups for r in g if len(g) == 2} == {"hba1c"}
