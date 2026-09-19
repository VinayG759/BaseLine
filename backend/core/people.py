"""The people whose reports Baseline keeps: yourself and your family.

There are no accounts: profiles are shared by everyone who opens the app.
"""
import re
import secrets
import unicodedata
from dataclasses import dataclass

TITLES = ("Mr", "Ms", "Mrs", "Miss", "Dr", "Mx")
MAX_NAME_CHARS = 40
NAME_PUNCTUATION = set(" .'-")


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

    @property
    def display_name(self) -> str:
        return f"{self.title} {self.name}" if self.title else self.name

    def as_dict(self) -> dict:
        return {
            "person_id": self.person_id,
            "title": self.title,
            "name": self.name,
            "is_self": self.is_self,
            "display_name": self.display_name,
        }


def _is_name_char(ch: str) -> bool:
    # Letters (L*) and the vowel signs Kannada and Hindi attach to them (M*).
    return ch in NAME_PUNCTUATION or unicodedata.category(ch)[0] in "LM"


def _slug(name: str) -> str:
    slug = re.sub(r"[^a-z]+", "-", name.lower()).strip("-")[:20].strip("-")
    return slug or "person"


def new_person(title: str, name: str, is_self: bool, existing: list[Person]) -> Person:
    title = (title or "").strip()
    name = " ".join((name or "").split())
    if title and title not in TITLES:
        raise PersonError(f"Choose a title from the list ({', '.join(TITLES)}), or none.")
    if not name or len(name) > MAX_NAME_CHARS or not all(_is_name_char(c) for c in name):
        raise PersonError(f"Enter a name of up to {MAX_NAME_CHARS} letters.")
    if is_self and any(p.is_self for p in existing):
        raise SelfProfileExists("A profile for yourself already exists.")
    return Person(f"{_slug(name)}-{secrets.token_hex(2)}", title, name, bool(is_self))


def sort_people(people: list[Person]) -> list[Person]:
    """Yourself first, then everyone else alphabetically."""
    return sorted(people, key=lambda p: (not p.is_self, p.name.lower()))
