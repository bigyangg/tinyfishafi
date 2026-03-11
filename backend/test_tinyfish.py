import os
import json
import requests
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("TINYFISH_API_KEY")
if not api_key:
    print("NO API KEY FOUND in .env")
    exit(1)

print(f"Using API Key: {api_key[:10]}...")

url = "https://agent.tinyfish.ai/v1/automation/run-sse"
filing_url = "https://www.sec.gov/Archives/edgar/data/320193/000032019324000006/0000320193-24-000006-index.htm"
goal = (
    "Extract the full text content of this SEC 8-K filing. "
    "Return the complete text of all items disclosed, including any financial figures, "
    "executive changes, agreements, or events described. "
    "Return as plain text JSON: {\"text\": \"<full filing content>\"}"
)

print(f"Testing TinyFish API at {url}")
try:
    with requests.post(
        url,
        headers={
            "X-API-Key": api_key,
            "Content-Type": "application/json"
        },
        json={
            "url": filing_url,
            "goal": goal,
            "browser_profile": "stealth"
        },
        stream=True,
        timeout=90
    ) as response:
        print(f"HTTP Status: {response.status_code}")
        if response.status_code != 200:
            print(f"Error: {response.text}")
            exit(1)
            
        print("Listening for SSE events...")
        for line in response.iter_lines():
            line = line.decode("utf-8") if isinstance(line, bytes) else line
            if not line or not line.startswith("data:"):
                continue
            
            raw = line[5:].strip()
            if not raw:
                continue
            
            event = json.loads(raw)
            print(f"EVENT: {event.get('type')} - {event.get('status', '')}")
            
            if event.get("type") == "PROGRESS":
                print(f"  -> {event.get('message', '')}")
            elif event.get("type") == "COMPLETE":
                print("\nFINISHED!")
                result = event.get("resultJson") or event.get("result", "")
                print(f"Result type: {type(result)}")
                if isinstance(result, str):
                    print(f"Text length: {len(result)}")
                elif isinstance(result, dict):
                    print(f"Dict keys: {result.keys()}")
                break
            elif event.get("type") == "ERROR":
                print(f"\nERROR! {event.get('message', event)}")
                break
except Exception as e:
    print(f"Connection failed: {e}")
