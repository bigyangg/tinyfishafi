# agents/edgar_filing_agent.py
# Purpose: Navigate EDGAR filing index -> return primary document URL only
# Also provides extract_filing_text() — form-specific strategy dispatch for robust text extraction
# Input: accession_number, cik
# Returns: {"document_url": str, "exhibit_count": int}
# Env vars: TINYFISH_API_KEY, USE_TINYFISH

import os
import re
import asyncio
import logging
import json

import httpx
from bs4 import BeautifulSoup

from .base_agent import BaseAgent

logger = logging.getLogger(__name__)

# Per-form-type extraction strategy
# tinyfish_then_http: TinyFish (targeted prompt + timeout) then HTTP scrape fallback
# http_direct:        Direct HTTP scrape only (very short notices)
# sec_api_primary:    SEC structured APIs (XBRL facts + submissions + filing index) — for large forms
# sec_api_then_http:  SEC APIs first, HTTP scrape fallback
EXTRACTION_STRATEGY = {
    # SEC EDGAR pages are static HTML — direct HTTP is fast (1-2s)
    # TinyFish is reserved for JS-rendered enrichment (Yahoo Finance, etc.)
    "8-K":    "http_direct",
    "8-K/A":  "http_direct",
    "4":      "http_direct",
    "SC 13D": "http_direct",
    "S-1":    "http_direct",
    "10-K":   "sec_api_primary",   # 200-500 pages — use SEC XBRL API
    "10-K/A": "sec_api_primary",
    "10-Q":   "sec_api_then_http", # 50-100 pages — SEC API first
    "10-Q/A": "sec_api_then_http",
    "DEF 14A":"http_direct",
    "NT 10-K":"http_direct",
    "NT 10-Q":"http_direct",
}

# Per-form-type TinyFish timeouts (seconds)
FORM_TIMEOUTS = {
    "8-K": 25, "8-K/A": 25, "4": 15, "SC 13D": 30,
    "S-1": 45, "10-Q": 35, "10-K": 45,
    "DEF 14A": 30, "NT 10-K": 15, "NT 10-Q": 15,
}

FORM_MAX_CHARS = {
    "8-K": 8000, "8-K/A": 8000, "4": 3000,
    "SC 13D": 10000, "S-1": 12000, "10-Q": 10000,
    "10-K": 12000, "DEF 14A": 8000,
    "NT 10-K": 4000, "NT 10-Q": 4000,
}

# Shared HTTP headers for all SEC requests
_SEC_HEADERS = {
    "User-Agent": "AFI-Research contact@afi-platform.com",
    "Accept-Encoding": "gzip, deflate",
}


def log_message(msg: str):
    """Thin wrapper so extraction methods can log without needing self."""
    logger.info(msg)


