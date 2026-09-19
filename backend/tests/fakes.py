"""Stand-ins shared by several test files."""
from types import SimpleNamespace

REPLY = {"report_date": "2026-09-12", "lab_name": "Sri Sai Diagnostics",
         "readings": [{"test_name": "HbA1c", "value": 6.4, "unit": "%", "ref_low": 4.0, "ref_high": 5.6}]}


class FakeClient:
    """Stands in for the OpenAI-compatible client: records the request, returns a fixed reply."""

    def __init__(self, reply):
        self.reply = reply
        self.requests = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        self.requests.append(kwargs)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=self.reply))])
