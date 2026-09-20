from datetime import datetime, timedelta, timezone

from core.ratelimit import RateLimit

START = datetime(2026, 9, 20, 10, 0, tzinfo=timezone.utc)


def test_the_first_few_are_allowed():
    limit = RateLimit(limit=3, window=timedelta(hours=1))

    assert [limit.allow("phone", START) for _ in range(3)] == [True, True, True]


def test_one_too_many_is_refused():
    limit = RateLimit(limit=3, window=timedelta(hours=1))
    for _ in range(3):
        limit.allow("phone", START)

    assert limit.allow("phone", START) is False


def test_the_allowance_comes_back_after_the_window():
    limit = RateLimit(limit=2, window=timedelta(hours=1))
    limit.allow("phone", START)
    limit.allow("phone", START)

    assert limit.allow("phone", START + timedelta(minutes=59)) is False
    assert limit.allow("phone", START + timedelta(hours=1, seconds=1)) is True


def test_the_window_rolls_rather_than_resetting_on_the_hour():
    limit = RateLimit(limit=2, window=timedelta(hours=1))
    limit.allow("phone", START)
    limit.allow("phone", START + timedelta(minutes=50))

    # The first one has aged out, the second has not: room for exactly one more.
    assert limit.allow("phone", START + timedelta(minutes=61)) is True
    assert limit.allow("phone", START + timedelta(minutes=61)) is False


def test_one_busy_visitor_does_not_use_up_another_visitor_s_allowance():
    limit = RateLimit(limit=1, window=timedelta(hours=1))
    limit.allow("phone", START)

    assert limit.allow("phone", START) is False
    assert limit.allow("laptop", START) is True


def test_old_visitors_are_forgotten_so_memory_does_not_grow_forever():
    limit = RateLimit(limit=2, window=timedelta(hours=1))
    for n in range(50):
        limit.allow(f"visitor-{n}", START)

    limit.allow("someone-new", START + timedelta(hours=2))

    assert limit.tracked() == 1
