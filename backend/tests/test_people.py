import re
from datetime import date

import pytest

from core.people import (GENDERS, TITLES, Person, PersonError, SelfProfileExists, edit_person, new_person,
                         sort_people)

TODAY = date(2026, 9, 19)


def person(title="Mrs", name="Sunita Rao", is_self=False, existing=(), gender="female", age=54, **extra):
    return new_person(title, name, is_self, list(existing), gender=gender, age=age, today=TODAY, **extra)


def test_display_name_joins_title_and_name():
    assert Person("x", "Mrs", "Sunita Rao", False).display_name == "Mrs Sunita Rao"
    assert Person("x", "", "Sunita Rao", False).display_name == "Sunita Rao"


def test_new_person_gets_a_readable_unique_id():
    a = person()
    b = person(existing=[a])

    assert re.fullmatch(r"sunita-rao-[0-9a-f]{4}", a.person_id)
    assert a.person_id != b.person_id


def test_name_in_any_script_is_accepted_and_tidied():
    p = person(title="", name="  ಸುನೀತಾ   ರಾವ್ ")

    assert p.name == "ಸುನೀತಾ ರಾವ್"
    assert re.fullmatch(r"person-[0-9a-f]{4}", p.person_id)


def test_ids_always_fit_the_contract_pattern():
    assert re.fullmatch(r"[a-z0-9-]{1,32}", person(name="Venkatanarasimharajuvaripeta Srinivas").person_id)


def test_names_with_dots_apostrophes_and_hyphens_are_fine():
    assert person(title="Mr", name="K. D'Souza-Rao", gender="male").name == "K. D'Souza-Rao"


@pytest.mark.parametrize("name", ["", "   ", "x" * 41, "Sunita <b>", "R2D2"])
def test_bad_names_are_rejected_with_a_sentence(name):
    with pytest.raises(PersonError, match="name"):
        person(name=name)


def test_unknown_title_is_rejected():
    with pytest.raises(PersonError, match="title"):
        person(title="Sir")


def test_titles_and_genders_offered():
    assert TITLES == ("Mr", "Ms", "Mrs", "Miss", "Dr", "Mx")
    assert GENDERS == ("female", "male", "other")


def test_only_one_profile_can_be_yourself():
    me = person(title="Mr", name="Vinay G", is_self=True, gender="male", age=22)

    with pytest.raises(SelfProfileExists, match="yourself"):
        person(name="Someone Else", is_self=True, existing=[me])


def test_yourself_comes_first_then_alphabetical():
    people = [
        Person("c", "Mrs", "Sunita Rao", False),
        Person("a", "Mr", "Vinay G", True),
        Person("b", "Mr", "Anil Rao", False),
    ]

    assert [p.person_id for p in sort_people(people)] == ["a", "b", "c"]


# ---- Gender, age, height, weight ----

@pytest.mark.parametrize("gender", ["", "f", "unknown"])
def test_gender_is_required_from_the_list(gender):
    with pytest.raises(PersonError, match="gender"):
        person(gender=gender)


@pytest.mark.parametrize("age", [None, "", -1, 121, "fifty", 54.5])
def test_age_must_be_a_whole_number_from_0_to_120(age):
    with pytest.raises(PersonError, match="age"):
        person(age=age)


def test_age_given_as_text_digits_is_fine():
    assert person(age="54").age == 54


def test_height_and_weight_are_optional():
    p = person()

    assert p.height_cm is None and p.weight_kg is None


def test_height_and_weight_are_kept_when_given():
    p = person(height_cm="158", weight_kg=61.5)

    assert (p.height_cm, p.weight_kg) == (158.0, 61.5)


@pytest.mark.parametrize("extra, field", [({"height_cm": 20}, "height"), ({"height_cm": 300}, "height"),
                                           ({"weight_kg": 0}, "weight"), ({"weight_kg": 400}, "weight"),
                                           ({"weight_kg": "heavy"}, "weight")])
def test_out_of_range_height_or_weight_is_rejected(extra, field):
    with pytest.raises(PersonError, match=field):
        person(**extra)


def test_age_goes_up_by_itself_each_year():
    p = person(age=54)   # entered on 19 Sep 2026

    assert p.current_age(date(2027, 9, 18)) == 54
    assert p.current_age(date(2027, 9, 19)) == 55
    assert p.current_age(date(2031, 1, 1)) == 58


def test_a_birthday_on_29_february_still_counts_up():
    p = new_person("Mr", "Leap Year", False, [], gender="male", age=30, today=date(2024, 2, 29))

    assert p.current_age(date(2025, 2, 28)) == 30
    assert p.current_age(date(2025, 3, 1)) == 31


def test_as_dict_is_what_the_api_returns():
    p = person(height_cm=158)

    assert p.as_dict(date(2027, 10, 1)) == {
        "person_id": p.person_id,
        "title": "Mrs",
        "name": "Sunita Rao",
        "is_self": False,
        "display_name": "Mrs Sunita Rao",
        "gender": "female",
        "age": 55,
        "height_cm": 158.0,
        "weight_kg": None,
    }


def test_profiles_from_before_these_fields_still_work():
    old = Person("x", "Mrs", "Sunita Rao", False)

    assert old.as_dict(TODAY)["age"] is None


# ---- Editing ----

def test_editing_changes_only_what_was_sent_and_restarts_the_age_clock():
    p = person(age=54, height_cm=158)

    edited = edit_person(p, {"name": "Sunita R. Rao", "age": 55}, today=date(2027, 3, 1))

    assert edited.person_id == p.person_id and edited.is_self == p.is_self
    assert edited.name == "Sunita R. Rao" and edited.height_cm == 158.0
    assert edited.current_age(date(2028, 3, 1)) == 56


def test_editing_can_clear_height_and_weight():
    p = person(height_cm=158, weight_kg=61)

    assert edit_person(p, {"height_cm": None, "weight_kg": None}, today=TODAY).height_cm is None


def test_editing_checks_the_same_rules():
    with pytest.raises(PersonError, match="age"):
        edit_person(person(), {"age": 500}, today=TODAY)
