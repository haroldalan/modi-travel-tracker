import json
import boto3
import requests  # Changed from openai
from datetime import datetime

def extract_locations_and_actions(text: str, api_key: str) -> Dict:
    """Use OpenRouter API instead of OpenAI"""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "anthropic/claude-2",  # Or any OpenRouter-supported model
        "messages": [{
            "role": "user",
            "content": f"""
            Analyze this press release and extract:
            1. Locations (with coordinates if possible)
            2. Key actions in bullet points.
            
            Return JSON format like:
            {{
                "locations": [{{
                    "name": "City, Country",
                    "lat": float,
                    "lng": float,
                    "date": "YYYY-MM-DD",
                    "actions": ["Action 1", "Action 2"]
                }}]
            }}
            
            Press release:
            {text}
            """
        }]
    }
    
    response = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers=headers,
        json=payload
    )
    
    try:
        return response.json()["choices"][0]["message"]["content"]
    except Exception as e:
        print(f"OpenRouter error: {e}")
        return {"locations": []}

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
