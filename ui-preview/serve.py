#!/usr/bin/env python3
"""Minimal static server that avoids os.getcwd() (blocked in preview sandbox)."""
import functools
import http.server
import os
import socketserver

DIRECTORY = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", "8125"))

Handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=DIRECTORY)
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    httpd.allow_reuse_address = True
    httpd.serve_forever()
