# agents/edgar_filing_agent.py
# Purpose: Navigate EDGAR filing index -> return primary document URL only
# Input: accession_number, cik
# Returns: {"document_url": str, "exhibit_count": int}
# Env vars: TINYFISH_API_KEY

from .base_agent import BaseAgent


class EdgarFilingAgent(BaseAgent):
    name = "edgar_filing"

    async def run(self, accession_number: str = "", cik: str = "") -> dict:
        if not accession_number or not cik:
            return {}

        accession_fmt = accession_number.replace("-", "")
        cik_clean = str(int(cik)) if cik.isdigit() else cik.lstrip("0") or cik
        url = f"https://www.sec.gov/Archives/edgar/data/{cik_clean}/{accession_fmt}/{accession_number}-index.htm"

        task = f"""Navigate to this EDGAR filing index page: {url}

Find the PRIMARY document (the main filing document — NOT exhibits).
The primary document is the first .htm or .txt file, usually described with the filing type (8-K, 10-K, etc.).
Do NOT return exhibit files (ex-99, ex-31, ex-32, ex-10, etc.).

Count all files listed on the page.

Return ONLY this JSON:
{{"document_url": "https://www.sec.gov/Archives/edgar/...", "exhibit_count": 0}}"""

        result = await self.call_tinyfish(task, url)

        # Ensure document_url is absolute
        doc_url = result.get("document_url", "")
        if doc_url and not doc_url.startswith("http"):
            doc_url = f"https://www.sec.gov{doc_url}" if doc_url.startswith("/") else ""
            result["document_url"] = doc_url

        return result
