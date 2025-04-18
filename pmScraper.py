from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict
from urllib.parse import urljoin

try:
    import boto3  # Optional – only needed for DynamoDB

    HAS_BOTO3 = True
except ModuleNotFoundError:
    HAS_BOTO3 = False

import nltk
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import Select, WebDriverWait

# ─── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("pm‑scraper")

# ─── Configuration (env‑vars with sane defaults) ───────────────────────────────
BASE_URL: str = os.getenv("BASE_URL", "https://pib.gov.in")
TARGET_URL: str = os.getenv(
    "TARGET_URL", "https://pib.gov.in/PMContents/PMContents.aspx?menuid=1&RegionId=3&reg=3&lang=1"
)
TIMEOUT: int = int(os.getenv("TIMEOUT", "10"))
STORAGE_BACKEND: str = os.getenv("STORAGE_BACKEND", "json").lower()
OUTPUT_PATH: str = os.getenv("OUTPUT_PATH", "press_releases.jsonl")
TABLE_NAME: str = os.getenv("TABLE_NAME", "RawPressReleases")

if STORAGE_BACKEND == "dynamodb" and not HAS_BOTO3:
    logger.error("boto3 is not installed – falling back to JSON output")
    STORAGE_BACKEND = "json"

# ─── Helpers ────────────────────────────────────────────────────────────────────

def summarize_text(text: str, max_sentences: int = 3) -> str:
    """Very lightweight frequency‑based summariser (nltk‑only)."""

    sentences = nltk.tokenize.sent_tokenize(text)
    if len(sentences) <= max_sentences:
        return " ".join(sentences)

    words = nltk.tokenize.word_tokenize(text.lower())
    freq: defaultdict[str, int] = defaultdict(int)
    for w in words:
        if w.isalpha():
            freq[w] += 1

    ranked = sorted(
        ((i, sum(freq.get(w.lower(), 0) for w in nltk.tokenize.word_tokenize(s))) for i, s in enumerate(sentences)),
        key=lambda x: x[1],
        reverse=True,
    )
    top_idxs = sorted(i for i, _ in ranked[:max_sentences])
    return " ".join(sentences[i] for i in top_idxs)


def create_driver() -> webdriver.Chrome:
    """Headless Chrome driver suitable for local & CI runners."""

    opts = Options()
    opts.add_argument("--headless=new")  # new headless mode (Chrome ≥109)
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--window-size=1920,1080")

    driver = webdriver.Chrome(options=opts)
    driver.set_page_load_timeout(TIMEOUT)
    return driver


# ─── Core scraping functions ────────────────────────────────────────────────────

def select_date(driver: webdriver.Chrome, date_obj: datetime):
    logger.info("Selecting %s on PIB site", date_obj.date())
    driver.get(TARGET_URL)
    wait = WebDriverWait(driver, TIMEOUT)

    year_el = wait.until(EC.element_to_be_clickable((By.ID, "ContentPlaceHolder1_ddlYear")))
    Select(year_el).select_by_visible_text(str(date_obj.year))

    month_el = wait.until(EC.element_to_be_clickable((By.ID, "ContentPlaceHolder1_ddlMonth")))
    Select(month_el).select_by_visible_text(date_obj.strftime("%B"))

    day_el = wait.until(EC.element_to_be_clickable((By.ID, "ContentPlaceHolder1_ddlday")))
    Select(day_el).select_by_visible_text(str(date_obj.day))

    # wait for articles list to refresh
    wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "h3+ul li a")))


def extract_full_article(driver: webdriver.Chrome, url: str) -> Dict:
    logger.info("Extracting %s", url)
    driver.get(url)
    wait = WebDriverWait(driver, TIMEOUT)

    iframe = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "iframe[id*=iframepressrealese]")))
    driver.switch_to.frame(iframe)

    wait.until(EC.presence_of_element_located((By.CLASS_NAME, "innner-page-main-about-us-content-right-part")))
    soup = BeautifulSoup(driver.page_source, "html.parser")
    content_div = soup.find("div", class_="innner-page-main-about-us-content-right-part")

    title = content_div.find("h2", id="Titleh2").get_text(strip=True)
    date_raw = content_div.find("div", id="PrDateTime").get_text(strip=True)
    published_date = date_raw.replace("Posted On:", "").strip()

    paragraphs = [p.get_text(strip=True) for p in content_div.find_all("p") if p.get_text(strip=True)]
    content = "\n".join(paragraphs)
    summary = summarize_text(content)

    driver.switch_to.default_content()

    return {
        "id": str(uuid.uuid4()),
        "title": title,
        "url": url,
        "published_date": published_date,
        "content": content,
        "summary": summary,
        "processed": False,
    }


def extract_articles_for_date(driver: webdriver.Chrome) -> List[Dict]:
    """Extract all article records currently visible in the PMO section."""

    soup = BeautifulSoup(driver.page_source, "html.parser")
    section = soup.find("h3", string="Prime Minister's Office")
    if not section:
        logger.warning("PMO section not found – likely no releases for this date")
        return []

    ul = section.find_next_sibling("ul")
    links = [a["href"] for a in ul.find_all("a", href=True)]

    articles: List[Dict] = []
    for rel in links:
        full_url = urljoin(BASE_URL, rel)
        try:
            articles.append(extract_full_article(driver, full_url))
        except Exception:
            logger.exception("Failed to process %s", full_url)
    return articles


# ─── Storage back‑ends ──────────────────────────────────────────────────────────

def save_items(items: List[Dict]):
    if not items:
        logger.info("No items to save – skipping output step")
        return

    if STORAGE_BACKEND == "dynamodb":
        dynamodb = boto3.resource("dynamodb")  # type: ignore[name‑defined]
        table = dynamodb.Table(TABLE_NAME)
        with table.batch_writer() as batch:
            for item in items:
                batch.put_item(Item=item)
        logger.info("Wrote %d items to DynamoDB (%s)", len(items), TABLE_NAME)

    else:  # json lines file – append mode
        path = Path(OUTPUT_PATH)
        with path.open("a", encoding="utf‑8") as f:
            for item in items:
                json.dump(item, f, ensure_ascii=False)
                f.write("\n")
        logger.info("Appended %d items to %s", len(items), path)


# ─── Runner ─────────────────────────────────────────────────────────────────────

def run_scraper(run_date: datetime):
    driver = create_driver()
    try:
        select_date(driver, run_date)
        articles = extract_articles_for_date(driver)
        save_items(articles)
    finally:
        driver.quit()


# ─── CLI entry‑point ────────────────────────────────────────────────────────────

def parse_args(argv: List[str]):
    parser = argparse.ArgumentParser(description="Scrape PMO press releases for a given date")
    parser.add_argument("--date", type=str, default=datetime.now().strftime("%Y-%m-%d"), help="Date in YYYY‑MM‑DD (default: today)")
    parser.add_argument("--output", type=str, help="Override OUTPUT_PATH env var (jsonl file)")
    return parser.parse_args(argv)


def main(argv: List[str] | None = None):
    args = parse_args(argv or sys.argv[1:])
    if args.output:
        global OUTPUT_PATH
        OUTPUT_PATH = args.output

    run_date = datetime.fromisoformat(args.date).replace(tzinfo=timezone.utc)
    logger.info("Running scraper for %s", run_date.date())
    run_scraper(run_date)


if __name__ == "__main__":
    nltk.download("punkt", quiet=True)
    main()