class EdgarFilingAgent(BaseAgent):
    name = "edgar_filing"

    def _should_use_tinyfish(self, url: str) -> bool:
        """Check if TinyFish is enabled via env var."""
        return os.environ.get("USE_TINYFISH", "true").lower() == "true"

    def _build_tinyfish_goal(self, form_type: str, ticker: str, company: str) -> str:
        """Targeted TinyFish goals — specific = fast. Generic = slow."""
        goals = {
            "8-K": (
                'Return as JSON: {"text": "<page text content>"}\n'
                'Get the main disclosure text from this page. '
                'Include any events, agreements, or announcements. '
                'Skip boilerplate headers and legal notices.'
            ),
            "4": (
                'Return as JSON: {"text": "<transaction details>"}\n'
                'Get the insider transaction details: '
                'person name, title, shares, price, transaction type, date.'
            ),
            "SC 13D": (
                'Return as JSON: {"text": "<filing content>"}\n'
                'Get the activist investor details: '
                'investor name, stake percentage, stated intentions, key items.'
            ),
            "10-Q": (
                'Return as JSON: {"text": "<quarterly results>"}\n'
                'Get only: revenue, net income, EPS, guidance if mentioned. '
                'Skip financial statement tables. Just the key numbers and narrative.'
            ),
            "10-K": (
                'Return as JSON: {"text": "<annual highlights>"}\n'
                'Get only: business overview paragraph, key annual metrics, '
                'major risks mentioned, CEO letter highlights. '
                'Do NOT read financial statements or exhibits.'
            ),
            "S-1": (
                'Return as JSON: {"text": "<IPO details>"}\n'
                'Get: company description, IPO size, underwriters, '
                'use of proceeds, key risks. Skip financial tables.'
            ),
            "DEF 14A": (
                'Return as JSON: {"text": "<proxy highlights>"}\n'
                'Get: executive compensation summary, key votes, board changes.'
            ),
            "NT 10-K": (
                'Return as JSON: {"text": "<late filing notice>"}\n'
                'Get the reason for late filing in one paragraph.'
            ),
            "NT 10-Q": (
                'Return as JSON: {"text": "<late filing notice>"}\n'
                'Get the reason for late filing in one paragraph.'
            ),
            "8-K/A": (
                'Return as JSON: {"text": "<amendment content>"}\n'
                'Get the main amended disclosure. What changed from the original filing?'
            ),
        }
        return goals.get(form_type, (
            'Return as JSON: {"text": "<page content>"}\n'
            'Get the main text content of this page briefly.'
        ))

    async def run(self, accession_number: str = "", cik: str = "") -> dict:
        if not accession_number or not cik:
            return {}

        accession_fmt = accession_number.replace("-", "")
        cik_clean = str(int(cik)) if cik.isdigit() else cik.lstrip("0") or cik
        url = f"https://www.sec.gov/Archives/edgar/data/{cik_clean}/{accession_fmt}/{accession_number}-index.htm"

        # SEC EDGAR index pages are static HTML — parse directly without TinyFish
        # (TinyFish LLM guard blocks sec.gov; HTTP parsing is faster and more reliable)
        doc_url = await self._find_primary_document_http(url, accession_number)
        if doc_url:
            return {"document_url": doc_url, "exhibit_count": 0}

        # TinyFish fallback only for non-sec.gov URLs
        if not self._should_use_tinyfish(url):
            return {"document_url": "", "exhibit_count": 0}

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

    async def _find_primary_document_http(self, index_url: str, accession_number: str) -> str:
        """Parse the EDGAR filing index page via HTTP to find the primary document URL.

        Returns the absolute URL to the primary document, or empty string on failure.
        """
        try:
            async with httpx.AsyncClient(
                timeout=10.0,
                follow_redirects=True,
                headers={"User-Agent": _SEC_HEADERS["User-Agent"]},
            ) as client:
                r = await client.get(index_url)
                if r.status_code != 200:
                    log_message(f"[edgar_filing] Index fetch {r.status_code} for {accession_number}")
                    return ""
                soup = BeautifulSoup(r.text, "lxml")
                # The filing index table has type in col 0 and link in col 2
                EXHIBIT_TYPES = {
                    "EX-99", "EX-31", "EX-32", "EX-10", "EX-21", "EX-23",
                    "EX-99.1", "EX-99.2", "EX-99.3",
                }
                for row in soup.find_all("tr"):
                    cells = row.find_all("td")
                    if len(cells) >= 3:
                        doc_type = cells[0].get_text(strip=True).upper()
                        link_tag = cells[2].find("a")
                        if not link_tag:
                            continue
                        href = link_tag.get("href", "")
                        # Skip obvious exhibits
                        if any(doc_type.startswith(ex) for ex in EXHIBIT_TYPES):
                            continue
                        # Accept .htm / .txt primary documents
                        if href and (href.endswith(".htm") or href.endswith(".txt")):
                            full_url = (
                                f"https://www.sec.gov{href}" if href.startswith("/") else href
                            )
                            log_message(
                                f"[edgar_filing] Primary doc found via HTTP: {full_url}"
                            )
                            return full_url
        except Exception as e:
            log_message(f"[edgar_filing] HTTP index parse failed: {e}")
        return ""

    # ─────────────────────────────────────────────────────────────
    # PUBLIC: form-specific strategy dispatch
    # ─────────────────────────────────────────────────────────────

    async def extract_filing_text(
        self,
        filing_url: str,
        form_type: str,
        ticker: str,
        accession_number: str = "",
        cik: str = "",
    ) -> tuple[str, str]:
        """
        Returns (text, source_method) tuple.
        Picks the right extraction strategy based on form type to avoid 685s+ timeouts
        on large annual reports that TinyFish would have to render 200-500 pages for.

        source_method: "tinyfish" | "http" | "sec_api" | "targeted_http" | ""
        """
        strategy = EXTRACTION_STRATEGY.get(form_type, "tinyfish_then_http")
        log_message(f"[{ticker}/{form_type}] Extraction strategy: {strategy}")

        if strategy == "tinyfish_then_http":
            return await self._tinyfish_then_http(filing_url, form_type, ticker, accession_number)
        elif strategy == "http_direct":
            return await self._http_direct(filing_url, form_type, ticker)
        elif strategy == "sec_api_primary":
            return await self._sec_api_primary(ticker, form_type, accession_number, cik, filing_url)
        elif strategy == "sec_api_then_http":
            text, src = await self._sec_api_primary(ticker, form_type, accession_number, cik, filing_url)
            if text and len(text) > 500:
                return text, src
            return await self._http_direct(filing_url, form_type, ticker)

        return "", ""

    # ─────────────────────────────────────────────────────────────
    # STRATEGY IMPLEMENTATIONS
    # ─────────────────────────────────────────────────────────────

    async def _tinyfish_then_http(
        self, url: str, form_type: str, ticker: str, accession_number: str
    ) -> tuple[str, str]:
        """Try TinyFish with targeted form-specific goal, fall back to HTTP."""
        timeout = FORM_TIMEOUTS.get(form_type, 25)
        use_tf = self._should_use_tinyfish(url) and bool(os.environ.get("TINYFISH_API_KEY", ""))

        if use_tf:
            try:
                text = await asyncio.wait_for(
                    self._tinyfish_extract(url, form_type=form_type, ticker=ticker, company=""),
                    timeout=timeout,
                )
                if text and len(text.strip()) > 100:
                    log_message(f"[{ticker}/{form_type}] TinyFish: {len(text)} chars")
                    return self._truncate(text, form_type), "tinyfish"
                else:
                    log_message(
                        f"[{ticker}/{form_type}] TinyFish returned <100 chars — HTTP fallback"
                    )
            except asyncio.TimeoutError:
                log_message(
                    f"[{ticker}/{form_type}] TinyFish timeout ({timeout}s) — HTTP fallback"
                )
            except Exception as e:
                log_message(
                    f"[{ticker}/{form_type}] TinyFish error: {str(e)[:80]} — HTTP fallback"
                )

        return await self._http_direct(url, form_type, ticker)

    async def _http_direct(self, url: str, form_type: str, ticker: str) -> tuple[str, str]:
        """Direct HTTP fetch + HTML stripping. Fast and reliable for any form."""
        try:
            async with httpx.AsyncClient(
                timeout=15.0,
                follow_redirects=True,
                headers={
                    **_SEC_HEADERS,
                    "Accept": "text/html,text/plain,application/xhtml+xml",
                },
            ) as client:
                r = await client.get(url)
                if r.status_code != 200:
                    log_message(f"[{ticker}/{form_type}] HTTP {r.status_code} — empty")
                    return "", ""
                content_type = r.headers.get("content-type", "")
                if "html" in content_type:
                    soup = BeautifulSoup(r.text, "lxml")
                    for tag in soup(["script", "style", "meta", "nav", "header", "footer", "noscript", "iframe"]):
                        tag.decompose()
                    content = (
                        soup.find("div", class_="formContent")
                        or soup.find("body")
                        or soup
                    )
                    text = content.get_text(separator=" ", strip=True)
                else:
                    text = r.text
                text = re.sub(r"\s+", " ", text).strip()
                if len(text) > 300:
                    log_message(f"[{ticker}/{form_type}] HTTP: {len(text)} chars")
                    return self._truncate(text, form_type), "http"
        except Exception as e:
            log_message(f"[{ticker}/{form_type}] HTTP error: {e}")
        return "", ""

    async def _sec_api_primary(
        self,
        ticker: str,
        form_type: str,
        accession_number: str,
        cik: str,
        filing_url: str,
    ) -> tuple[str, str]:
        """
        For large filings (10-K, 10-Q): use SEC structured data APIs.
        Combines XBRL facts + submission metadata + first 200KB of main document items.
        Completes in <10 seconds vs 685s+ for full TinyFish render.
        """
        # Resolve CIK from accession number if not supplied
        if not cik and accession_number:
            cik = accession_number.split("-")[0].lstrip("0")

        results: list[tuple[str, str]] = []

        async with httpx.AsyncClient(
            timeout=12.0,
            follow_redirects=True,
            headers={"User-Agent": _SEC_HEADERS["User-Agent"], "Accept": "application/json"},
        ) as client:

            # Source 1: XBRL Company Facts API — structured financial data
            if cik:
                try:
                    facts_url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik.zfill(10)}.json"
                    r = await client.get(facts_url)
                    if r.status_code == 200:
                        extracted = self._extract_key_facts_from_xbrl(r.json(), ticker, form_type)
                        if extracted:
                            results.append(("sec_facts_api", extracted))
                            log_message(
                                f"[{ticker}/{form_type}] SEC Facts API: {len(extracted)} chars"
                            )
                except Exception as e:
                    log_message(f"[{ticker}/{form_type}] SEC Facts API error: {e}")

            # Source 2: Submissions API — company metadata
            if cik:
                try:
                    subs_url = f"https://data.sec.gov/submissions/CIK{cik.zfill(10)}.json"
                    r = await client.get(subs_url)
                    if r.status_code == 200:
                        metadata = self._extract_submission_metadata(r.json(), ticker, form_type)
                        if metadata:
                            results.append(("sec_submissions", metadata))
                except Exception as e:
                    log_message(f"[{ticker}/{form_type}] Submissions API error: {e}")

            # Source 3: Filing index — find and partially read the main document
            if accession_number and cik:
                try:
                    acc_clean = accession_number.replace("-", "")
                    idx_url = (
                        f"https://www.sec.gov/Archives/edgar/data/{cik}"
                        f"/{acc_clean}/{accession_number}-index.htm"
                    )
                    r = await client.get(idx_url)
                    if r.status_code == 200:
                        soup = BeautifulSoup(r.text, "lxml")
                        main_doc = None
                        for row in soup.find_all("tr"):
                            cells = row.find_all("td")
                            if len(cells) >= 3:
                                doc_type = cells[0].text.strip()
                                if doc_type in ("10-K", "10-Q", "10-K/A", "10-Q/A"):
                                    link = cells[2].find("a")
                                    if link:
                                        main_doc = link.get("href", "")
                                        break
                        if main_doc:
                            if not main_doc.startswith("http"):
                                main_doc = f"https://www.sec.gov{main_doc}" if main_doc.startswith("/") else ""
                            if main_doc:
                                r2 = await client.get(main_doc)
                                if r2.status_code == 200:
                                    soup2 = BeautifulSoup(r2.text[:200000], "lxml")
                                    items_text = self._extract_items_from_filing(soup2)
                                    if items_text:
                                        results.append(("filing_items", items_text))
                                        log_message(
                                            f"[{ticker}/{form_type}] Filing items: {len(items_text)} chars"
                                        )
                except Exception as e:
                    log_message(f"[{ticker}/{form_type}] Filing index error: {e}")

            # Source 4: EFTS for filing context metadata
            try:
                efts_url = (
                    "https://efts.sec.gov/LATEST/search-index?"
                    f"q=%22{ticker}%22&forms={form_type.replace(' ', '+')}"
                    "&dateRange=custom&startdt=2024-01-01&enddt=2026-12-31"
                )
                r = await client.get(efts_url, timeout=8.0)
                if r.status_code == 200:
                    hits = r.json().get("hits", {}).get("hits", [])
                    if hits:
                        src = hits[0].get("_source", {})
                        efts_text = (
                            f"Company: {src.get('entity_name', '')}\n"
                            f"Form: {form_type}\n"
                            f"Filed: {src.get('file_date', '')}\n"
                            f"Period: {src.get('period_of_report', '')}\n"
                        )
                        results.append(("efts", efts_text))
            except Exception as e:
                log_message(f"[{ticker}/{form_type}] EFTS error: {e}")

        if results:
            combined = "\n\n---\n\n".join(f"[{src}]\n{text}" for src, text in results)
            log_message(
                f"[{ticker}/{form_type}] SEC API combined: {len(combined)} chars "
                f"from {len(results)} sources"
            )
            return combined[:12000], "sec_api"

        # Final fallback: targeted HTTP scrape truncated at financial statements start
        log_message(f"[{ticker}/{form_type}] All SEC APIs failed — targeted HTTP scrape")
        return await self._targeted_large_filing_scrape(filing_url, ticker, form_type)

    async def _targeted_large_filing_scrape(
        self, url: str, ticker: str, form_type: str
    ) -> tuple[str, str]:
        """Last resort for large filings: HTTP scrape but only first 150KB, stop before financial tables."""
        try:
            async with httpx.AsyncClient(
                timeout=15.0,
                follow_redirects=True,
                headers={"User-Agent": _SEC_HEADERS["User-Agent"]},
            ) as client:
                r = await client.get(url)
                if r.status_code != 200:
                    return "", ""
                soup = BeautifulSoup(r.text[:150000], "lxml")
                for tag in soup(["table", "script", "style", "meta", "nav", "header", "footer"]):
                    tag.decompose()
                text = soup.get_text(separator=" ", strip=True)
                text = re.sub(r"\s+", " ", text).strip()
                # Stop before financial statement tables to avoid dumping pages of numbers
                for phrase in (
                    "INDEX TO FINANCIAL STATEMENTS",
                    "CONSOLIDATED STATEMENTS OF",
                    "CONSOLIDATED BALANCE SHEETS",
                ):
                    pos = text.upper().find(phrase)
                    if pos > 2000:
                        text = text[:pos]
                        break
                if len(text) > 300:
                    log_message(f"[{ticker}/{form_type}] Targeted HTTP: {len(text)} chars")
                    return self._truncate(text, form_type), "targeted_http"
        except Exception as e:
            log_message(f"[{ticker}/{form_type}] Targeted HTTP error: {e}")
        return "", ""

    # ─────────────────────────────────────────────────────────────
    # XBRL / metadata helpers for _sec_api_primary
    # ─────────────────────────────────────────────────────────────

    def _extract_key_facts_from_xbrl(
        self, facts_data: dict, ticker: str, form_type: str
    ) -> str:
        """Extract latest key financial metrics from SEC XBRL company facts JSON."""
        us_gaap = facts_data.get("facts", {}).get("us-gaap", {})
        entity_name = facts_data.get("entityName", ticker)

        METRICS = {
            "Revenues": "Total Revenue",
            "RevenueFromContractWithCustomerExcludingAssessedTax": "Revenue",
            "SalesRevenueNet": "Net Revenue",
            "NetIncomeLoss": "Net Income",
            "EarningsPerShareBasic": "EPS Basic",
            "EarningsPerShareDiluted": "EPS Diluted",
            "OperatingIncomeLoss": "Operating Income",
            "GrossProfit": "Gross Profit",
            "ResearchAndDevelopmentExpense": "R&D Expense",
            "Assets": "Total Assets",
            "CashAndCashEquivalentsAtCarryingValue": "Cash",
            "LongTermDebt": "Long-term Debt",
            "NetCashProvidedByUsedInOperatingActivities": "Operating Cash Flow",
            "CommonStockSharesOutstanding": "Shares Outstanding",
        }

        lines = [
            f"Company: {entity_name} ({ticker})",
            f"Form: {form_type}",
            "Source: SEC EDGAR XBRL Company Facts",
            "",
        ]
        latest_period = None
        found = 0

        for xbrl_key, display_name in METRICS.items():
            if xbrl_key not in us_gaap:
                continue
            units = us_gaap[xbrl_key].get("units", {})
            values = units.get("USD", units.get("shares", []))
            if not values:
                continue
            # Prefer annual filings, fall back to quarterly
            annual = [
                v for v in values
                if v.get("form") in ("10-K", "10-K/A") and v.get("val") is not None
            ]
            if not annual:
                annual = [
                    v for v in values
                    if v.get("form") in ("10-Q", "10-Q/A") and v.get("val") is not None
                ]
            if not annual:
                continue
            annual.sort(key=lambda x: x.get("end", ""), reverse=True)
            latest = annual[0]
            val = latest.get("val", 0)
            period_end = latest.get("end", "")
            if latest_period is None:
                latest_period = period_end

            if abs(val) >= 1_000_000_000:
                formatted = f"${val / 1_000_000_000:.2f}B"
            elif abs(val) >= 1_000_000:
                formatted = f"${val / 1_000_000:.1f}M"
            elif abs(val) >= 1_000:
                formatted = f"${val / 1_000:.1f}K"
            else:
                formatted = str(val)
            lines.append(f"{display_name}: {formatted} (period ending {period_end})")
            found += 1

        if found == 0:
            return ""
        if latest_period:
            lines.insert(3, f"Most recent period: {latest_period}")
        return "\n".join(lines)

    def _extract_submission_metadata(
        self, subs_data: dict, ticker: str, form_type: str
    ) -> str:
        """Extract company metadata and recent filing history from submissions API."""
        name = subs_data.get("name", ticker)
        sic_desc = subs_data.get("sicDescription", "")
        sic = subs_data.get("sic", "")
        state = subs_data.get("stateOfIncorporation", "")
        recent = subs_data.get("filings", {}).get("recent", {})
        forms = recent.get("form", [])
        dates = recent.get("filingDate", [])
        history = []
        for i, form in enumerate(forms):
            if form == form_type and i < len(dates):
                history.append(f"  {dates[i]}: {form}")
            if len(history) >= 3:
                break
        return (
            f"Company: {name} ({ticker})\n"
            f"Industry: {sic_desc} (SIC: {sic})\n"
            f"Incorporated: {state}\n"
            f"Recent {form_type} filings:\n" + "\n".join(history)
        )

    def _extract_items_from_filing(self, soup) -> str:
        """Extract key Item sections from a 10-K/10-Q. Skips tables to avoid financial table noise."""
        TARGET_ITEMS = (
            "item 1.", "item 1a.", "item 1b.",
            "item 7.", "item 7a.", "item 8.", "item 9a.",
        )
        text_parts: list[str] = []
        for element in soup.find_all(["p", "div", "span", "h1", "h2", "h3", "h4"], limit=2000):
            if element.find_parent("table"):
                continue
            text = element.get_text(strip=True)
            if not text or len(text) < 20:
                continue
            text_lower = text.lower()[:50]
            is_heading = any(item in text_lower for item in TARGET_ITEMS)
            if is_heading:
                text_parts.append(f"\n\n{text}\n")
            elif text_parts and len(text) > 50:
                text_parts.append(text)
            if sum(len(p) for p in text_parts) > 8000:
                break
        return " ".join(text_parts)

    # ─────────────────────────────────────────────────────────────
    # TRUNCATION helpers
    # ─────────────────────────────────────────────────────────────

    def _truncate(self, text: str, form_type: str) -> str:
        """Smart head+tail truncation. Skips middle boilerplate for large documents."""
        limit = FORM_MAX_CHARS.get(form_type, 8000)
        return self._smart_truncate(text, limit)

    # ─────────────────────────────────────────────────────────────
    # PRIVATE helpers (original extraction internals, preserved for backward compat)
    # ─────────────────────────────────────────────────────────────

    async def _tinyfish_extract(
        self, url: str, form_type: str = "", ticker: str = "", company: str = ""
    ) -> str:
        """Use TinyFish to navigate and extract filing text with a targeted form-specific goal."""
        if form_type:
            task = self._build_tinyfish_goal(form_type, ticker, company)
        else:
            task = (
                'Return as JSON: {"text": "<page content>"}\n'
                "Get the main text content of this SEC filing page briefly."
            )
        result = await self.call_tinyfish(task, url)
        if isinstance(result, dict):
            # call_tinyfish returns parsed JSON — extract text field
            return (
                result.get("text")
                or result.get("content")
                or result.get("raw_text")
                or str(result)
            )
        if isinstance(result, str):
            return result
        return ""

    async def _efts_extract(
        self, ticker: str, form_type: str, accession_number: str
    ) -> str:
        """Query SEC EFTS full-text search index for filing metadata/content."""
        async with httpx.AsyncClient(
            timeout=10.0,
            follow_redirects=True,
            headers={**_SEC_HEADERS, "Accept": "application/json"},
        ) as client:
            # Try 1: look up by accession number (most precise)
            if accession_number:
                url = (
                    "https://efts.sec.gov/LATEST/search-index?"
                    f"q=%22{accession_number}%22"
                    f"&forms={form_type.replace(' ', '+')}"
                )
                r = await client.get(url)
                if r.status_code == 200:
                    data = r.json()
                    hits = data.get("hits", {}).get("hits", [])
                    if hits:
                        src = hits[0].get("_source", {})
                        parts = [
                            src.get("entity_name", ""),
                            src.get("period_of_report", ""),
                            src.get("file_date", ""),
                            str(src.get("form_type", "")),
                            src.get("description", ""),
                            src.get("file_num", ""),
                        ]
                        combined = " | ".join(p for p in parts if p)
                        # Also try to get the actual document text from the hit
                        doc_text = src.get("file_text", "") or src.get("text", "")
                        if doc_text and len(doc_text) > 300:
                            return doc_text
                        if combined and len(combined) > 100:
                            return combined

            # Try 2: search by ticker + form type for most recent filing
            url2 = (
                "https://efts.sec.gov/LATEST/search-index?"
                f"q=%22{ticker}%22"
                f"&forms={form_type.replace(' ', '+')}"
                "&dateRange=custom"
                "&startdt=2024-01-01&enddt=2026-12-31"
                "&hits.hits.total.value=1"
            )
            r2 = await client.get(url2)
            if r2.status_code == 200:
                data = r2.json()
                hits = data.get("hits", {}).get("hits", [])
                if hits:
                    src = hits[0].get("_source", {})
                    doc_text = src.get("file_text", "") or src.get("text", "")
                    if doc_text:
                        return doc_text
                    return str(src)
        return ""

    async def _http_scrape(self, url: str) -> str:
        """Direct HTTP fetch + HTML-to-text stripping."""
        async with httpx.AsyncClient(
            timeout=12.0,
            follow_redirects=True,
            headers={
                **_SEC_HEADERS,
                "Accept": "text/html,text/plain,application/xhtml+xml",
            },
        ) as client:
            r = await client.get(url)
            if r.status_code != 200:
                return ""

            content_type = r.headers.get("content-type", "")

            if "html" in content_type:
                soup = BeautifulSoup(r.text, "lxml")
                # Remove noise tags
                for tag in soup(
                    ["script", "style", "meta", "nav", "header", "footer",
                     "noscript", "iframe"]
                ):
                    tag.decompose()
                # Prefer .formContent wrapper; fall back to body
                content = (
                    soup.find("div", class_="formContent")
                    or soup.find("body")
                    or soup
                )
                text = content.get_text(separator=" ", strip=True)
            else:
                text = r.text

            # Normalise whitespace
            text = re.sub(r"\s+", " ", text).strip()
            # Strip common SEC cover-page boilerplate
            text = re.sub(
                r"UNITED STATES SECURITIES AND EXCHANGE COMMISSION"
                r".*?WASHINGTON, D\.C\. \d+",
                "",
                text,
                flags=re.DOTALL,
            )
            return text

    def _build_viewer_url(self, accession_number: str, filing_url: str) -> str:
        """Build a SEC EDGAR company browse URL from accession number."""
        if not accession_number:
            return filing_url
        acc = accession_number.replace("-", "")
        cik = acc[:10].lstrip("0") or "0"
        return (
            "https://www.sec.gov/cgi-bin/browse-edgar?"
            f"action=getcompany&CIK={cik}"
            f"&type={accession_number}&dateb=&owner=include"
            "&count=1&search_text="
        )

    def _smart_truncate(self, text: str, max_chars: int) -> str:
        """For large documents: keep head+tail, skip middle boilerplate."""
        if len(text) <= max_chars:
            return text
        head = int(max_chars * 0.65)
        tail = max_chars - head
        separator = (
            f"\n\n[... {len(text) - max_chars:,} chars truncated (boilerplate/tables) ...]\n\n"
        )
        return text[:head] + separator + text[-tail:]
