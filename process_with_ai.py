#!/usr/bin/env python3
import json
import re
import requests
import boto3
from datetime import datetime
import argparse
import uuid
from collections import defaultdict
import os

# OpenRouter API endpoint and model
ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "openai/gpt-4o-mini"  # Updated to a reliable OpenRouter model

def extract_daily_locations_and_actions(articles, api_key):
    """
    Use OpenRouter API to extract structured data from daily press releases.
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/your-repo",  # Required by OpenRouter
        "X-Title": "PM Modi Travel Tracker"
    }

    # Combine articles into one prompt block with truncation
    combined = "\n\n---\n\n".join(
        f"Article {i+1} ({art.get('published_date','')}):\n{art.get('content','')[:5000]}"
        for i, art in enumerate(articles)
    )[:15000]  # Ensure total length is within limits

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
{combined}
"""

    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": "You are an expert analyst extracting structured data from text."},
            {"role": "user", "content": prompt}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.1,
        "max_tokens": 2000
    }

    try:
        resp = requests.post(ENDPOINT, headers=headers, json=payload, timeout=60)
        resp.raise_for_status()
        
        # Debug output
        print(f"API Response Status: {resp.status_code}")
        print(f"Response Preview: {resp.text[:200]}...")

        # Extract and clean JSON
        raw = resp.json()["choices"][0]["message"]["content"]
        cleaned = re.sub(r"```(?:json)?\s*|\s*```$", "", raw.strip())
        result = json.loads(cleaned)

        if not isinstance(result.get("locations"), list):
            raise ValueError("Invalid 'locations' format in AI response")

        return result
    except Exception as e:
        print(f"OpenRouter API Error: {str(e)}")
        raise

def consolidate_locations(locations):
    """Combine and organize location data"""
    grouped = defaultdict(list)
    for loc in locations:
        key = (loc.get("name"), loc.get("lat"), loc.get("lng"))
        for action in loc.get("actions", []):
            grouped[key].append((loc.get("time", "00:00"), action))

    consolidated = []
    for (name, lat, lng), entries in grouped.items():
        sorted_entries = sorted(entries, key=lambda x: x[0])
        consolidated.append({
            "name": name,
            "lat": lat,
            "lng": lng,
            "actions": [act for _, act in sorted_entries]
        })
    return consolidated

def process_file(input_path, output_path, api_key):
    """Process daily press releases and save output"""
    s3 = None
    if input_path.startswith('s3://') or output_path.startswith('s3://'):
        s3 = boto3.client('s3',
            aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
            region_name=os.getenv('AWS_REGION', 'ap-south-1'))

    try:
        # Load input
        if input_path.startswith('s3://'):
            bucket, key = input_path[5:].split('/', 1)
            obj = s3.get_object(Bucket=bucket, Key=key)
            daily_articles = [json.loads(line) for line in obj['Body'].read().decode('utf-8').splitlines()]
        else:
            with open(input_path, 'r', encoding='utf-8') as f:
                daily_articles = [json.loads(line) for line in f]

        if not daily_articles:
            print("⚠️ No articles found for today")
            return

        # Process with AI
        result = extract_daily_locations_and_actions(daily_articles, api_key)
        consolidated = consolidate_locations(result.get("locations", []))

        output = {
            "processing_date": datetime.utcnow().isoformat() + "Z",
            "articles_processed": len(daily_articles),
            "date": result.get("date", daily_articles[0].get("published_date", "")),
            "locations": consolidated,
            "source_articles": [
                {"id": art.get("id", str(uuid.uuid4())), 
                 "title": art.get("title", ""), 
                 "url": art.get("url", "")}
                for art in daily_articles
            ]
        }

        # Save output
        out_json = json.dumps(output, indent=2, ensure_ascii=False)
        if output_path.startswith('s3://'):
            bucket, key = output_path[5:].split('/', 1)
            s3.put_object(Bucket=bucket, Key=key, Body=out_json.encode('utf-8'))
        else:
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(out_json)

        print(f"✅ Processed {len(consolidated)} locations from {len(daily_articles)} articles")

    except Exception as e:
        print(f"❌ Processing failed: {str(e)}")
        raise

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Process daily press releases with AI')
    parser.add_argument('--input', required=True, help='Input file path (local or s3://)')
    parser.add_argument('--output', required=True, help='Output file path (local or s3://)')
    parser.add_argument('--api-key', required=True, 
                       default=os.getenv('OPENROUTER_API_KEY'),  # Fallback to env var
                       help='OpenRouter API key (or set OPENROUTER_API_KEY env var)')
    args = parser.parse_args()
    
    process_file(args.input, args.output, args.api_key)
