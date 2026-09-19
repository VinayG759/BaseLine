import re

import pytest

from core.people import TITLES, Person, PersonError, new_person, sort_people


def test_display_name_joins_title_and_name():
    assert Person("x", "Mrs", "Sunita Rao", False).display_name == "Mrs Sunita Rao"
    assert Person("x", "", "Sunita Rao", False).display_name == "Sunita Rao"


def test_new_person_gets_a_readable_unique_id():
    a = new_person("Mrs", "Sunita Rao", False, [])
    b = new_person("Mrs", "Sunita Rao", False, [a])

    assert re.fullmatch(r"sunita-rao-[0-9a-f]{4}", a.person_id)
    assert a.person_id != b.person_id


def test_name_in_any_script_is_accepted_and_tidied():
    p = new_person("", "  ಸುನೀತಾ   ರಾವ್ ", False, [])

    assert p.name == "ಸುನೀತಾ ರಾವ್"
    assert re.fullmatch(r"person-[0-9a-f]{4}", p.person_id)


def test_ids_always_fit_the_contract_pattern():
    p = new_person("Dr", "Venkatanarasimharajuvaripeta Srinivas", False, [])

    assert re.fullmatch(r"[a-z0-9-]{1,32}", p.person_id)


def test_names_with_dots_apostrophes_and_hyphens_are_fine():
    assert new_person("Mr", "K. D'Souza-Rao", False, []).name == "K. D'Souza-Rao"


@pytest.mark.parametrize("name", ["", "   ", "x" * 41, "Sunita <b>", "R2D2"])
def test_bad_names_are_rejected_with_a_sentence(name):
    with pytest.raises(PersonError, match="name"):
        new_person("Ms", name, False, [])


def test_unknown_title_is_rejected():
    with pytest.raises(PersonError, match="title"):
        new_person("Sir", "Sunita Rao", False, [])


def test_titles_offered():
    assert TITLES == ("Mr", "Ms", "Mrs", "Miss", "Dr", "Mx")


def test_only_one_profile_can_be_yourself():
    me = new_person("Mr", "Vinay G", True, [])

    with pytest.raises(PersonError, match="yourself"):
        new_person("Ms", "Someone Else", True, [me])


def test_yourself_comes_first_then_alphabetical():
    people = [
        Person("c", "Mrs", "Sunita Rao", False),
        Person("a", "Mr", "Vinay G", True),
        Person("b", "Mr", "Anil Rao", False),
    ]

    assert [p.person_id for p in sort_people(people)] == ["a", "b", "c"]


def test_as_dict_is_what_the_api_returns():
    assert Person("sunita-rao-4f2a", "Mrs", "Sunita Rao", False).as_dict() == {
        "person_id": "sunita-rao-4f2a",
        "title": "Mrs",
        "name": "Sunita Rao",
        "is_self": False,
        "display_name": "Mrs Sunita Rao",
    }
