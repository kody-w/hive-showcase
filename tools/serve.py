"""Serve only the original showcase artifacts on the loopback interface."""

import argparse
import functools
import http.server
import re
import sys
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ALLOWED_ROOTS = {"assets", "projects", "evidence"}
ALLOWED_FILES = {"index.html", "README.md", "THIRD_PARTY_NOTICES.md"}


def normalize_base_path(value):
    value = value.strip("/")
    if not value:
        return ""
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*(?:/[A-Za-z0-9][A-Za-z0-9_-]*)*", value):
        raise ValueError("Base path must contain only URL-safe project slugs")
    return "/" + value


def public_file(root, request_path, base_path=""):
    decoded = urllib.parse.unquote(urllib.parse.urlsplit(request_path).path)
    base_path = normalize_base_path(base_path)
    if base_path:
        if decoded != base_path and not decoded.startswith(base_path + "/"):
            raise FileNotFoundError("Request is outside the configured project prefix")
        decoded = decoded[len(base_path):]
    if "\0" in decoded or "\\" in decoded:
        raise ValueError("Invalid request path")
    parts = decoded.lstrip("/").split("/")
    if any(part in (".", "..") or part.startswith(".") for part in parts if part):
        raise ValueError("Private or noncanonical request path")
    relative = "/".join(parts)
    if not relative:
        relative = "index.html"
    if relative not in ALLOWED_FILES and relative.split("/", 1)[0] not in ALLOWED_ROOTS:
        raise FileNotFoundError("Not a public showcase artifact")
    candidate = root / relative
    if candidate.is_dir():
        candidate = candidate / "index.html"
    resolved = candidate.resolve()
    if root.resolve() not in resolved.parents:
        raise ValueError("Request escapes the showcase")
    for ancestor in (candidate, *candidate.parents):
        if ancestor == root:
            break
        if ancestor.is_symlink():
            raise ValueError("Symbolic links are not served")
    if not resolved.is_file():
        raise FileNotFoundError("Artifact not found")
    return resolved


class ShowcaseHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".mjs": "text/javascript",
        ".js": "text/javascript",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".stl": "model/stl",
        ".scad": "text/plain",
        ".md": "text/plain; charset=utf-8",
        ".py": "text/plain; charset=utf-8",
    }

    def __init__(self, *args, root=ROOT, base_path="", **kwargs):
        self.root = Path(root).resolve()
        self.base_path = normalize_base_path(base_path)
        super().__init__(*args, directory=str(self.root), **kwargs)

    def send_head(self):
        request = urllib.parse.urlsplit(self.path)
        if self.base_path and request.path == self.base_path:
            self.send_response(301)
            self.send_header("Location", self.base_path + "/" + ("?" + request.query if request.query else ""))
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None
        try:
            path = public_file(self.root, self.path, self.base_path)
        except ValueError as error:
            self.send_error(400, str(error))
            return None
        except FileNotFoundError:
            self.send_error(404, "Local artifact not found")
            return None
        handle = path.open("rb")
        self.send_response(200)
        self.send_header("Content-type", self.guess_type(str(path)))
        self.send_header("Content-Length", str(path.stat().st_size))
        self.end_headers()
        return handle

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
            "connect-src 'self'; frame-src 'self'; media-src 'self' blob:; "
            "object-src 'none'; base-uri 'self'; form-action 'none'",
        )
        super().end_headers()

    def log_message(self, format_string, *args):
        sys.stderr.write("%s %s\n" % (self.log_date_time_string(), format_string % args))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=0, help="Loopback port; 0 selects a free port.")
    parser.add_argument("--base-path", default="", help="Optional project prefix, such as /hive-showcase.")
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error("--port must be between 0 and 65535")
    try:
        base_path = normalize_base_path(args.base_path)
    except ValueError as error:
        parser.error(str(error))
    handler = functools.partial(ShowcaseHandler, root=ROOT, base_path=base_path)
    with http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
        print("Hive Showcase: http://127.0.0.1:%d%s/" % (server.server_port, base_path), flush=True)
        print("Local artifacts only. Press Ctrl-C to stop.", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nPreview stopped.", flush=True)


if __name__ == "__main__":
    main()
