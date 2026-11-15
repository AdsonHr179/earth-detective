#!/usr/bin/env python3
"""Polite, bounded metadata scraper for the four NASA sites supplied by the user.

Uses only the Python standard library. It saves page metadata, visible text, and
links to JSON and CSV. It does not download scientific data files.

Example (Windows):
    py -3 outputs/scrape_nasa_sites.py --output-dir outputs

Example (macOS/Linux):
    python3 outputs/scrape_nasa_sites.py --output-dir outputs
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import time
from collections import deque
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urldefrag, urljoin, urlsplit, urlunsplit
from urllib.robotparser import RobotFileParser
from urllib.request import Request, urlopen


USER_AGENT = "NASA-Site-Metadata-Scraper/1.0 (polite public-page crawler)"
MAX_TEXT_CHARS = 100_000
CSV_TEXT_CHARS = 5_000

# The first URL in each group is the URL supplied by the user. Earthdata Search
# is included as an official fallback because the Earthdata homepage may reject
# automated requests. Only these hosts are eligible for crawling.
SITES = [
    {
        "name": "NASA GPM",
        "seeds": ["https://gpm.nasa.gov/data"],
        "hosts": {"gpm.nasa.gov"},
        "path_prefixes": ("/data",),
    },
    {
        "name": "NASA GMAO MERRA-2",
        "seeds": ["https://gmao.gsfc.nasa.gov/gmao-products/merra-2/"],
        "hosts": {"gmao.gsfc.nasa.gov"},
        "path_prefixes": ("/gmao-products/merra-2",),
    },
    {
        "name": "NASA GLDAS / LDAS",
        "seeds": ["https://ldas.gsfc.nasa.gov/gldas"],
        "hosts": {"ldas.gsfc.nasa.gov"},
        "path_prefixes": ("/gldas",),
    },
    {
        "name": "NASA Earthdata",
        "seeds": [
            "https://www.earthdata.nasa.gov/",
            "https://search.earthdata.nasa.gov/",
        ],
        "hosts": {"www.earthdata.nasa.gov", "search.earthdata.nasa.gov"},
        "path_prefixes": ("/",),
    },
]

SKIP_TAGS = {"script", "style", "noscript", "svg", "template"}
SKIP_EXTENSIONS = {
    ".7z", ".bz2", ".csv", ".gz", ".h5", ".hdf", ".hdf5", ".jpg",
    ".jpeg", ".json", ".kmz", ".nc", ".pdf", ".png", ".tif", ".tiff",
    ".zip",
}


class PageParser(HTMLParser):
    """Collect title, description, headings, visible text, and anchor links."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title_parts: list[str] = []
        self.description = ""
        self.headings: list[str] = []
        self.text_parts: list[str] = []
        self.links: list[dict[str, str]] = []
        self._skip_depth = 0
        self._title_depth = 0
        self._heading_tag: str | None = None
        self._heading_parts: list[str] = []
        self._anchor: dict[str, str] | None = None
        self._anchor_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_dict = dict(attrs)
        if tag in SKIP_TAGS:
            self._skip_depth += 1
            return
        if tag == "meta":
            key = (attrs_dict.get("name") or attrs_dict.get("property") or "").lower()
            if key in {"description", "og:description"} and not self.description:
                self.description = (attrs_dict.get("content") or "").strip()
        if self._skip_depth:
            return
        if tag == "title":
            self._title_depth += 1
        if tag in {"h1", "h2", "h3"}:
            self._heading_tag = tag
            self._heading_parts = []
        if tag == "a" and attrs_dict.get("href"):
            self._anchor = {"href": attrs_dict["href"] or ""}
            self._anchor_parts = []

    def handle_endtag(self, tag: str) -> None:
        if tag in SKIP_TAGS:
            self._skip_depth = max(0, self._skip_depth - 1)
            return
        if self._skip_depth:
            return
        if tag == "title" and self._title_depth:
            self._title_depth -= 1
        if tag == self._heading_tag:
            heading = clean_text(" ".join(self._heading_parts))
            if heading:
                self.headings.append(heading)
            self._heading_tag = None
            self._heading_parts = []
        if tag == "a" and self._anchor is not None:
            self._anchor["text"] = clean_text(" ".join(self._anchor_parts))
            self.links.append(self._anchor)
            self._anchor = None
            self._anchor_parts = []

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        value = clean_text(data)
        if not value:
            return
        self.text_parts.append(value)
        if self._title_depth:
            self.title_parts.append(value)
        if self._heading_tag:
            self._heading_parts.append(value)
        if self._anchor is not None:
            self._anchor_parts.append(value)

    def result(self, page_url: str) -> dict:
        unique_links: list[dict[str, str]] = []
        seen: set[tuple[str, str]] = set()
        for item in self.links:
            href = urljoin(page_url, item["href"].strip())
            href, _fragment = urldefrag(href)
            if urlsplit(href).scheme not in {"http", "https"}:
                continue
            key = (href, item.get("text", ""))
            if key not in seen:
                seen.add(key)
                unique_links.append({"url": href, "text": item.get("text", "")})
        text = clean_text(" ".join(self.text_parts))[:MAX_TEXT_CHARS]
        return {
            "title": clean_text(" ".join(self.title_parts)) or None,
            "description": self.description or None,
            "headings": self.headings,
            "text": text,
            "links": unique_links,
        }


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def normalized_url(url: str) -> str:
    """Normalize crawl URLs and drop query/fragment variants."""
    parts = urlsplit(urldefrag(url)[0])
    path = parts.path or "/"
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), path, "", ""))


