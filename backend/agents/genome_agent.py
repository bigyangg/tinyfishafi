# agents/genome_agent.py
# Purpose: Historical filing pattern builder — analyzes company filing history
# Input: ticker, cik
# Returns: genome data dict with filing patterns
# Env vars: TINYFISH_API_KEY

from .base_agent import BaseAgent


class GenomeAgent(BaseAgent):
    name = "genome"
    timeout_seconds = 20

    async def run(self, ticker: str = "", cik: str = "") -> dict:
        if not cik:
            return {}

        padded_cik = str(cik).zfill(10)
        url = f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={padded_cik}&type=&dateb=&owner=include&count=40&search_text=&action=getcompany"

        task = f"""Navigate to {url}

This page shows EDGAR filings for {ticker} (CIK: {cik}).
Extract metadata for up to 40 recent filings:
- Filing type (8-K, 10-K, 10-Q, etc.)
- Filing date
- Accession number

Identify patterns:
- Filing frequency and any delays
- Types of amendments filed
- Count of each filing type

Return ONLY this JSON:
{{
  "total_filings": 0,
  "filing_types": {{"8-K": 0, "10-K": 0, "10-Q": 0, "4": 0}},
  "latest_10k_date": "YYYY-MM-DD",
  "latest_10q_date": "YYYY-MM-DD",
  "amendment_count": 0,
  "filings": []
}}"""

        return await self.call_tinyfish(task, url)
