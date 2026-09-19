"""The people whose reports Baseline keeps: yourself and your family.

Each profile has a title, name, gender and age (required) and height and weight (optional).
The age is stored with the date it was entered, so it goes up by itself every year.
Height and weight are updated whenever a new report is saved with them.
"""
import re
import secrets
import unicodedata
from dataclasses import dataclass, replace
from datetime import date

TITLES = ("Mr", "Ms", "Mrs", "Miss", "Dr", "Mx")
GENDERS = ("female", "male", "other")
MAX_NAME_CHARS = 40
NAME_PUNCTUATION = set(" .'-")
AGE_RANGE = (0, 120)
HEIGHT_CM_RANGE = (30, 250)
WEIGHT_KG_RANGE = (1, 350)


class PersonError(ValueError):
    """Raised with a sentence the person filling in the form can act on."""


class SelfProfileExists(PersonError):
    """Only one profile can be "myself"."""


@dataclass(frozen=True)
class Person:
    person_id: str
    title: str        # one of TITLES, or "" for none
    name: str
    is_self: bool
    gender: str = ""                 # one of GENDERS ("" only on profiles made before genders existed)
    age: int | None = None           # the age on age_recorded_on
    age_recorded_on: str = ""        # YYYY-MM-DD
    height_cm: float | None = None
    weight_kg: float | None = None

    @property
    def display_name(self) -> str:
        return f"{self.title} {self.name}" if self.title else self.name

    def current_age(self, today: date) -> int | None:
        """The stored age plus every birthday-anniversary of the recording date since then."""
        if self.age is None or not self.age_recorded_on:
            return self.age
        recorded = date.fromisoformat(self.age_recorded_on)
        years = today.year - recorded.year - ((today.month, today.day) < (recorded.month, recorded.day))
        return self.age + max(0, years)

    def as_dict(self, today: date | None = None) -> dict:
        return {
            "person_id": self.person_id,
            "title": self.title,
            "name": self.name,
            "is_self": self.is_self,
            "display_name": self.display_name,
            "gender": self.gender,
            "age": self.current_age(today or date.today()),
            "height_cm": self.height_cm,
            "weight_kg": self.weight_kg,
        }


def _is_name_char(ch: str) -> bool:
    # Letters (L*) and the vowel signs Kannada and Hindi attach to them (M*).
    return ch in NAME_PUNCTUATION or unicodedata.category(ch)[0] in "LM"


def _slug(name: str) -> str:
    slug = re.sub(r"[^a-z]+", "-", name.lower()).strip("-")[:20].strip("-")
    return slug or "person"


def _check_title(title) -> str:
    title = (title or "").strip()
    if title and title not in TITLES:
        raise PersonError(f"Choose a title from the list ({', '.join(TITLES)}), or none.")
    return title


def _check_name(name) -> str:
    name = " ".join((name or "").split())
    if not name or len(name) > MAX_NAME_CHARS or not all(_is_name_char(c) for c in name):
        raise PersonError(f"Enter a name of up to {MAX_NAME_CHARS} letters.")
    return name


def _check_gender(gender) -> str:
    gender = (gender or "").strip().lower()
    if gender not in GENDERS:
        raise PersonError("Choose a gender: female, male or other.")
    return gender


def _check_age(age) -> int:
    text = str(age).strip() if age is not None else ""
    if not re.fullmatch(r"\d{1,3}", text) or not AGE_RANGE[0] <= int(text) <= AGE_RANGE[1]:
        raise PersonError("Enter the age in whole years, from 0 to 120.")
    return int(text)


def _check_measure(value, allowed: tuple, what: str, unit: str) -> float | None:
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = None
    if number is None or not allowed[0] <= number <= allowed[1]:
        raise PersonError(f"Enter the {what} in {unit}, from {allowed[0]} to {allowed[1]}, or leave it empty.")
    return round(number, 1)


def check_height(value) -> float | None:
    return _check_measure(value, HEIGHT_CM_RANGE, "height", "cm")


def check_weight(value) -> float | None:
    return _check_measure(value, WEIGHT_KG_RANGE, "weight", "kg")


def new_person(title: str, name: str, is_self: bool, existing: list[Person], *, gender, age, today: date,
               height_cm=None, weight_kg=None) -> Person:
    title, name = _check_title(title), _check_name(name)
    gender, age = _check_gender(gender), _check_age(age)
    height_cm, weight_kg = check_height(height_cm), check_weight(weight_kg)
    if is_self and any(p.is_self for p in existing):
        raise SelfProfileExists("A profile for yourself already exists.")
    return Person(f"{_slug(name)}-{secrets.token_hex(2)}", title, name, bool(is_self),
                  gender, age, today.isoformat(), height_cm, weight_kg)


def edit_person(person: Person, changes: dict, *, today: date) -> Person:
    """Apply only the fields present in `changes`. A new age restarts the yearly count from today."""
    updates = {}
    if "title" in changes:
        updates["title"] = _check_title(changes["title"])
    if "name" in changes:
        updates["name"] = _check_name(changes["name"])
    if "gender" in changes:
        updates["gender"] = _check_gender(changes["gender"])
    if "age" in changes:
        updates["age"] = _check_age(changes["age"])
        updates["age_recorded_on"] = today.isoformat()
    if "height_cm" in changes:
        updates["height_cm"] = check_height(changes["height_cm"])
    if "weight_kg" in changes:
        updates["weight_kg"] = check_weight(changes["weight_kg"])
    return replace(person, **updates)


def sort_people(people: list[Person]) -> list[Person]:
    """Yourself first, then everyone else alphabetically."""
    return sorted(people, key=lambda p: (not p.is_self, p.name.lower()))
