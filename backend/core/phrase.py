"""Stage 3, model half: reword the computed facts warmly, in the reader's language.

The model is handed the finished template sentences, never the raw history.
It chooses words only; explain.summarise() checks its numbers afterwards and
falls back to the template for any sentence that fails.
"""
import json

from core.extract import strip_fence

LANGUAGE_NAMES = {"en": "English", "kn": "Kannada", "hi": "Hindi"}

PROMPT = """You rewrite lab-result facts for a family member with no medical training.

You receive JSON: {"language": "...", "facts": {"<test_key>": "<test name>: <one English fact sentence>"}}.
Return ONLY a JSON object mapping each test_key to one sentence, with no other text.
Refer to each test by its test name (the text before the colon), written naturally in the sentence
rather than as a "name:" label. Never write the test_key in a sentence.

Rules for every sentence:
- Write it in the requested language, warm and plain, at most 30 words.
- Use only the facts given. Never add, change, round or convert a number.
- Keep every number and range from the fact in your sentence, so a relative can match it against the printed report.
- Write every number with ordinary digits 0-9, exactly as given.
- Keep test names and units exactly as given, untranslated. Translate every other word, including
  words like "below", "above" and "range".
- Never diagnose, never name a disease, never suggest treatment, medicine or diet.
- If the fact says the value is above or below the normal range, end by saying it is worth
  discussing with a doctor."""


SUMMARY_PROMPT = """You write a short, plain-language summary of one lab report for a family member
with no medical training.

You receive JSON: {"language": "...", "facts": ["...", "..."]}. Return ONLY the summary text.

Rules:
- Write 2 to 4 short sentences, at most 70 words, in the requested language. Warm and simple.
- Use only the facts given. Never add, change, round or convert a number. Write numbers with digits 0-9.
- Keep test names and units exactly as given, untranslated. Translate every other word.
- Never diagnose, never name a disease, never suggest treatment, medicine or diet.
- If anything is outside the normal range, end by saying it is worth discussing with a doctor.
- Plain sentences only: no lists, headings, bold or other markdown."""


def build_request(templates: dict[str, str], lang: str) -> str:
    """The user message, shared by every model provider."""
    return json.dumps({"language": LANGUAGE_NAMES[lang], "facts": templates}, ensure_ascii=False)


def parse_reply(text: str) -> dict[str, str]:
    """test_key -> sentence. Raises ValueError if the reply isn't a JSON object."""
    reply = json.loads(strip_fence(text or ""))
    if not isinstance(reply, dict):
        raise ValueError("model reply was not a JSON object")
    return {k: v for k, v in reply.items() if isinstance(v, str)}


def phrase(templates: dict[str, str], lang: str, model_id: str, client) -> dict[str, str]:
    """`client` is a boto3 bedrock-runtime client."""
    response = client.converse(
        modelId=model_id,
        system=[{"text": PROMPT}],
        messages=[{"role": "user", "content": [{"text": build_request(templates, lang)}]}],
        inferenceConfig={"temperature": 0, "maxTokens": 2000},
    )
    return parse_reply(response["output"]["message"]["content"][0]["text"])


def summary_request(facts: list[str], lang: str) -> str:
    return json.dumps({"language": LANGUAGE_NAMES[lang], "facts": facts}, ensure_ascii=False)


def write_summary(facts: list[str], lang: str, model_id: str, client) -> str:
    """The overall report summary via Bedrock. The caller checks its numbers."""
    response = client.converse(
        modelId=model_id,
        system=[{"text": SUMMARY_PROMPT}],
        messages=[{"role": "user", "content": [{"text": summary_request(facts, lang)}]}],
        inferenceConfig={"temperature": 0, "maxTokens": 600},
    )
    return response["output"]["message"]["content"][0]["text"].strip()
