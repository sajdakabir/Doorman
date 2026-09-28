#!/usr/bin/env python3
"""Serve the project for the gating harness, with caching turned off.

A plain `python3 -m http.server` lets the browser hold on to stale copies of
index.html and the extension sources, so you end up testing code you already
changed. This sends no-store on everything.

    python3 dev/serve.py      # then open http://127.0.0.1:8731/dev/
"""
import functools
import http.server
import os
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8731
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):  # quieter than the default
        if "GET" in (fmt % args) and " 200 " not in (fmt % args):
            super().log_message(fmt, *args)


class Server(socketserver.TCPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    handler = functools.partial(NoCache, directory=ROOT)
    with Server(("127.0.0.1", PORT), handler) as httpd:
        print(f"harness  →  http://127.0.0.1:{PORT}/dev/")
        print("ctrl-c to stop")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print()
