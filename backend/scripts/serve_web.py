"""Serve the web/ folder for local testing, telling browsers never to keep a copy.

Python's plain `http.server` sends no cache headers, so a phone may quietly reuse
yesterday's script for hours: the page then looks broken (or half-translated) although
the file on disk is correct. Every answer here says "no-store", so each reload is fresh.

    python scripts/serve_web.py <web folder> [port]
"""
import sys
from functools import partial
from http.server import HTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, *args):
        pass   # the backend's log is the interesting one


def main() -> None:
    directory = sys.argv[1]
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 5500
    handler = partial(NoCacheHandler, directory=directory)
    HTTPServer(("0.0.0.0", port), handler).serve_forever()


if __name__ == "__main__":
    main()
