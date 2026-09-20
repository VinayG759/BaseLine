"""A small in-memory cap on how often one visitor may use an endpoint that needs no login.

Guest report analysis costs money (the model reads the photo) and needs no account,
so one visitor must not be able to run it in a loop. Kept in memory on purpose: it
holds nothing about the person, and it disappears when the server restarts.
"""
from dataclasses import dataclass, field
from datetime import datetime, timedelta


@dataclass
class RateLimit:
    limit: int
    window: timedelta
    _seen: dict[str, list[datetime]] = field(default_factory=dict)

    def allow(self, key: str, now: datetime) -> bool:
        """True if `key` may go ahead now, counting this use against its allowance."""
        self._forget_old(now)
        recent = self._seen.get(key, [])
        if len(recent) >= self.limit:
            return False
        self._seen[key] = recent + [now]
        return True

    def tracked(self) -> int:
        """How many visitors are being remembered. For the tests."""
        return len(self._seen)

    def _forget_old(self, now: datetime) -> None:
        cutoff = now - self.window
        for key in list(self._seen):
            kept = [t for t in self._seen[key] if t > cutoff]
            if kept:
                self._seen[key] = kept
            else:
                del self._seen[key]
