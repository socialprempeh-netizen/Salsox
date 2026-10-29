# The Hunter's crawler (services/crawler/app.py): Crawl4AI with headless
# Chromium behind a single token-protected POST /crawl, deployed to Fly.io
# (fly.toml). Built on Fly's remote builder by `fly deploy`; nothing here
# needs Docker on the machine that deploys it.
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    # Browsers in a shared path, so the unprivileged user below can run them.
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    HOME=/home/crawler

RUN useradd --create-home --home-dir /home/crawler crawler

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt \
    # crawl4ai-setup installs Chromium with its system libraries (apt, so as
    # root) and creates Crawl4AI's home directory and cache database.
    && crawl4ai-setup \
    && chown -R crawler:crawler /ms-playwright /home/crawler

COPY app.py .

USER crawler
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-keep-alive", "75"]