class RobotsCache:
    def __init__(self, timeout: float) -> None:
        self.timeout = timeout
        self.parsers: dict[str, RobotFileParser | None] = {}

    def can_fetch(self, url: str) -> bool:
        parts = urlsplit(url)
        origin = f"{parts.scheme}://{parts.netloc}"
        if origin not in self.parsers:
            robots_url = f"{origin}/robots.txt"
            parser = RobotFileParser()
            parser.set_url(robots_url)
            request = Request(robots_url, headers={"User-Agent": USER_AGENT})
            try:
                with urlopen(request, timeout=self.timeout) as response:
                    parser.parse(response.read().decode("utf-8", errors="replace").splitlines())
                self.parsers[origin] = parser
            except HTTPError as exc:
                # A missing robots.txt means there are no published restrictions.
                # Other HTTP errors fail closed for this host.
                if exc.code == 404:
                    parser.parse(["User-agent: *", "Allow: /"])
                    self.parsers[origin] = parser
                else:
                    self.parsers[origin] = None
            except (URLError, TimeoutError, OSError):
                self.parsers[origin] = None
        parser = self.parsers[origin]
        return bool(parser and parser.can_fetch(USER_AGENT, url))


def fetch_page(url: str, timeout: float, retries: int) -> dict:
    request = Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
            "Accept-Language": "en-US,en;q=0.8",
        },
    )
    last_error = None
    for attempt in range(retries + 1):
        try:
            with urlopen(request, timeout=timeout) as response:
                status = getattr(response, "status", 200)
                content_type = response.headers.get_content_type()
                charset = response.headers.get_content_charset() or "utf-8"
                raw = response.read()
                result = {
                    "status": status,
                    "content_type": content_type,
                    "final_url": response.geturl(),
                    "error": None,
                }
                if content_type in {"text/html", "application/xhtml+xml"}:
                    parser = PageParser()
                    parser.feed(raw.decode(charset, errors="replace"))
                    result.update(parser.result(response.geturl()))
                return result
        except HTTPError as exc:
            if exc.code in {429, 500, 502, 503, 504} and attempt < retries:
                time.sleep(min(2 ** attempt, 8))
                last_error = f"HTTP {exc.code}: {exc.reason}"
                continue
            return {
                "status": exc.code,
                "content_type": None,
                "final_url": url,
                "error": f"HTTP {exc.code}: {exc.reason}",
            }
        except (URLError, TimeoutError, OSError) as exc:
            last_error = f"{type(exc).__name__}: {exc}"
            if attempt < retries:
                time.sleep(min(2 ** attempt, 8))
                continue
    return {
        "status": None,
        "content_type": None,
        "final_url": url,
        "error": last_error or "Unknown fetch error",
    }


def allowed_path(url: str, prefixes: tuple[str, ...]) -> bool:
    path = urlsplit(url).path or "/"
    return any(path == prefix or path.startswith(prefix.rstrip("/") + "/") for prefix in prefixes)


