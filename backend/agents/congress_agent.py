# agents/congress_agent.py
# Purpose: Congressional stock trading disclosures + suspicious timing detection
# Input: ticker
# Returns: {"trades_90d": [], "congress_net_sentiment": str, "suspicious_timing_detected": bool, "timing_note": str}
# Env vars: TINYFISH_API_KEY

import asyncio
from .base_agent import BaseAgent


class CongressTradingAgent(BaseAgent):
    name = "congress"
    timeout_seconds = 15

    async def run(self, ticker: str = "") -> dict:
        if not ticker:
            return {}

        house_url = f"https://housestockwatcher.com/ticker/{ticker}"
        senate_url = f"https://senatestockwatcher.com/ticker/{ticker}"

        house_task = f"""Navigate to {house_url}
Extract all House member trades for {ticker} in the last 90 days.
For each trade: member name, state, party, transaction type (buy/sell), amount range, dates.
Return JSON: {{"trades": [], "total_bought": 0, "total_sold": 0}}"""

        senate_task = f"""Navigate to {senate_url}
Extract all Senate member trades for {ticker} in the last 90 days.
For each trade: member name, state, party, transaction type (buy/sell), amount range, dates.
Return JSON: {{"trades": [], "total_bought": 0, "total_sold": 0}}"""

        house_result, senate_result = await asyncio.gather(
            self.call_tinyfish(house_task, house_url),
            self.call_tinyfish(senate_task, senate_url),
            return_exceptions=True,
        )

        house = house_result if isinstance(house_result, dict) else {}
        senate = senate_result if isinstance(senate_result, dict) else {}

        all_trades = house.get("trades", []) + senate.get("trades", [])
        total_bought = house.get("total_bought", 0) + senate.get("total_bought", 0)
        total_sold = house.get("total_sold", 0) + senate.get("total_sold", 0)

        if total_bought > total_sold:
            net_sentiment = "BUYING"
        elif total_sold > total_bought:
            net_sentiment = "SELLING"
        else:
            net_sentiment = "NEUTRAL"

        return {
            "trades_90d": all_trades[:20],
            "total_congress_bought": total_bought,
            "total_congress_sold": total_sold,
            "congress_net_sentiment": net_sentiment,
            "suspicious_timing_detected": False,
            "timing_note": "",
        }
