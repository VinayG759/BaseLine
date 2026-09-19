"""Accounts and sessions: email + password login.

Passwords are never stored: only a salted PBKDF2-SHA256 hash. Session tokens
are random; only their SHA-256 hash is stored, so a copy of the database can't
be used to log in as anyone.
"""
import base64
import hashlib
import hmac
import re
import secrets
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

DEFAULT_ITERATIONS = 600_000   # OWASP's recommendation for PBKDF2-SHA256
ITERATIONS = DEFAULT_ITERATIONS
SESSION_DAYS = 7
MIN_PASSWORD, MAX_PASSWORD = 8, 128
EMAIL = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")
MIN_USERNAME, MAX_USERNAME = 2, 30
USERNAME_PUNCTUATION = set(" ._-")


class AuthError(ValueError):
    """Raised with a sentence the person on the login page can act on."""


class EmailTaken(AuthError):
    pass


class BadCredentials(AuthError):
    pass


@dataclass(frozen=True)
class Account:
    email: str
    password_hash: str
    username: str = ""   # shown in the app; accounts made before usernames existed have none


@dataclass(frozen=True)
class Session:
    token_hash: str
    email: str
    expires_at: str   # ISO 8601, UTC


def normalise_email(email: str) -> str:
    return (email or "").strip().lower()


def _b64(raw: bytes) -> str:
    return base64.b64encode(raw).decode()


def check_username(username: str) -> str:
    """Letters in any script (with Kannada/Hindi vowel signs), digits, spaces and . _ -; returns it tidied."""
    username = " ".join((username or "").split())
    ok_chars = all(c in USERNAME_PUNCTUATION or unicodedata.category(c)[0] in "LMN" for c in username)
    if not MIN_USERNAME <= len(username) <= MAX_USERNAME or not ok_chars:
        raise AuthError(f"Choose a username of {MIN_USERNAME} to {MAX_USERNAME} letters or digits.")
    return username


def display_username(account: Account) -> str:
    return account.username or account.email.split("@")[0]


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS)
    return f"pbkdf2_sha256${ITERATIONS}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iterations, salt, digest = stored.split("$")
        expected = base64.b64decode(digest)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), base64.b64decode(salt), int(iterations))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)   # constant time: no timing hints


def check_new_account(email: str, password: str, existing) -> None:
    """`existing` is the account already registered under this email, or None."""
    if len(email) > 254 or not EMAIL.fullmatch(email):
        raise AuthError("Enter a valid email address.")
    if not MIN_PASSWORD <= len(password or "") <= MAX_PASSWORD:
        raise AuthError(f"Use a password of {MIN_PASSWORD} to {MAX_PASSWORD} characters.")
    if existing is not None:
        raise EmailTaken("An account with this email already exists. Log in instead.")


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_session(email: str, now: datetime) -> tuple[str, Session]:
    """The token goes to the browser once; only its hash is kept."""
    token = secrets.token_urlsafe(32)
    expires = (now + timedelta(days=SESSION_DAYS)).isoformat()
    return token, Session(hash_token(token), email, expires)


def session_is_valid(session: Session | None, now: datetime) -> bool:
    return session is not None and datetime.fromisoformat(session.expires_at) > now


def utc_now() -> datetime:
    return datetime.now(timezone.utc)
