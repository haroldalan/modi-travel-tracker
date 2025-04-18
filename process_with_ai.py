import json
import boto3
import openai
import argparse
from typing import List, Dict
from datetime import datetime

def extract_locations_and_actions(text: str, api_key: str) -> Dict:
    """Use OpenRouter AI to extract structured data from press release"""
    openai.api_key = api_key
    openai.api_base = "https://openrouter.ai/api/v1"
    
    prompt = f"""
    Analyze this press release about PM Modi's activities and extract:
    1. All locations mentioned (with coordinates if possible)
    2. Key actions/activities in bullet points
    
    Return JSON format like:
    {{
        "locations": [
            {{
                "name": "City, Country",
                "lat": float,
                "lng": float,
                "date": "YYYY-MM-DD",
                "actions": [
                    "Action 1",
                    "Action 2"
                ]
            }}
        ]
    }}
    
    Press release:
    {text}
    """
    
    response = openai.ChatCompletion.create(
        model="anthropic/claude-2",  # or any preferred model
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3
    )
    
    try:
        return json.loads(response.choices[0].message.content)
    except json.JSONDecodeError:
        print("Failed to parse AI response")
        return {"locations": []}

def process_file(input_path: str, output_path: str, api_key: str):
    """Process all press releases in input file"""
    s3 = boto3.client('s3')
    
    # Download from S3 if path starts with s3://
    if input_path.startswith('s3://'):
        bucket, key = input_path[5:].split('/', 1)
        obj = s3.get_object(Bucket=bucket, Key=key)
        content = obj['Body'].read().decode('utf-8')
        releases = [json.loads(line) for line in content.splitlines()]
    else:
        with open(input_path) as f:
            releases = [json.loads(line) for line in f]
    
    processed_data = []
    for release in releases:
        try:
            ai_result = extract_locations_and_actions(release['content'], api_key)
            processed_data.append({
                "original_id": release['id'],
                "title": release['title'],
                "published_date": release['published_date'],
                "url": release['url'],
                "locations": ai_result.get('locations', [])
            })
        except Exception as e:
            print(f"Error processing {release['id']}: {str(e)}")
    
    # Save processed data
    if output_path.startswith('s3://'):
        bucket, key = output_path[5:].split('/', 1)
        s3.put_object(
            Bucket=bucket,
            Key=key,
            Body=json.dumps(processed_data, indent=2).encode('utf-8')
        )
    else:
        with open(output_path, 'w') as f:
            json.dump(processed_data, f, indent=2)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True, help='Input file path (local or S3)')
    parser.add_argument('--output', required=True, help='Output file path (local or S3)')
    parser.add_argument('--api-key', required=True, help='OpenRouter API key')
    args = parser.parse_args()
    
    process_file(args.input, args.output, args.api_key)
