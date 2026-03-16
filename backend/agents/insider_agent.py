# agents/insider_agent.py
# Purpose: Extract Form 4 insider transactions — delay detection included
# Input: cik, ticker
# Returns: {"net_30d_value": float, "net_90d_value": float, "ceo_activity": str, "unusual_delay_detected": bool}
# Env vars: TINYFISH_API_KEY

from .base_agent import BaseAgent


class InsiderTransactionAgent(BaseAgent):
    name = "insider"
    timeout_seconds = 15

    async def run(self, cik: str = "", ticker: str = "") -> dict:
        if not cik and not ticker:
            return {}

        search_param = cik if cik else ticker
        url = f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={search_param}&type=4&count=20"

        task = f"""Navigate to {url}

This page lists Form 4 insider transaction filings for {ticker}.
For each filing extract:
- Insider name and their role/title
- Transaction type: Buy, Sell, or Option Exercise
- Number of shares and dollar value (if shown)
- Transaction date and Filing date
- Calculate delay in business days

Calculate net buy/sell value for last 30 days and last 90 days (sells are negative).
Identify if the CEO has been buying or selling.
Flag any transaction with delay > 2 business days as unusual.

Return ONLY this JSON:
{{
  "net_30d_value": 0.0,
  "net_90d_value": 0.0,
  "ceo_activity": "NONE",
  "unusual_delay_detected": false,
  "largest_transaction": {{"name": "", "role": "", "type": "", "value": 0.0}},
  "transactions": []
}}"""

        return await self.call_tinyfish(task, url)
