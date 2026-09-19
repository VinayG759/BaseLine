import pytest

from core.names import check_report_name, names_match
from core.people import Person

SUNITA = Person("sunita-rao-4f2a", "Mrs", "Sunita Rao", False)
RAMESH = Person("ramesh-rao-9c3d", "Mr", "Ramesh Rao", False)
VINAY = Person("vinay-g-1a2b", "Mr", "Vinay G", True)
FAMILY = [SUNITA, RAMESH, VINAY]


@pytest.mark.parametrize("printed", [
    "Mrs Sunita Rao", "SUNITA RAO", "Smt. Sunita Rao", "Sunitha Rao", "Sunita R.", "Sunita", "Mrs. Sunita  Rao (54 F)",
])
def test_the_same_person_written_differently_matches(printed):
    assert names_match(printed, "Sunita Rao")


@pytest.mark.parametrize("printed", ["Anita Rao", "Sunita Sharma", "Ramesh Rao", "Priya", "Sunita K"])
def test_a_different_person_does_not_match(printed):
    assert not names_match(printed, "Sunita Rao")


def test_short_names_must_match_exactly():
    assert names_match("Anu", "Anu Rao")
    assert not names_match("Ann", "Anu Rao")


def test_names_in_kannada_script_match_themselves():
    assert names_match("ಸುನೀತಾ ರಾವ್", "ಸುನೀತಾ ರಾವ್")


def test_the_selected_persons_report_is_same():
    assert check_report_name("Mrs Sunita Rao", SUNITA, FAMILY) == {"status": "same", "detected_name": "Mrs Sunita Rao"}


def test_a_family_members_report_points_to_them():
    assert check_report_name("Mr. Ramesh Rao", SUNITA, FAMILY) == {
        "status": "other_person", "detected_name": "Mr. Ramesh Rao",
        "person_id": "ramesh-rao-9c3d", "display_name": "Mr Ramesh Rao",
    }


def test_someone_outside_the_family_is_different():
    assert check_report_name("Priya Nair", SUNITA, FAMILY) == {"status": "different", "detected_name": "Priya Nair"}


@pytest.mark.parametrize("printed", [None, "", "   ", "Patient", "Mr."])
def test_no_readable_name_is_unknown(printed):
    assert check_report_name(printed, SUNITA, FAMILY)["status"] == "unknown"
