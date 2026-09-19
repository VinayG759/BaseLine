"""Check the AI slots with the configured provider (Bedrock or OpenRouter). Saves nothing.

Usage (from backend/, with MODEL_PROVIDER and its settings set):
    python scripts/smoke_model.py path/to/report.jpg

1. Reads the report photo and prints every value it found.
2. Translates the resulting summaries into Kannada through the number safety check.
3. Asks the chatbot one question about those readings.
"""
import sys
import time
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))   # so `core` imports from backend/

from core.explain import summarise, template_summary
from core.services import _provider, aws_services
from core.trends import compute_trend, group_by_test, sort_trends

FORMATS = {".jpg": "jpeg", ".jpeg": "jpeg", ".png": "png"}


def timed(label, fn):
    start = time.perf_counter()
    try:
        return fn()
    finally:
        print(f"   ({label}: {time.perf_counter() - start:.1f} s)")


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python scripts/smoke_model.py <image.jpg|image.png>")
        return 2
    path = Path(sys.argv[1])
    services = aws_services()
    print(f"Provider: {_provider()}")

    print("\n1. Reading the report")
    extracted = timed("read", lambda: services.read_report(path.read_bytes(), FORMATS[path.suffix.lower()]))
    print(f"   date {extracted.report_date}, lab {extracted.lab_name}")
    for r in extracted.readings:
        print(f"   {r.test_name:24} {r.value:>8} {r.unit:6} range {r.ref_low} - {r.ref_high}")

    readings = [replace(r, taken_on=extracted.report_date or "2026-01-01") for r in extracted.readings]
    trends = sort_trends([compute_trend(g) for g in group_by_test(readings)])

    print("\n2. Kannada summaries (numbers checked; a fallback means the model's sentence was rejected)")
    kannada = timed("translate", lambda: summarise(trends, "kn", services.phrase))
    for t in trends:
        fell_back = kannada[t.test_key] == template_summary(t)
        print(f"   {'FALLBACK' if fell_back else 'ok      '} {t.test_name}: {kannada[t.test_key]}")

    print("\n3. Chatbot")
    reply = timed("chat", lambda: services.chat("Which results are outside the normal range?", "en", readings))
    print(f"   {reply}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
