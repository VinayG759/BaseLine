from datetime import datetime, timedelta, timezone

import pytest

from core import auth
from core.auth import (Account, AuthError, BadCredentials, EmailTaken, Session, check_new_account, check_username,
                       display_username, hash_password, hash_token, new_session, normalise_email, session_is_valid,
                       verify_password)


def test_default_password_hashing_is_strong():
    assert auth.DEFAULT_ITERATIONS >= 600_000


def test_a_password_is_never_stored_as_itself():
    stored = hash_password("correct horse battery")

    assert "correct horse battery" not in stored
    assert stored.startswith("pbkdf2_sha256$")


def test_the_right_password_verifies_and_a_wrong_one_does_not():
    stored = hash_password("correct horse battery")

    assert verify_password("correct horse battery", stored)
    assert not verify_password("correct horse batterY", stored)


def test_the_same_password_hashes_differently_each_time():
    assert hash_password("same password") != hash_password("same password")


def test_emails_are_compared_case_insensitively():
    assert normalise_email("  Vinay@Example.COM ") == "vinay@example.com"


@pytest.mark.parametrize("email", ["", "vinay", "vinay@", "@example.com", "vi nay@example.com", "a@b"])
def test_invalid_emails_are_rejected(email):
    with pytest.raises(AuthError, match="email"):
        check_new_account(email, "long enough password", existing=None)


@pytest.mark.parametrize("password", ["", "short", "x" * 7, "x" * 129])
def test_passwords_must_be_8_to_128_characters(password):
    with pytest.raises(AuthError, match="8"):
        check_new_account("vinay@example.com", password, existing=None)


def test_an_email_can_only_register_once():
    with pytest.raises(EmailTaken):
        check_new_account("vinay@example.com", "long enough password", existing=object())


def test_bad_credentials_is_an_auth_error():
    assert issubclass(BadCredentials, AuthError)


def test_a_new_session_stores_only_the_hash_of_its_token():
    token, session = new_session("vinay@example.com", now=datetime(2026, 9, 19, tzinfo=timezone.utc))

    assert session.token_hash == hash_token(token)
    assert token not in session.token_hash
    assert len(token) >= 40
    assert session.expires_at == "2026-09-26T00:00:00+00:00"


def test_sessions_expire_after_7_days():
    start = datetime(2026, 9, 19, tzinfo=timezone.utc)
    _, session = new_session("vinay@example.com", now=start)

    assert session_is_valid(session, now=start + timedelta(days=6, hours=23))
    assert not session_is_valid(session, now=start + timedelta(days=7, seconds=1))
    assert not session_is_valid(None, now=start)


@pytest.mark.parametrize("username", ["Vinay", "Vinay G", "vinay_g.759", "ವಿನಯ್", "Dr-K"])
def test_usernames_in_any_script_are_accepted_and_tidied(username):
    assert check_username("  " + username + "  ") == username


@pytest.mark.parametrize("username", ["", " ", "V", "x" * 31, "<b>Vinay</b>", "vinay@example.com"])
def test_bad_usernames_are_rejected_with_a_sentence(username):
    with pytest.raises(AuthError, match="username"):
        check_username(username)


def test_display_username_falls_back_to_the_start_of_the_email():
    assert display_username(Account("vinay@example.com", "h", "Vinay G")) == "Vinay G"
    assert display_username(Account("vinay@example.com", "h")) == "vinay"
