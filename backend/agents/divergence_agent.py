# agents/divergence_agent.py
# Purpose: Navigate company IR page, extract latest press release for divergence analysis
# Input: ticker, company_name
# Returns: {"statement_date": str, "key_claims": [], "latest_statement_text": str}
# Env vars: TINYFISH_API_KEY

from .base_agent import BaseAgent


class DivergenceDetectionAgent(BaseAgent):
    name = "divergence"
    timeout_seconds = 15

    async def run(self, ticker: str = "", company_name: str = "") -> dict:
        if not ticker and not company_name:
            return {}

        search_term = company_name or ticker
        search_url = f"https://www.google.com/search?q={search_term}+investor+relations+latest+press+release"

        task = f"""Search Google for: "{search_term} investor relations latest press release"

Find the company's official investor relations page.
Navigate to that page.
Find the most recent press release published in the last 30 days.
Extract:
- Publication date
- Headline
- Full text of the press release
- Any specific claims management made about business performance

Return ONLY this JSON:
{{
  "statement_date": "YYYY-MM-DD",
  "statement_headline": "...",
  "latest_statement_text": "full text here",
  "key_claims": ["claim 1", "claim 2", "claim 3"]
}}

If no press release found in last 30 days, return: {{"statement_date": null, "latest_statement_text": ""}}"""

        return await self.call_tinyfish(task, search_url)
