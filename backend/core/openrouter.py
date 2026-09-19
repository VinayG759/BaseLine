"""The model slots on OpenRouter (Gemini) instead of Bedrock.

OpenRouter speaks the OpenAI chat format, so the official `openai` client
works with it. The instructions, reply checks and safety checks are the same
ones the Bedrock versions use; only the transport differs.
"""
import base64

from core.extract import PROMPT as READ_PROMPT
from core.extract import Extracted, parse
from core.phrase import PROMPT as PHRASE_PROMPT
from core.phrase import build_request, parse_reply

BASE_URL = "https://openrouter.ai/api/v1"
MIME_TYPES = {"jpeg": "image/jpeg", "png": "image/png"}


def make_client(api_key: str):
    from openai import OpenAI

    return OpenAI(api_key=api_key, base_url=BASE_URL)


def _complete(client, model: str, messages: list[dict]) -> str:
    response = client.chat.completions.create(model=model, messages=messages, temperature=0, max_tokens=2000)
    return response.choices[0].message.content or ""


def read_report(image: bytes, image_format: str, model: str, client) -> Extracted:
    """Same job as extract.extract(): photo in, checked readings out."""
    data_url = f"data:{MIME_TYPES[image_format]};base64,{base64.b64encode(image).decode()}"
    text = _complete(client, model, [{
        "role": "user",
        "content": [
            {"type": "image_url", "image_url": {"url": data_url}},
            {"type": "text", "text": READ_PROMPT},
        ],
    }])
    return parse(text)


def phrase(templates: dict[str, str], lang: str, model: str, client) -> dict[str, str]:
    """Same job as phrase.phrase(): reword the facts in the reader's language."""
    return parse_reply(_complete(client, model, [
        {"role": "system", "content": PHRASE_PROMPT},
        {"role": "user", "content": build_request(templates, lang)},
    ]))


def chat_model(api_key: str, model: str):
    """A Strands model that talks to OpenRouter, for the chatbot agent."""
    from strands.models.openai import OpenAIModel

    return OpenAIModel(client_args={"api_key": api_key, "base_url": BASE_URL},
                       model_id=model, params={"temperature": 0})
