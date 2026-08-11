import json
from pathlib import Path
from typing import Any


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    documents = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            text = line.strip()
            if not text:
                continue
            try:
                document = json.loads(text)
            except json.JSONDecodeError as exc:
                raise ValueError(f"Invalid JSONL at {path}:{line_number}") from exc
            for required in ("id", "title", "content"):
                if not document.get(required):
                    raise ValueError(f"Missing {required} at {path}:{line_number}")
            document.setdefault("metadata", {})
            documents.append(document)
    return documents