def is_html_candidate(url: str) -> bool:
    path = urlsplit(url).path.lower()
    return Path(path).suffix not in SKIP_EXTENSIONS


def scrape_site(site: dict, args: argparse.Namespace, robots: RobotsCache) -> list[dict]:
    queue = deque((seed, 0) for seed in site["seeds"])
    visited: set[str] = set()
    pages: list[dict] = []

    while queue and len(pages) < args.max_pages_per_site:
        url, depth = queue.popleft()
        url = normalized_url(url)
        parts = urlsplit(url)
        if parts.hostname not in site["hosts"] or not allowed_path(url, site["path_prefixes"]):
            continue
        if url in visited:
            continue
        visited.add(url)

        record = {
            "site": site["name"],
            "url": url,
            "depth": depth,
            "retrieved_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
        if not args.ignore_robots and not robots.can_fetch(url):
            record.update({
                "status": "robots_disallowed_or_unavailable",
                "content_type": None,
                "final_url": url,
                "error": "Skipped because robots.txt disallows access or could not be read.",
            })
            pages.append(record)
            continue

        if args.delay > 0:
            time.sleep(args.delay)
        fetched = fetch_page(url, args.timeout, args.retries)
        record.update(fetched)
        pages.append(record)

        if depth >= args.max_depth or not fetched.get("links"):
            continue
        for link in fetched["links"]:
            candidate = normalized_url(link["url"])
            candidate_parts = urlsplit(candidate)
            if (
                candidate_parts.hostname in site["hosts"]
                and allowed_path(candidate, site["path_prefixes"])
                and is_html_candidate(candidate)
                and candidate not in visited
            ):
                queue.append((candidate, depth + 1))
    return pages


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", default="outputs", help="Where JSON and CSV files are written (default: outputs)")
    parser.add_argument("--max-pages-per-site", type=int, default=8, help="Maximum pages fetched per site group (default: 8)")
    parser.add_argument("--max-depth", type=int, default=1, help="Link depth from each seed (default: 1)")
    parser.add_argument("--delay", type=float, default=1.0, help="Seconds between page requests (default: 1)")
    parser.add_argument("--timeout", type=float, default=20.0, help="Request timeout in seconds (default: 20)")
    parser.add_argument("--retries", type=int, default=2, help="Retries for transient network errors (default: 2)")
    parser.add_argument("--ignore-robots", action="store_true", help="Do not check robots.txt; use only if you have authorization")
    args = parser.parse_args()

    if args.max_pages_per_site < 1 or args.max_depth < 0 or args.delay < 0:
        parser.error("max-pages-per-site must be >= 1, max-depth and delay must be >= 0")

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    robots = RobotsCache(timeout=args.timeout)
    pages: list[dict] = []

    for site in SITES:
        print(f"Scraping {site['name']}...")
        site_pages = scrape_site(site, args, robots)
        pages.extend(site_pages)
        for item in site_pages:
            print(f"  {item['status']}  {item['url']}")

    snapshot = {
        "metadata": {
            "retrieved_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "user_agent": USER_AGENT,
            "max_pages_per_site": args.max_pages_per_site,
            "max_depth": args.max_depth,
            "robots_respected": not args.ignore_robots,
            "note": "Page metadata and visible text only; linked scientific data files are not downloaded.",
        },
        "pages": pages,
    }
    json_path = output_dir / "nasa_sites_crawl.json"
    csv_path = output_dir / "nasa_sites_crawl.csv"
    json_path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")

    fields = ["site", "url", "status", "title", "description", "headings", "text", "link_count", "error"]
    with csv_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for page in pages:
            writer.writerow({
                "site": page.get("site", ""),
                "url": page.get("url", ""),
                "status": page.get("status", ""),
                "title": page.get("title") or "",
                "description": page.get("description") or "",
                "headings": " | ".join(page.get("headings", [])),
                "text": (page.get("text") or "")[:CSV_TEXT_CHARS],
                "link_count": len(page.get("links", [])),
                "error": page.get("error") or "",
            })

    print(f"\nSaved {len(pages)} page records:")
    print(f"  {json_path.resolve()}")
    print(f"  {csv_path.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
