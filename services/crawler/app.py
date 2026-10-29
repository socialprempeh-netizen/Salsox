"""
The Hunter's crawler, as a small HTTP service: the outreach agent's client
(src/lib/outreach-agent/crawl4ai.ts) POSTs review-page URLs to /crawl and gets
each page back as Markdown, rendered by Crawl4AI in headless Chromium.

Why this wrapper instead of Crawl4AI's own server image: that server's auth
is a JWT flow (POST /token with an email), not a shared secret, and it exposes
far more than the Hunter needs (screenshots, PDFs, arbitrary JS, an MCP
endpoint). This exposes one route, behind one bearer token, and answers in
the shape the client already reads ({"results": [...]}, the same as the
official server's POST /crawl), so the client did not change.

Settings (Fly secrets, see fly.toml and README.md):
  CRAWLER_API_TOKEN  required. The bearer token callers must send. Unset, every
                     /crawl request is refused: the service never runs open.
  MAX_URLS           optional, URLs per request (default 20).
  MAX_CONCURRENT     optional, pages rendered at once (default 3), which is
                     what keeps Chromium inside the machine's memory.

Request bodies are read with Crawl4AI's UNTRUSTED provenance, which rejects
the config types that could run code or touch the filesystem, and the
browser is always headless whatever the body says. The token is compared in
constant time and never logged.
"""

import asyncio
import hmac
import json
import os

from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig
from crawl4ai.async_configs import Provenance
from crawl4ai.async_dispatcher import SemaphoreDispatcher
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse

MAX_URLS = int(os.environ.get("MAX_URLS", "20"))
MAX_CONCURRENT = int(os.environ.get("MAX_CONCURRENT", "3"))
# Seconds between keep-alive bytes while a crawl runs (see crawl()).
KEEPALIVE_SECONDS = 15

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
# One crawl at a time: each opens its own browser (the user agent is set per
# request), and two at once is how a 2 GB machine runs out of memory.
crawl_lock = asyncio.Lock()


def authorized(request: Request) -> bool:
    expected = os.environ.get("CRAWLER_API_TOKEN", "").strip()
    if not expected:
        return False
    header = request.headers.get("authorization", "")
    scheme, _, supplied = header.partition(" ")
    return scheme.lower() == "bearer" and hmac.compare_digest(supplied.strip().encode(), expected.encode())


def page_of(result) -> dict:
    """One CrawlResult as the client reads it (parseCrawlResponse in crawl4ai.ts)."""
    md = result.markdown
    if md is None:
        markdown = ""
    elif isinstance(md, str):
        markdown = md
    else:
        markdown = {"raw_markdown": getattr(md, "raw_markdown", "") or "", "fit_markdown": getattr(md, "fit_markdown", "") or ""}
    return {
        "url": result.url,
        "success": bool(result.success),
        "status_code": result.status_code,
        "error_message": (result.error_message or "")[:500],
        "markdown": markdown,
    }


async def run_crawl(urls: list[str], browser_config: BrowserConfig, run_config: CrawlerRunConfig) -> dict:
    async with crawl_lock:
        async with AsyncWebCrawler(config=browser_config) as crawler:
            results = await crawler.arun_many(urls, config=run_config, dispatcher=SemaphoreDispatcher(semaphore_count=MAX_CONCURRENT))
    return {"success": True, "results": [page_of(r) for r in results]}


@app.get("/health")
async def health():
    # Unauthenticated on purpose: Fly's health check calls it, and it says nothing.
    return {"ok": True}


@app.post("/crawl")
async def crawl(request: Request):
    if not authorized(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    try:
        body = await request.json()
    except ValueError:
        return JSONResponse({"error": "the body is not JSON"}, status_code=400)
    urls = body.get("urls") if isinstance(body, dict) else None
    if not isinstance(urls, list) or not urls or not all(isinstance(u, str) and u.startswith(("http://", "https://")) for u in urls):
        return JSONResponse({"error": "urls must be a non-empty list of http(s) URLs"}, status_code=400)
    if len(urls) > MAX_URLS:
        return JSONResponse({"error": f"at most {MAX_URLS} urls per request"}, status_code=400)
    try:
        browser_config = BrowserConfig.load(body.get("browser_config") or {}, Provenance.UNTRUSTED)
        run_config = CrawlerRunConfig.load(body.get("crawler_config") or {}, Provenance.UNTRUSTED)
    except Exception as error:  # a type or field the untrusted gate refuses
        return JSONResponse({"error": f"config refused: {str(error)[:300]}"}, status_code=400)
    browser_config.headless = True
    run_config.stream = False

    # The answer is streamed: a space every few seconds while the pages render,
    # then the JSON. Fly's proxy closes a connection that sends nothing for a
    # minute, and a run of a dozen review pages can take longer than that.
    # Leading whitespace is valid JSON, so the client's response.json() reads
    # it unchanged. Errors past this point arrive as JSON with success false.
    async def body_stream():
        task = asyncio.create_task(run_crawl(urls, browser_config, run_config))
        while True:
            done, _ = await asyncio.wait({task}, timeout=KEEPALIVE_SECONDS)
            if done:
                break
            yield b" "
        try:
            payload = task.result()
        except Exception as error:
            payload = {"success": False, "error": str(error)[:300], "results": []}
        yield json.dumps(payload).encode()

    return StreamingResponse(body_stream(), media_type="application/json")
