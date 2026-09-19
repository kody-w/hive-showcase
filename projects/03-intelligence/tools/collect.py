#!/usr/bin/env python3
"""Optional read-only public collection. Never executed by offline checks or the app."""

import argparse
import concurrent.futures
import hashlib
import json
import re
import urllib.error
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
MAX_BYTES = 4_000_000


def digest(data):
    return hashlib.sha256(data).hexdigest()


class PageText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skip = 0
        self.parts = []
        self.title_parts = []
        self.in_title = False
        self.metadata = {}
        self.links = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ("script", "style", "svg"):
            self.skip += 1
        if tag == "title":
            self.in_title = True
        if tag == "meta":
            name = attrs.get("name", attrs.get("property", ""))
            if any(key in name.lower() for key in ("date", "time", "author", "title")):
                self.metadata.setdefault(name, []).append(attrs.get("content", ""))
        if tag == "a" and "href" in attrs:
            self.links.append(attrs["href"])

    def handle_endtag(self, tag):
        if tag in ("script", "style", "svg"):
            self.skip = max(0, self.skip - 1)
        if tag == "title":
            self.in_title = False

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)
            if self.in_title:
                self.title_parts.append(data)

    @property
    def text(self):
        return re.sub(r"\s+", " ", " ".join(self.parts)).strip()


def capture(source, preview=False):
    destination = PROJECT / "evidence" / "fetches" / (source["id"] + ".json")
    if destination.exists():
        return source["id"], "already captured; preserved (remove deliberately to re-collect)"
    record = {
        "schema": "bounded-http-evidence/1",
        "sourceId": source["id"],
        "requestedUrl": source["url"],
        "retrievedAt": datetime.now(timezone.utc).isoformat(),
        "method": "GET; Python urllib; no cookies, authentication or script execution",
        "storagePolicy": "Only short exact excerpts and metadata are retained. Body/text hashes cover the full fetched response; hashes do not archive the full copyrighted page.",
        "excerpts": [],
    }
    try:
        request = urllib.request.Request(
            source["url"], headers={"User-Agent": "LocalEvidenceReview/1.0", "Accept-Encoding": "identity"}
        )
        with urllib.request.urlopen(request, timeout=45) as response:
            body = response.read(MAX_BYTES + 1)
            if len(body) > MAX_BYTES:
                raise ValueError("Response exceeds the 4 MB safety bound")
            record.update({
                "status": response.status,
                "finalUrl": response.url,
                "contentType": response.headers.get("Content-Type", ""),
                "responseBytes": len(body),
                "responseSha256": digest(body),
                "lastModified": response.headers.get("Last-Modified"),
                "etag": response.headers.get("ETag"),
            })
            html = body.decode(response.headers.get_content_charset() or "utf-8", errors="replace")
        parser = PageText()
        parser.feed(html)
        text = parser.text
        record.update({
            "pageTitle": " ".join(parser.title_parts).strip(),
            "dateAndAuthorMetadata": parser.metadata,
            "normalizedTextSha256": digest(text.encode()),
            "normalizedTextCharacters": len(text),
        })
        previews = []
        for number, anchor in enumerate(source["anchors"], 1):
            offset = text.casefold().find(anchor.casefold())
            if offset < 0:
                record["excerpts"].append({"id": f"e{number}", "anchor": anchor, "found": False})
                continue
            start, end = max(0, offset - 75), min(len(text), offset + 155)
            excerpt = text[start:end]
            record["excerpts"].append({
                "id": f"e{number}",
                "anchor": anchor,
                "found": True,
                "startCharacter": start,
                "endCharacter": end,
                "text": excerpt,
                "sha256": digest(excerpt.encode()),
            })
            if preview:
                previews.append(text[max(0, offset - 220):min(len(text), offset + 800)])
        if sum(len(item.get("text", "").split()) for item in record["excerpts"]) > 220:
            raise ValueError("Excerpt word budget exceeded")
        record["outcome"] = "captured"
        message = json.dumps({
            "status": record["status"], "title": record["pageTitle"],
            "metadata": parser.metadata,
            "anchors": [(item["anchor"], item["found"]) for item in record["excerpts"]],
            "pdfLinks": [link for link in parser.links if ".pdf" in link][:5],
            "inspectionWindows": previews,
        }, ensure_ascii=False, indent=2)
    except (OSError, ValueError, urllib.error.URLError) as error:
        record["outcome"] = "failed"
        record["error"] = str(error)
        message = "FAILED: " + str(error)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
    return source["id"], message


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--id", action="append", help="Collect only these source IDs")
    parser.add_argument("--preview", action="store_true", help="Print bounded inspection windows")
    args = parser.parse_args()
    sources = json.loads((PROJECT / "research" / "collection-plan.json").read_text())["sources"]
    if args.id:
        unknown = set(args.id) - {source["id"] for source in sources}
        if unknown:
            parser.error("Unknown source IDs: " + ", ".join(sorted(unknown)))
        sources = [source for source in sources if source["id"] in args.id]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda source: capture(source, args.preview), sources))
    for source_id, result in results:
        print(f"\n--- {source_id} ---\n{result}")
    return int(any(message.startswith("FAILED:") for _, message in results))


if __name__ == "__main__":
    raise SystemExit(main())
