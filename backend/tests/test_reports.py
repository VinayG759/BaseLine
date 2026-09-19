import pytest

from core.reports import ReportError, check_reviewed


def row(**over):
    base = {"test_name": "HbA1c", "value": "6.4", "unit": "%", "ref_low": "4.0", "ref_high": 5.6}
    return {**base, **over}


def test_reviewed_rows_become_readings_with_normalised_keys():
    [r] = check_reviewed([row(test_name=" Hb A1c ")])

    assert (r.test_key, r.test_name, r.value, r.unit, r.ref_low, r.ref_high) == ("hba1c", "Hb A1c", 6.4, "%", 4.0, 5.6)


def test_empty_limits_mean_no_limit():
    [r] = check_reviewed([row(ref_low="", ref_high=None)])

    assert (r.ref_low, r.ref_high) == (None, None)


@pytest.mark.parametrize("bad", [row(test_name=" "), row(value="pale"), row(value=""), row(value="nan"),
                                 row(ref_low="high"), row(ref_low=9, ref_high=5), row(unit="x" * 21),
                                 row(test_name="x" * 61)])
def test_bad_rows_are_rejected_with_a_sentence(bad):
    with pytest.raises(ReportError):
        check_reviewed([bad])


def test_there_must_be_between_1_and_80_results():
    with pytest.raises(ReportError, match="result"):
        check_reviewed([])
    with pytest.raises(ReportError, match="result"):
        check_reviewed([row(test_name=f"Test {i}") for i in range(81)])


def test_the_same_test_twice_is_rejected():
    with pytest.raises(ReportError, match="twice"):
        check_reviewed([row(), row(test_name="HBA1C")])
