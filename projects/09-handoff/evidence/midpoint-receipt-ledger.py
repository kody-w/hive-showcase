"""Original offline synthetic-receipt utility; see the sealed HANDOFF.md."""

from dataclasses import dataclass
import json
import os
from pathlib import Path
import re
import stat


BYTE_LIMIT = 1_048_576
LINE_LIMIT = 16_384
RECORD_LIMIT = 5_000
RECORD_FIELDS = frozenset(
    ("classification", "event_id", "item_id", "action", "at_minute")
)
IDENTIFIER = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*", re.ASCII)


class LedgerError(ValueError):
    """A selected input does not satisfy the bounded synthetic contract."""


@dataclass(frozen=True)
class Receipt:
    event_id: str
    item_id: str
    action: str
    at_minute: int

    def __post_init__(self):
        for label, value in (("event_id", self.event_id), ("item_id", self.item_id)):
            if (
                not isinstance(value, str)
                or not 1 <= len(value) <= 40
                or IDENTIFIER.fullmatch(value) is None
            ):
                raise LedgerError(f"{label} must be a 1–40 character lowercase ID")
        if self.action not in ("open", "close"):
            raise LedgerError("action must be open or close")
        if type(self.at_minute) is not int or not 0 <= self.at_minute <= 1_000_000:
            raise LedgerError("at_minute must be an integer in [0, 1000000]")

    def record(self):
        return {
            "classification": "SYNTHETIC",
            "event_id": self.event_id,
            "item_id": self.item_id,
            "action": self.action,
            "at_minute": self.at_minute,
        }


def _strict_object(pairs):
    keys = [key for key, _ in pairs]
    if len(keys) != len(set(keys)):
        raise LedgerError("duplicate JSON object key")
    return dict(pairs)


def _reject_constant(value):
    raise LedgerError(f"non-JSON numeric constant: {value}")


def _checked_order(receipts):
    if not isinstance(receipts, (tuple, list)) or len(receipts) > RECORD_LIMIT:
        raise LedgerError("expected a bounded list or tuple of receipts")
    identities = {}
    for receipt in receipts:
        if type(receipt) is not Receipt:
            raise LedgerError("summary input must contain Receipt values")
        previous = identities.get(receipt.event_id)
        if previous is not None and previous != receipt:
            raise LedgerError(f"conflicting event ID: {receipt.event_id}")
        identities[receipt.event_id] = receipt
    return sorted(receipts, key=lambda row: (row.at_minute, row.event_id))


def parse_jsonl(text):
    if not isinstance(text, str):
        raise LedgerError("JSONL input must be text")
    try:
        byte_count = len(text.encode("utf-8"))
    except UnicodeError as exc:
        raise LedgerError("input is not valid UTF-8 text") from exc
    if byte_count > BYTE_LIMIT:
        raise LedgerError("input exceeds 1 MiB")
    receipts = []
    for line_number, line in enumerate(text.split("\n"), 1):
        if len(line.encode("utf-8")) > LINE_LIMIT:
            raise LedgerError(f"line {line_number} exceeds 16 KiB")
        if not line.strip():
            continue
        if len(receipts) == RECORD_LIMIT:
            raise LedgerError("input exceeds 5000 records")
        try:
            record = json.loads(
                line, object_pairs_hook=_strict_object, parse_constant=_reject_constant
            )
        except (ValueError, RecursionError) as exc:
            raise LedgerError(f"line {line_number}: {exc}") from exc
        if type(record) is not dict or frozenset(record) != RECORD_FIELDS:
            raise LedgerError(f"line {line_number}: expected exactly five receipt fields")
        if record["classification"] != "SYNTHETIC":
            raise LedgerError(f"line {line_number}: classification must be SYNTHETIC")
        receipts.append(
            Receipt(
                record["event_id"], record["item_id"], record["action"], record["at_minute"]
            )
        )
    _checked_order(receipts)
    return tuple(receipts)


def read_selected_text(path):
    selected = Path(path)
    if not stat.S_ISREG(selected.lstat().st_mode):
        raise LedgerError("select an ordinary non-symlink file")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
    descriptor = os.open(selected, flags)
    with os.fdopen(descriptor, "rb") as stream:
        if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
            raise LedgerError("selected input changed to a non-regular file")
        payload = stream.read(BYTE_LIMIT + 1)
    if len(payload) > BYTE_LIMIT:
        raise LedgerError("input exceeds 1 MiB")
    try:
        return payload.decode("utf-8")
    except UnicodeError as exc:
        raise LedgerError("selected file must contain UTF-8") from exc


def summarize(receipts):
    ordered = _checked_order(receipts)
    groups = {}
    for receipt in ordered:
        groups.setdefault(receipt.item_id, []).append(receipt)
    rows = []
    for item_id in sorted(groups):
        history = groups[item_id]
        final = history[-1]
        rows.append(
            {
                "item_id": item_id,
                "state": "open" if final.action == "open" else "closed",
                "event_count": len(history),
                "last_minute": final.at_minute,
            }
        )
    open_count = sum(row["state"] == "open" for row in rows)
    return {
        "event_count": len(ordered),
        "open_items": open_count,
        "closed_items": len(rows) - open_count,
        "items": rows,
    }


def maintenance_report(receipts):
    summary = summarize(receipts)
    return {
        "schema": "pocket-arcade-maintenance/1",
        "classification": "SYNTHETIC",
        "scope": "offline-fictional-maintenance",
        "release_authority": False,
        "input_records": len(receipts),
        "replayed_records": len(receipts) - summary["event_count"],
        "open_queue": [
            row["item_id"] for row in summary["items"] if row["state"] == "open"
        ],
        "summary": summary,
    }
