"""Does the name printed on a report belong to the person it is being saved for?

Someone may use Baseline to help a friend read their report; that report must never be mixed into
the family's records. So before saving, the printed patient name is compared with the selected
person, allowing for how labs print names (titles, capitals, initials, one misread letter).
"""
import unicodedata

from core.people import Person

HONORIFICS = {"mr", "mrs", "ms", "miss", "mx", "dr", "smt", "shri", "sri", "shrimati", "kumari", "kum",
              "master", "baby", "mst", "patient", "name"}


def _tokens(name: str | None) -> list[str]:
    """Words made of letters in any script, keeping Kannada/Hindi vowel signs (marks) inside words."""
    cleaned = "".join(ch if unicodedata.category(ch)[0] in "LM" else " " for ch in (name or "").lower())
    return [w for w in cleaned.split() if w not in HONORIFICS]


def _close(a: str, b: str) -> bool:
    """Equal, or one letter apart (insert, delete or change) when the names are 5+ letters long."""
    if a == b:
        return True
    if min(len(a), len(b)) < 5 or abs(len(a) - len(b)) > 1:
        return False
    if len(a) > len(b):
        a, b = b, a
    i = j = edits = 0
    while i < len(a) and j < len(b):
        if a[i] == b[j]:
            i += 1
            j += 1
            continue
        edits += 1
        if edits > 1:
            return False
        if len(a) == len(b):
            i += 1
        j += 1
    return edits + (len(b) - j) + (len(a) - i) <= 1


def names_match(printed: str | None, person_name: str) -> bool:
    printed_tokens = [t for t in _tokens(printed) if len(t) > 1]
    initials = [t for t in _tokens(printed) if len(t) == 1]
    person_tokens = [t for t in _tokens(person_name) if len(t) > 1]
    if not printed_tokens or not person_tokens:
        return False
    first, *rest = person_tokens
    if not any(_close(first, t) for t in printed_tokens):
        return False
    surname = rest[-1] if rest else None
    printed_others = [t for t in printed_tokens if not _close(first, t)]
    if surname and (printed_others or initials):
        return any(_close(surname, t) for t in printed_others) or surname[0] in initials
    return True


def check_report_name(printed: str | None, person: Person, family: list[Person]) -> dict:
    """same | other_person (a family member) | different (someone else: don't save) | unknown (no name)."""
    detected = (printed or "").strip()
    if not [t for t in _tokens(detected) if len(t) > 1]:
        return {"status": "unknown", "detected_name": detected or None}
    if names_match(detected, person.name):
        return {"status": "same", "detected_name": detected}
    for other in family:
        if other.person_id != person.person_id and names_match(detected, other.name):
            return {"status": "other_person", "detected_name": detected,
                    "person_id": other.person_id, "display_name": other.display_name}
    return {"status": "different", "detected_name": detected}
