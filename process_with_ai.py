#!/usr/bin/env python3
import json
import re
import requests
import boto3
from datetime import datetime
import argparse
import uuid
from collections import defaultdict

# OpenRouter API endpoint and model
ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "gpt-4o-mini"


def extract_daily_locations_and_actions(articles, api_key):
    """
    Use OpenRouter API to extract structured data from daily press releases.
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/your-repo",  # OpenRouter requires Referer
        "X-Title": "PM Modi Travel Tracker"
    }

    # Combine articles into one prompt block
    combined = "\n\n---\n\n".join(
        f"Article {i+1} ({art.get('published_date','')}):\n{art.get('content','')}"
        for i, art in enumerate(articles)
    )

    prompt = f"""
Analyze these press releases about PM Modi's activities for the day and extract:
1. His current location (city, country) with latitude and longitude
2. Key actions/activities in bullet points (chronologically ordered)

Return ONLY a JSON object with this exact structure:
{{
  "date": "YYYY-MM-DD",
  "locations": [
    {{
      "name": "City, Country",
      "lat": float,
      "lng": float,
      "time": "HH:MM",
      "actions": [
        "Action 1",
        "Action 2"
      ]
    }}
  ]
}}

Today's Press Releases:
{combined[:15000]}
"""

    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": "You are an expert analyst extracting structured data from text."},
            {"role": "user", "content": prompt}
        ],
        "response_format": {"type": "json_object"},  # enforce JSON output
        "temperature": 0.1,
        "max_tokens": 2000
    }

    # Send the request
    resp = requests.post(ENDPOINT, headers=headers, json=payload, timeout=45)

    # Debug output
    print(f"⚙️  HTTP {resp.status_code} {resp.reason}")
    print("⏺️  Body preview:", resp.text[:500])
    resp.raise_for_status()

    # Extract and clean JSON
    raw = resp.json()["choices"][0]["message"]["content"]
    cleaned = re.sub(r"```(?:json)?\s*|\s*```$", "", raw.strip())
    result = json.loads(cleaned)

    if not isinstance(result.get("locations"), list):
        raise ValueError("Invalid 'locations' format in AI response")

    return result


def consolidate_locations(locations):
    """
    Combine multiple location entries into consolidated records by name/lat/lng,
    merging and ordering actions chronologically.
    """
    grouped = defaultdict(list)
    for loc in locations:
        key = (loc.get("name"), loc.get("lat"), loc.get("lng"))
        # pair each action with its time
        for action in loc.get("actions", []):
            grouped[key].append((loc.get("time"), action))

    consolidated = []
    for (name, lat, lng), entries in grouped.items():
        # sort by time (HH:MM), ignore None
        sorted_entries = sorted(entries, key=lambda x: x[0] or "00:00")
        flat_actions = [act for _, act in sorted_entries]
        consolidated.append({
            "name": name,
            "lat": lat,
            "lng": lng,
            "actions": flat_actions
        })
    return consolidated


def process_file(input_path, output_path, api_key):
    """
    Read daily press releases, extract structured data via AI, consolidate locations, and save output.
    """
    # Create S3 client if using s3 paths
    s3 = boto3.client('s3') if input_path.startswith('s3://') or output_path.startswith('s3://') else None

    # Load input articles
    try:
        if input_path.startswith('s3://'):
            bucket, key = input_path[5:].split('/', 1)
            obj = s3.get_object(Bucket=bucket, Key=key)
            lines = obj['Body'].read().decode('utf-8').splitlines()
            daily_articles = [json.loads(line) for line in lines]
        else:
            with open(input_path, 'r', encoding='utf-8') as f:
                daily_articles = [json.loads(line) for line in f]
        if not daily_articles:
            print("No articles found for today")
            return
    except Exception as e:
        print(f"Error reading input: {e}")
        return

    # Call OpenRouter extractor
    try:
        result = extract_daily_locations_and_actions(daily_articles, api_key)
        # Consolidate multiple blocks into one per location
        consolidated = consolidate_locations(result.get("locations", []))

        output = {
            "processing_date": datetime.now().isoformat(),
            "articles_processed": len(daily_articles),
            "date": result.get("date", daily_articles[0].get("published_date", "")),
            "locations": consolidated,
            "source_articles": [
                {"id": art.get("id", str(uuid.uuid4())), "title": art.get("title", ""), "url": art.get("url", "")}  
                for art in daily_articles
            ]
        }

        out_json = json.dumps(output, indent=2, ensure_ascii=False)
        if output_path.startswith('s3://'):
            bucket, key = output_path[5:].split('/', 1)
            s3.put_object(Bucket=bucket, Key=key, Body=out_json.encode('utf-8'))
        else:
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(out_json)

        print(f"✅ Successfully processed and consolidated {len(consolidated)} locations from {len(daily_articles)} articles")
    except Exception as e:
        print(f"Processing failed: {e}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Process daily press releases with AI')
    parser.add_argument('--input', required=True, help='Input file path (local or s3://)')
    parser.add_argument('--output', required=True, help='Output file path (local or s3://)')
    parser.add_argument('--api-key', required=True, help='OpenRouter API key')
    args = parser.parse_args()
    process_file(args.input, args.output, args.api_key)
