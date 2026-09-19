import json

from strands.models import Model

from core.chat import FALLBACK, answer, make_tools
from core.trends import Reading

READINGS = [
    Reading("hba1c", "HbA1c", 5.6, "%", 4.0, 5.6, "2026-03-04"),
    Reading("hba1c", "HbA1c", 6.1, "%", 4.0, 5.6, "2026-08-08"),
    Reading("hba1c", "HbA1c", 6.4, "%", 4.0, 5.6, "2026-09-12"),
    Reading("haemoglobin", "Haemoglobin", 13.8, "g/dL", 13.0, 17.0, "2026-09-12"),
]


class ScriptedModel(Model):
    """Stands in for Bedrock: plays back a fixed script and records what Strands sends it."""

    def __init__(self, *turns):
        self.turns = list(turns)
        self.calls = []

    def update_config(self, **config):
        pass

    def get_config(self):
        return {}

    async def structured_output(self, *args, **kwargs):
        raise NotImplementedError
        yield

    async def stream(self, messages, tool_specs=None, system_prompt=None, **kwargs):
        self.calls.append({"messages": json.loads(json.dumps(messages, default=str)),
                           "tools": [t["name"] for t in tool_specs or []],
                           "system": system_prompt})
        turn = self.turns.pop(0)
        yield {"messageStart": {"role": "assistant"}}
        if "tool" in turn:
            yield {"contentBlockStart": {"start": {"toolUse": {"toolUseId": "t1", "name": turn["tool"]}}}}
            yield {"contentBlockDelta": {"delta": {"toolUse": {"input": json.dumps(turn.get("input", {}))}}}}
            yield {"contentBlockStop": {}}
            yield {"messageStop": {"stopReason": "tool_use"}}
        else:
            yield {"contentBlockDelta": {"delta": {"text": turn["text"]}}}
            yield {"contentBlockStop": {}}
            yield {"messageStop": {"stopReason": "end_turn"}}


def tool_results(model_call):
    return [block["toolResult"] for m in model_call["messages"] for block in m["content"] if "toolResult" in block]


# ---- The tools, called directly ----

def test_trends_tool_summarises_every_test_for_this_person_only():
    trends = json.loads(make_tools(READINGS, [])[0]())

    assert {t["test_name"] for t in trends["tests"]} == {"HbA1c", "Haemoglobin"}
    hba1c = next(t for t in trends["tests"] if t["test_key"] == "hba1c")
    assert (hba1c["direction"], hba1c["streak"], hba1c["status"]) == ("rising", 2, "high")
    assert trends["report_count"] == 3


def test_history_tool_finds_a_test_by_any_spelling():
    history = json.loads(make_tools(READINGS, [])[1]("HBA1C"))

    assert [h["value"] for h in history["results"]] == [5.6, 6.1, 6.4]


def test_history_tool_says_so_when_a_test_is_unknown():
    assert "No results" in make_tools(READINGS, [])[1]("Vitamin D")


def test_every_tool_output_is_recorded_for_the_number_check():
    seen = []
    tools = make_tools(READINGS, seen)
    tools[0]()
    tools[1]("hba1c")

    assert len(seen) == 2


# ---- The agent loop, end to end through Strands ----

def test_agent_calls_our_tool_and_answers_from_its_result():
    model = ScriptedModel(
        {"tool": "get_trends"},
        {"text": "HbA1c has gone up 2 times in a row, to 6.4 %. It's worth discussing with your doctor."},
    )

    reply = answer("Is anything getting worse?", "en", READINGS, model)

    assert reply == "HbA1c has gone up 2 times in a row, to 6.4 %. It's worth discussing with your doctor."
    assert model.calls[0]["tools"] == ["get_trends", "get_history"]
    assert "never diagnose" in model.calls[0]["system"].lower()
    [result] = tool_results(model.calls[1])
    assert result["status"] == "success"
    assert "hba1c" in result["content"][0]["text"]


def test_reply_language_is_part_of_the_instructions():
    model = ScriptedModel({"text": "ನಮಸ್ಕಾರ"})

    answer("Hello", "kn", READINGS, model)

    assert "Kannada" in model.calls[0]["system"]


def test_a_reply_with_an_invented_number_is_replaced():
    model = ScriptedModel({"tool": "get_trends"}, {"text": "HbA1c is now 7.2 %, which is high."})

    assert answer("How is HbA1c?", "en", READINGS, model) == FALLBACK


def test_a_number_from_the_question_may_be_repeated():
    model = ScriptedModel({"tool": "get_trends"}, {"text": "I only have reports from 2026, not from 2019."})

    assert answer("What was it in 2019?", "en", READINGS, model) == "I only have reports from 2026, not from 2019."


def test_a_reply_with_numbers_but_no_tool_use_is_replaced():
    model = ScriptedModel({"text": "Your HbA1c is 6.4 %."})

    assert answer("How is HbA1c?", "en", READINGS, model) == FALLBACK
