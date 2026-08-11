import hashlib
import json
import re
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Callable
from urllib.parse import parse_qs, quote_plus, unquote, urlparse
from urllib.request import Request, urlopen


class _SearchParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.results: list[dict[str, str]] = []
        self._current: dict[str, str] | None = None
        self._snippet_target: dict[str, str] | None = None
        self._capture = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]):
        values = dict(attrs)
        classes = (values.get("class") or "").split()
        if tag == "a" and ({"result__a", "result-link"} & set(classes)):
            self._current = {"url": values.get("href") or "", "title": ""}
            self._capture = "title"
        elif ({"result__snippet", "result-snippet"} & set(classes)) and self.results:
            self._snippet_target = self.results[-1]
            self._capture = "snippet"

    def handle_data(self, data: str):
        if self._current and self._capture == "title":
            self._current[self._capture] = (self._current.get(self._capture, "") + " " + data).strip()
        elif self._snippet_target and self._capture == "snippet":
            self._snippet_target["snippet"] = (self._snippet_target.get("snippet", "") + " " + data).strip()

    def handle_endtag(self, tag: str):
        if tag == "a" and self._current and self._capture == "title":
            self.results.append(self._current)
            self._current = None
            self._capture = ""
        elif self._capture == "snippet" and tag in {"a", "div", "td"}:
            self._snippet_target = None
            self._capture = ""


class _PageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = ""
        self.parts: list[str] = []
        self._in_title = False
        self._skip = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]):
        if tag == "title":
            self._in_title = True
        if tag in {"script", "style", "noscript", "svg"}:
            self._skip += 1

    def handle_endtag(self, tag: str):
        if tag == "title":
            self._in_title = False
        if tag in {"script", "style", "noscript", "svg"} and self._skip:
            self._skip -= 1

    def handle_data(self, data: str):
        if self._in_title:
            self.title += " " + data
        elif not self._skip:
            text = re.sub(r"\s+", " ", data).strip()
            if text:
                self.parts.append(text)


def _clean(value: str, limit: int) -> str:
    value = re.sub(r"\s+", " ", value or "").strip()
    return value[:limit]


def _safe_content(value: str, limit: int = 2400) -> str:
    value = _clean(value, limit)
    blocked = [
        r"ignore.{0,80}(previous|system).{0,40}instructions?",
        r"reveal.{0,40}system.{0,20}prompt",
        r"you are (chatgpt|an ai assistant)",
        r"忽略.{0,60}(指令|提示词)",
        r"泄露.{0,40}(系统提示|提示词)",
    ]
    for pattern in blocked:
        value = re.sub(pattern, "[已移除网页中的指令文本]", value, flags=re.IGNORECASE)
    return value


class WebSearchAgent:
    """Small, dependency-free web search adapter with disk cache and provenance."""

    def __init__(
        self,
        cache_dir: Path,
        enabled: bool = True,
        timeout: float = 6.0,
        max_results: int = 5,
        fetch: Callable[[str, float], str] | None = None,
    ):
        self.cache_dir = cache_dir
        self.enabled = enabled
        self.timeout = timeout
        self.max_results = max_results
        self.fetch = fetch or self._fetch
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def search(self, queries: list[str]) -> dict[str, Any]:
        if not self.enabled:
            return {"used": False, "reason": "disabled", "sources": [], "documents": []}
        unique_queries = list(dict.fromkeys(_clean(query, 240) for query in queries if _clean(query, 240)))[:4]
        sources: list[dict[str, str]] = []
        seen_urls: set[str] = set()
        for query in unique_queries:
            for hit in self._search_results(query):
                url = self._normalise_url(hit.get("url", ""))
                if not self._allowed_url(url) or url in seen_urls:
                    continue
                seen_urls.add(url)
                page = self._load_page(url)
                content = page.get("content") or hit.get("snippet") or ""
                if len(content) < 80:
                    continue
                source = {
                    "url": url,
                    "title": _clean(page.get("title") or hit.get("title") or url, 180),
                    "query": query,
                }
                sources.append(source)
                if len(sources) >= self.max_results:
                    break
            if len(sources) >= self.max_results:
                break
        documents = [self._document(source, self._load_page(source["url"])) for source in sources]
        documents = [doc for doc in documents if doc]
        return {"used": bool(documents), "queries": unique_queries, "sources": sources, "documents": documents}

    def _search_results(self, query: str) -> list[dict[str, str]]:
        key = hashlib.sha256(("search:" + query).encode("utf-8")).hexdigest()
        cached = self._read_cache(key)
        if cached:
            return cached
        try:
            html = self.fetch("https://lite.duckduckgo.com/lite/?q=" + quote_plus(query), self.timeout)
            parser = _SearchParser()
            parser.feed(html)
            results = parser.results[: self.max_results * 2]
            self._write_cache(key, results)
            return results
        except Exception:
            return []

    def _load_page(self, url: str) -> dict[str, str]:
        key = hashlib.sha256(("page:" + url).encode("utf-8")).hexdigest()
        cached = self._read_cache(key)
        if cached:
            return cached
        try:
            html = self.fetch(url, self.timeout)
            parser = _PageParser()
            parser.feed(html)
            result = {"title": _clean(parser.title, 180), "content": _safe_content(" ".join(parser.parts))}
            self._write_cache(key, result)
            return result
        except Exception:
            return {}

    def _document(self, source: dict[str, str], page: dict[str, str]) -> dict[str, Any] | None:
        content = _safe_content(page.get("content") or "")
        if not content:
            return None
        digest = hashlib.sha256(source["url"].encode("utf-8")).hexdigest()[:20]
        return {
            "id": "web_" + digest,
            "title": source["title"],
            "content": content,
            "metadata": {
                "type": "web_reference",
                "source": "duckduckgo",
                "url": source["url"],
                "query": source["query"],
                "retrieved_at": datetime.now(timezone.utc).isoformat(),
                "trust": "unverified_web",
            },
        }

    def _read_cache(self, key: str) -> Any:
        path = self.cache_dir / (key + ".json")
        try:
            if time.time() - path.stat().st_mtime > 86400:
                return None
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None

    def _write_cache(self, key: str, value: Any) -> None:
        try:
            (self.cache_dir / (key + ".json")).write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
        except OSError:
            pass

    @staticmethod
    def _fetch(url: str, timeout: float) -> str:
        request = Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; AI-Game-Engine/1.0)"})
        with urlopen(request, timeout=timeout) as response:
            return response.read(1_000_000).decode("utf-8", errors="ignore")

    @staticmethod
    def _allowed_url(url: str) -> bool:
        parsed = urlparse(url)
        return parsed.scheme in {"http", "https"} and bool(parsed.netloc)

    @staticmethod
    def _normalise_url(url: str) -> str:
        if url.startswith("//"):
            url = "https:" + url
        elif url.startswith("/"):
            url = "https://duckduckgo.com" + url
        parsed = urlparse(url)
        if parsed.netloc.endswith("duckduckgo.com"):
            target = parse_qs(parsed.query).get("uddg", [""])[0]
            if target:
                return unquote(target)
        return url
