You are the AFI Principal Architect. Execute this upgrade sprint 
completely. Do NOT rebuild anything. Upgrade intelligence quality 
on top of the existing working system.

Work through all tasks in order. After each task, confirm 
what files changed before moving to the next.

=============================================================
TASK 0 — FIX TINYFISH + GEMINI EXTRACTION (DO THIS FIRST)
=============================================================

This is the root cause of conf:0 failures. Fix it before 
anything else or the intelligence upgrades have no data.

--- 0A. Audit current TinyFish implementation ---

Run:
  grep -rn "tinyfish\|TinyFish\|USE_TINYFISH" backend/ \
    --include="*.py" | head -40
  
  grep -rn "extract\|fetch_text\|filing_text" \
    backend/agents/edgar_filing_agent.py | head -30

Show the current extraction flow so we understand what exists.

--- 0B. Rewrite the extraction chain in edgar_filing_agent.py ---

Replace the entire extract_filing_text method with this 
4-step waterfall. Each step only runs if the previous failed:

  import httpx
  import asyncio
  import re
  import os
  from bs4 import BeautifulSoup

  # Install if missing: pip install beautifulsoup4 lxml --break-system-packages

  FORM_TIMEOUTS = {
      "8-K": 12, "8-K/A": 12, "4": 8, "SC 13D": 15,
      "S-1": 20, "10-Q": 18, "10-K": 25,
      "DEF 14A": 15, "NT 10-K": 10, "NT 10-Q": 10,
  }

  FORM_MAX_CHARS = {
      "8-K": 8000, "8-K/A": 8000, "4": 3000,
      "SC 13D": 10000, "S-1": 12000, "10-Q": 10000,
      "10-K": 12000, "DEF 14A": 8000,
      "NT 10-K": 4000, "NT 10-Q": 4000,
  }

  async def extract_filing_text(
      self,
      filing_url: str,
      form_type: str,
      ticker: str,
      accession_number: str = ""
  ) -> tuple[str, str]:
      """
      Returns (text, source_method) tuple.
      source_method: "tinyfish" | "efts" | "http_scrape" | "sec_viewer" | ""
      Tries 4 methods in order, stops at first success.
      """
      timeout = FORM_TIMEOUTS.get(form_type, 15)
      max_chars = FORM_MAX_CHARS.get(form_type, 8000)

      # ── METHOD 1: TinyFish (best quality, but slow/unreliable) ──
      if os.environ.get("USE_TINYFISH", "true").lower() == "true" \
         and os.environ.get("TINYFISH_API_KEY", ""):
          try:
              log_message(
                  f"[{ticker}/{form_type}] TinyFish extracting..."
              )
              text = await asyncio.wait_for(
                  self._tinyfish_extract(filing_url),
                  timeout=timeout
              )
              if text and len(text.strip()) > 300:
                  log_message(
                      f"[{ticker}/{form_type}] TinyFish: "
                      f"{len(text)} chars ✓"
                  )
                  return self._smart_truncate(text, max_chars), "tinyfish"
              else:
                  log_message(
                      f"[{ticker}/{form_type}] TinyFish returned "
                      f"<300 chars — trying fallback"
                  )
          except asyncio.TimeoutError:
              log_message(
                  f"[{ticker}/{form_type}] TinyFish timeout "
                  f"({timeout}s) — falling back to EFTS"
              )
          except Exception as e:
              log_message(
                  f"[{ticker}/{form_type}] TinyFish error: "
                  f"{type(e).__name__}: {str(e)[:100]}"
              )

      # ── METHOD 2: SEC EFTS Full-Text Search ──
      try:
          log_message(
              f"[{ticker}/{form_type}] Trying SEC EFTS..."
          )
          text = await asyncio.wait_for(
              self._efts_extract(ticker, form_type, accession_number),
              timeout=10
          )
          if text and len(text.strip()) > 300:
              log_message(
                  f"[{ticker}/{form_type}] EFTS: {len(text)} chars ✓"
              )
              return self._smart_truncate(text, max_chars), "efts"
      except asyncio.TimeoutError:
          log_message(f"[{ticker}/{form_type}] EFTS timeout")
      except Exception as e:
          log_message(f"[{ticker}/{form_type}] EFTS error: {e}")

      # ── METHOD 3: Direct HTTP scrape of SEC filing URL ──
      try:
          log_message(
              f"[{ticker}/{form_type}] Trying direct HTTP scrape..."
          )
          text = await asyncio.wait_for(
              self._http_scrape(filing_url),
              timeout=12
          )
          if text and len(text.strip()) > 300:
              log_message(
                  f"[{ticker}/{form_type}] HTTP: {len(text)} chars ✓"
              )
              return self._smart_truncate(text, max_chars), "http_scrape"
      except asyncio.TimeoutError:
          log_message(f"[{ticker}/{form_type}] HTTP scrape timeout")
      except Exception as e:
          log_message(f"[{ticker}/{form_type}] HTTP scrape error: {e}")

      # ── METHOD 4: SEC EDGAR Viewer (last resort) ──
      try:
          log_message(
              f"[{ticker}/{form_type}] Trying SEC viewer..."
          )
          viewer_url = self._build_viewer_url(
              accession_number, filing_url
          )
          text = await asyncio.wait_for(
              self._http_scrape(viewer_url),
              timeout=10
          )
          if text and len(text.strip()) > 100:
              log_message(
                  f"[{ticker}/{form_type}] SEC viewer: "
                  f"{len(text)} chars ✓"
              )
              return self._smart_truncate(text, max_chars), "sec_viewer"
      except Exception as e:
          log_message(f"[{ticker}/{form_type}] SEC viewer error: {e}")

      log_message(
          f"[{ticker}/{form_type}] ALL extraction methods failed"
      )
      return "", ""

  async def _efts_extract(
      self,
      ticker: str,
      form_type: str,
      accession_number: str
  ) -> str:
      """
      Query SEC EFTS full-text search for filing content.
      Fast, reliable, no authentication needed.
      """
      async with httpx.AsyncClient(
          timeout=10.0,
          follow_redirects=True,
          headers={
              "User-Agent": "AFI-Research contact@afi-platform.com",
              "Accept-Encoding": "gzip"
          }
      ) as client:
          # Try 1: search by accession number (most precise)
          if accession_number:
              acc_clean = accession_number.replace("-", "")
              url = (
                  f"https://efts.sec.gov/LATEST/search-index?"
                  f"q=%22{accession_number}%22"
                  f"&forms={form_type.replace(' ', '+')}"
              )
              r = await client.get(url)
              if r.status_code == 200:
                  data = r.json()
                  hits = data.get("hits", {}).get("hits", [])
                  if hits:
                      src = hits[0].get("_source", {})
                      # Extract meaningful fields
                      parts = [
                          src.get("entity_name", ""),
                          src.get("period_of_report", ""),
                          src.get("file_date", ""),
                          str(src.get("form_type", "")),
                      ]
                      return " | ".join(p for p in parts if p)

          # Try 2: search by ticker + form type for recent filing
          url2 = (
              f"https://efts.sec.gov/LATEST/search-index?"
              f"q=%22{ticker}%22"
              f"&forms={form_type.replace(' ', '+')}"
              f"&dateRange=custom"
              f"&startdt=2024-01-01&enddt=2026-12-31"
              f"&hits.hits.total.value=1"
          )
          r2 = await client.get(url2)
          if r2.status_code == 200:
              data = r2.json()
              hits = data.get("hits", {}).get("hits", [])
              if hits:
                  src = hits[0].get("_source", {})
                  return str(src)

      return ""

  async def _http_scrape(self, url: str) -> str:
      """
      Direct HTTP fetch + HTML stripping.
      Handles .htm, .html, .txt SEC filing formats.
      """
      async with httpx.AsyncClient(
          timeout=12.0,
          follow_redirects=True,
          headers={
              "User-Agent": "AFI-Research contact@afi-platform.com",
              "Accept": "text/html,text/plain,application/xhtml+xml",
              "Accept-Encoding": "gzip, deflate",
          }
      ) as client:
          r = await client.get(url)
          if r.status_code != 200:
              return ""

          content_type = r.headers.get("content-type", "")

          if "html" in content_type:
              # Parse HTML and extract meaningful text
              soup = BeautifulSoup(r.text, "lxml")
              
              # Remove noise elements
              for tag in soup(["script", "style", "meta", 
                               "nav", "header", "footer",
                               "noscript", "iframe"]):
                  tag.decompose()
              
              # SEC filings often have content in <div class="formContent">
              # or just in the body
              content = soup.find("div", class_="formContent")
              if not content:
                  content = soup.find("body")
              if not content:
                  content = soup
              
              text = content.get_text(separator=" ", strip=True)
          else:
              # Plain text — use as-is
              text = r.text

          # Clean up whitespace
          text = re.sub(r'\s+', ' ', text).strip()
          # Remove SEC boilerplate headers
          text = re.sub(
              r'UNITED STATES SECURITIES AND EXCHANGE COMMISSION.*?'
              r'WASHINGTON, D\.C\. \d+',
              '', text, flags=re.DOTALL
          )
          
          return text

  def _build_viewer_url(
      self, accession_number: str, filing_url: str
  ) -> str:
      """Build SEC EDGAR viewer URL from accession number"""
      if not accession_number:
          return filing_url
      
      # Format: 0000789019-26-000123 → 000078901926000123
      acc = accession_number.replace("-", "")
      cik = acc[:10].lstrip("0")
      
      return (
          f"https://www.sec.gov/cgi-bin/browse-edgar?"
          f"action=getcompany&CIK={cik}"
          f"&type={accession_number}&dateb=&owner=include"
          f"&count=1&search_text="
      )

  def _smart_truncate(self, text: str, max_chars: int) -> str:
      """
      For large documents: take head + tail, skip middle boilerplate.
      Head contains: item descriptions, summary, key events.
      Tail contains: signatures, certifications, key disclosures.
      Middle: often tables, exhibits, legal boilerplate.
      """
      if len(text) <= max_chars:
          return text
      
      head = int(max_chars * 0.65)
      tail = max_chars - head
      
      separator = (
          f"\n\n[... {len(text) - max_chars:,} chars truncated "
          f"(boilerplate/tables) ...]\n\n"
      )
      
      return text[:head] + separator + text[-tail:]

--- 0C. Fix Gemini in signal_pipeline.py ---

Find the current Gemini classification call. Replace with:

  import google.generativeai as genai
  import json, re, time, asyncio, os

  genai.configure(api_key=os.environ.get("GEMINI_API_KEY", ""))

  # Correct model strings — try in order
  _GEMINI_MODELS = [
      "gemini-2.0-flash",
      "gemini-1.5-flash",
      "gemini-1.5-pro",
  ]

  def _init_gemini():
      for model_name in _GEMINI_MODELS:
          try:
              m = genai.GenerativeModel(model_name)
              # Quick connectivity test
              resp = m.generate_content(
                  '{"test":true}',
                  generation_config=genai.GenerationConfig(
                      max_output_tokens=10
                  )
              )
              print(f"✓ Gemini ready: {model_name}")
              return m, model_name
          except Exception as e:
              print(f"✗ {model_name}: {e}")
      return None, None

  _gemini_model, _gemini_model_name = _init_gemini()


  async def classify_with_gemini(
      text: str,
      ticker: str,
      company: str,
      form_type: str
  ) -> dict:
      """
      Classify filing. Never returns conf:0 for real content.
      Falls back to keyword rules if Gemini unavailable.
      """
      if not text or len(text.strip()) < 50:
          return _keyword_classify(text or "", ticker, form_type)
      
      if _gemini_model is None:
          log_message(
              f"[{ticker}/{form_type}] Gemini unavailable "
              f"— using keyword classifier"
          )
          return _keyword_classify(text, ticker, form_type)

      prompt = f"""You are a financial analyst. Analyze this SEC {form_type} filing.
Return ONLY a JSON object with NO markdown, NO backticks, NO extra text.

Company: {company} ({ticker})
Filing type: {form_type}

Text:
{text[:6000]}

JSON schema (respond with EXACTLY this structure):
{{
  "signal": "Positive" or "Neutral" or "Risk",
  "confidence": <50-95 integer, never 0>,
  "summary": "<one sentence: what happened>",
  "why_it_matters": "<one sentence: cause → market effect>",
  "market_impact": "<one sentence: which assets move and direction>",
  "event_type": "<EARNINGS_BEAT|EARNINGS_MISS|GUIDANCE_RAISED|GUIDANCE_CUT|EXEC_DEPARTURE|EXEC_HIRE|INSIDER_BUY|INSIDER_SELL|ACTIVIST_ENTRY|MERGER_ACQUISITION|DEBT_FINANCING|REGULATORY_ACTION|PRODUCT_LAUNCH|CONTRACT_WIN|RESTRUCTURING|LATE_FILING|MATERIAL_WEAKNESS|IPO_REGISTRATION|SHARE_BUYBACK|DIVIDEND_CHANGE|LEGAL_SETTLEMENT|ROUTINE_FILING>",
  "key_facts": ["<specific number or fact>", "<second fact>"],
  "risk_factors": ["<risk if any>"]
}}

Rules:
- Positive: beat, raised guidance, buyback, contract win, acquisition
- Risk: miss, cut guidance, exec departure, investigation, late filing
- Neutral: routine admin, no material news
- confidence 80-95: clear signal with specific numbers found
- confidence 60-79: signal present, limited numbers
- confidence 50-59: vague or ambiguous
- NEVER output confidence below 50 if text has real content
- why_it_matters: format as "X because Y → Z effect on market"
- market_impact: mention specific sectors, competitors, or macro effects"""

      for attempt in range(3):
          try:
              response = await asyncio.to_thread(
                  _gemini_model.generate_content,
                  prompt,
                  generation_config=genai.GenerationConfig(
                      temperature=0.1,
                      max_output_tokens=800,
                      response_mime_type="application/json",
                  )
              )
              
              raw = (response.text or "").strip()
              # Strip markdown fences if present
              raw = re.sub(r'^```(?:json)?\s*', '', raw)
              raw = re.sub(r'\s*```$', '', raw).strip()
              
              result = json.loads(raw)
              
              # Validate and sanitize
              if result.get("signal") not in ["Positive","Neutral","Risk"]:
                  result["signal"] = "Neutral"
              conf = result.get("confidence", 0)
              if not isinstance(conf, int) or conf < 50:
                  result["confidence"] = 55  # floor for real content
              
              result["gemini_model"] = _gemini_model_name
              return result
              
          except json.JSONDecodeError as e:
              log_message(
                  f"[{ticker}/{form_type}] JSON parse error "
                  f"attempt {attempt+1}: {e}"
              )
              if attempt < 2:
                  await asyncio.sleep(1)
                  
          except Exception as e:
              err = str(e).lower()
              if "429" in err or "quota" in err:
                  wait = 2 ** (attempt + 1)
                  log_message(
                      f"[{ticker}/{form_type}] Rate limited — "
                      f"waiting {wait}s"
                  )
                  await asyncio.sleep(wait)
              elif "api_key" in err or "auth" in err:
                  log_message(f"[{ticker}/{form_type}] Auth error: {e}")
                  break
              else:
                  log_message(
                      f"[{ticker}/{form_type}] Gemini error "
                      f"attempt {attempt+1}: {e}"
                  )
                  if attempt < 2:
                      await asyncio.sleep(2)

      # Gemini exhausted — keyword fallback
      log_message(
          f"[{ticker}/{form_type}] Gemini failed — keyword fallback"
      )
      return _keyword_classify(text, ticker, form_type)


  def _keyword_classify(
      text: str, ticker: str, form_type: str
  ) -> dict:
      """
      Rule-based classifier when Gemini is unavailable.
      Uses financial keyword scoring.
      """
      t = text.lower()
      
      POSITIVE = [
          ("beat consensus", 3), ("exceeded expectations", 3),
          ("record revenue", 3), ("raised guidance", 3),
          ("increased dividend", 2), ("share repurchase", 2),
          ("strategic partnership", 2), ("contract awarded", 2),
          ("above expectations", 2), ("strong demand", 2),
          ("revenue growth", 1), ("profitable", 1),
      ]
      RISK = [
          ("missed consensus", 3), ("below expectations", 3),
          ("lowered guidance", 3), ("material weakness", 3),
          ("going concern", 3), ("sec investigation", 3),
          ("restatement", 3), ("late filing", 2),
          ("executive resignation", 2), ("terminated", 2),
          ("revenue declined", 2), ("net loss", 1),
      ]
      
      pos = sum(w for kw, w in POSITIVE if kw in t)
      neg = sum(w for kw, w in RISK if kw in t)
      
      # Form type hard rules
      if form_type in ("NT 10-K", "NT 10-Q"):
          return {
              "signal": "Risk",
              "confidence": 82,
              "event_type": "LATE_FILING",
              "summary": f"{ticker} filed late filing notice ({form_type})",
              "why_it_matters": "Late filing often signals accounting issues or operational problems.",
              "market_impact": "Typically negative — investors penalize disclosure delays.",
              "key_facts": [f"Form: {form_type}", "Filing deadline missed"],
              "risk_factors": ["Potential accounting irregularities"],
              "classification_method": "rule_based"
          }
      
      if pos > neg:
          signal, conf, event = "Positive", min(50 + pos*5, 72), "OTHER"
      elif neg > pos:
          signal, conf, event = "Risk", min(50 + neg*5, 72), "OTHER"
      else:
          signal, conf, event = "Neutral", 45, "ROUTINE_FILING"
      
      return {
          "signal": signal,
          "confidence": conf,
          "event_type": event,
          "summary": f"{ticker} {form_type} filing processed via keyword analysis.",
          "why_it_matters": "AI classification unavailable — review filing directly.",
          "market_impact": "Impact unclear without full AI analysis.",
          "key_facts": [f"Form: {form_type}"],
          "risk_factors": [],
          "classification_method": "rule_based"
      }

=============================================================
TASK 1 — CORRELATION ENGINE
=============================================================

Create backend/intelligence/correlation_engine.py:

  """
  Deterministic correlation engine.
  No LLM required — pure rule-based mapping.
  Maps a signal to related entities, sector effects, macro links.
  """
  from typing import Optional

  # ── Competitor map ──────────────────────────────────────────
  COMPETITORS = {
      "NVDA": ["AMD", "INTC", "QCOM"],
      "AMD":  ["NVDA", "INTC"],
      "INTC": ["NVDA", "AMD", "TSM"],
      "AAPL": ["MSFT", "GOOG", "SMSN"],
      "MSFT": ["AAPL", "GOOG", "AMZN"],
      "GOOG": ["MSFT", "META", "AAPL"],
      "META": ["GOOG", "SNAP", "PINS"],
      "AMZN": ["MSFT", "WMT", "GOOG"],
      "TSLA": ["RIVN", "GM", "F", "LCID", "NIO"],
      "COIN": ["SQ", "HOOD", "MSTR"],
      "NFLX": ["DIS", "WBD", "PARA"],
      "JPM":  ["BAC", "WFC", "GS", "MS"],
      "GS":   ["MS", "JPM", "BAC"],
      "XOM":  ["CVX", "COP", "BP"],
      "CVX":  ["XOM", "COP", "SHEL"],
      "LMT":  ["RTX", "NOC", "GD", "BA"],
      "WMT":  ["TGT", "COST", "AMZN"],
      "PFE":  ["MRK", "JNJ", "ABBV", "LLY"],
      "UNH":  ["CVS", "HUM", "CI"],
      "V":    ["MA", "PYPL", "AXP"],
      "CRM":  ["NOW", "MSFT", "SAP"],
      "SNOW": ["DDOG", "MDB", "AMZN"],
  }

  # ── Supply chain map ────────────────────────────────────────
  SUPPLY_CHAIN = {
      # NVDA suppliers / customers
      "NVDA": {
          "suppliers": ["TSM", "ASML", "LRCX", "KLAC", "AMAT"],
          "customers": ["MSFT", "GOOG", "META", "AMZN", "TSLA"],
      },
      "TSM": {
          "suppliers": ["ASML", "LRCX", "KLAC", "AMAT"],
          "customers": ["NVDA", "AMD", "AAPL", "QCOM", "INTC"],
      },
      "AAPL": {
          "suppliers": ["TSM", "QCOM", "SONY", "LG"],
          "customers": [],
      },
      "TSLA": {
          "suppliers": ["NVDA", "PANASONIC", "ALB", "SQM"],
          "customers": [],
      },
      "AMD": {
          "suppliers": ["TSM", "ASML"],
          "customers": ["MSFT", "SONY", "META"],
      },
      "XOM": {
          "suppliers": ["SLB", "HAL"],
          "customers": ["AAL", "DAL", "UAL", "FDX", "UPS"],
      },
  }

  # ── Sector map ──────────────────────────────────────────────
  TICKER_SECTOR = {
      # Semiconductors
      "NVDA":"Semiconductors","AMD":"Semiconductors",
      "INTC":"Semiconductors","TSM":"Semiconductors",
      "ASML":"Semiconductors","QCOM":"Semiconductors",
      "AVGO":"Semiconductors","LRCX":"Semiconductors",
      "KLAC":"Semiconductors","AMAT":"Semiconductors",
      "MU":"Semiconductors","MRVL":"Semiconductors",
      # Big Tech
      "AAPL":"Big Tech","MSFT":"Big Tech","GOOG":"Big Tech",
      "META":"Big Tech","AMZN":"Big Tech","NFLX":"Big Tech",
      # Cloud/SaaS
      "CRM":"Cloud","NOW":"Cloud","SNOW":"Cloud",
      "DDOG":"Cloud","NET":"Cloud","MDB":"Cloud",
      "ZS":"Cloud","OKTA":"Cloud",
      # Fintech
      "V":"Fintech","MA":"Fintech","PYPL":"Fintech",
      "SQ":"Fintech","COIN":"Fintech","AFRM":"Fintech",
      "HOOD":"Fintech",
      # EV/Auto
      "TSLA":"EV/Auto","RIVN":"EV/Auto","LCID":"EV/Auto",
      "GM":"EV/Auto","F":"EV/Auto","NIO":"EV/Auto",
      # Energy
      "XOM":"Energy","CVX":"Energy","COP":"Energy",
      "SLB":"Energy","HAL":"Energy","BP":"Energy",
      # Banking
      "JPM":"Banking","BAC":"Banking","WFC":"Banking",
      "GS":"Banking","MS":"Banking","C":"Banking",
      # Pharma/Bio
      "PFE":"Pharma","MRK":"Pharma","JNJ":"Pharma",
      "ABBV":"Pharma","LLY":"Pharma","GILD":"Pharma",
      "BMY":"Pharma","AMGN":"Pharma",
      # Defense
      "LMT":"Defense","RTX":"Defense","NOC":"Defense",
      "GD":"Defense","BA":"Defense","HII":"Defense",
      # Retail
      "WMT":"Retail","TGT":"Retail","COST":"Retail",
      "HD":"Retail","LOW":"Retail","AMZN":"Retail",
      # Airlines
      "AAL":"Airlines","DAL":"Airlines","UAL":"Airlines",
      "LUV":"Airlines","JBLU":"Airlines",
  }

  # ── Sector ripple rules ─────────────────────────────────────
  # When sector X has signal type Y, affect sector Z
  SECTOR_RIPPLE = {
      ("Semiconductors", "EARNINGS_BEAT"): [
          {"sector": "Big Tech", "direction": "positive",
           "reason": "Better chip supply reduces AI infrastructure costs"},
          {"sector": "Cloud", "direction": "positive",
           "reason": "Faster GPU availability accelerates cloud expansion"},
          {"sector": "EV/Auto", "direction": "positive",
           "reason": "Chip supply improves EV production capacity"},
      ],
      ("Semiconductors", "EARNINGS_MISS"): [
          {"sector": "Big Tech", "direction": "negative",
           "reason": "AI capex may slow if chip demand weakens"},
          {"sector": "Cloud", "direction": "negative",
           "reason": "Data center expansion may face headwinds"},
      ],
      ("Energy", "EARNINGS_BEAT"): [
          {"sector": "Airlines", "direction": "negative",
           "reason": "Higher energy prices increase jet fuel costs"},
          {"sector": "EV/Auto", "direction": "positive",
           "reason": "Oil price strength accelerates EV adoption narrative"},
          {"sector": "Defense", "direction": "positive",
           "reason": "Energy geopolitics drive defense spending"},
      ],
      ("Banking", "EARNINGS_BEAT"): [
          {"sector": "Fintech", "direction": "negative",
           "reason": "Strong bank results reduce fintech disruption narrative"},
          {"sector": "Big Tech", "direction": "positive",
           "reason": "Healthy credit markets support tech M&A activity"},
      ],
      ("Big Tech", "EARNINGS_BEAT"): [
          {"sector": "Cloud", "direction": "positive",
           "reason": "Enterprise cloud spend confirmed strong"},
          {"sector": "Semiconductors", "direction": "positive",
           "reason": "High AI spend confirms chip demand"},
      ],
      ("Pharma", "REGULATORY_ACTION"): [
          {"sector": "Pharma", "direction": "negative",
           "reason": "Regulatory risk reprices entire sector"},
      ],
      ("EV/Auto", "EARNINGS_MISS"): [
          {"sector": "Semiconductors", "direction": "negative",
           "reason": "Weaker EV demand reduces chip orders"},
          {"sector": "Energy", "direction": "positive",
           "reason": "EV slowdown delays oil demand decline"},
      ],
  }

  # ── Macro event rules ───────────────────────────────────────
  MACRO_RULES = {
      "INTEREST_RATE_HIKE": [
          {"sector": "Banking", "direction": "positive",
           "reason": "Higher rates improve net interest margin"},
          {"sector": "Big Tech", "direction": "negative",
           "reason": "Rate hikes compress growth stock multiples"},
          {"sector": "Fintech", "direction": "negative",
           "reason": "Higher cost of capital hurts lending fintechs"},
      ],
      "OIL_SPIKE": [
          {"sector": "Energy", "direction": "positive",
           "reason": "Direct revenue benefit from higher oil prices"},
          {"sector": "Airlines", "direction": "negative",
           "reason": "Jet fuel is 20-30% of airline operating costs"},
          {"sector": "EV/Auto", "direction": "positive",
           "reason": "Oil spike accelerates EV adoption"},
      ],
      "GEOPOLITICAL_CONFLICT": [
          {"sector": "Defense", "direction": "positive",
           "reason": "Conflict drives government defense spending"},
          {"sector": "Energy", "direction": "positive",
           "reason": "Supply disruption fears spike energy prices"},
      ],
  }


  def build_correlations(signal: dict, enrichment_data: dict) -> dict:
      """
      Main function — call after enrichment in signal_pipeline.py.
      Returns structured correlation data for DB storage.
      """
      ticker = signal.get("ticker", "").upper()
      event_type = signal.get("event_type", "")
      signal_direction = signal.get("signal", "Neutral")
      sector = TICKER_SECTOR.get(ticker, "Unknown")

      related_entities = []
      sector_links = []
      chain_reactions = []

      # ── 1. Competitor impact ───────────────────────────────
      for competitor in COMPETITORS.get(ticker, []):
          comp_sector = TICKER_SECTOR.get(competitor, sector)
          # Competitor impact is usually inverse
          direction = (
              "negative" if signal_direction == "Positive"
              else "positive" if signal_direction == "Risk"
              else "neutral"
          )
          related_entities.append({
              "ticker": competitor,
              "relationship": "competitor",
              "sector": comp_sector,
              "impact_direction": direction,
              "reason": (
                  f"{ticker} strength puts competitive pressure on "
                  f"{competitor}"
                  if signal_direction == "Positive"
                  else f"{ticker} weakness may benefit {competitor}"
              ),
              "confidence": 0.7,
          })

      # ── 2. Supply chain impact ─────────────────────────────
      sc = SUPPLY_CHAIN.get(ticker, {})
      
      for supplier in sc.get("suppliers", []):
          related_entities.append({
              "ticker": supplier,
              "relationship": "supplier",
              "sector": TICKER_SECTOR.get(supplier, "Unknown"),
              "impact_direction": (
                  "positive" if signal_direction == "Positive"
                  else "negative" if signal_direction == "Risk"
                  else "neutral"
              ),
              "reason": (
                  f"{ticker} growth drives higher orders for {supplier}"
                  if signal_direction == "Positive"
                  else f"{ticker} slowdown reduces orders from {supplier}"
              ),
              "confidence": 0.8,
          })
      
      for customer in sc.get("customers", []):
          related_entities.append({
              "ticker": customer,
              "relationship": "customer",
              "sector": TICKER_SECTOR.get(customer, "Unknown"),
              "impact_direction": (
                  "positive" if signal_direction == "Positive"
                  else "negative" if signal_direction == "Risk"
                  else "neutral"
              ),
              "reason": (
                  f"{ticker} supply improvement benefits {customer}"
                  if signal_direction == "Positive"
                  else f"{ticker} supply issues create risk for {customer}"
              ),
              "confidence": 0.75,
          })

      # ── 3. Sector ripple ───────────────────────────────────
      ripple_key = (sector, event_type)
      for ripple in SECTOR_RIPPLE.get(ripple_key, []):
          sector_links.append({
              "sector": ripple["sector"],
              "direction": ripple["direction"],
              "reason": ripple["reason"],
              "triggered_by": f"{ticker} {event_type}",
              "confidence": 0.65,
          })

      # ── 4. Chain reactions (immediate → secondary → ripple) ─
      if event_type == "EARNINGS_BEAT":
          chain_reactions = [
              {
                  "layer": "immediate",
                  "effect": f"{ticker} stock likely gaps up at open",
                  "timeframe": "0-24h",
              },
              {
                  "layer": "secondary",
                  "effect": (
                      f"Competitors ({', '.join(COMPETITORS.get(ticker, [])[:2])}) "
                      f"may face selling pressure"
                  ),
                  "timeframe": "1-3 days",
              },
              {
                  "layer": "sector_ripple",
                  "effect": f"{sector} sector ETF likely outperforms",
                  "timeframe": "1-5 days",
              },
          ]
      elif event_type == "EARNINGS_MISS":
          chain_reactions = [
              {
                  "layer": "immediate",
                  "effect": f"{ticker} stock likely gaps down at open",
                  "timeframe": "0-24h",
              },
              {
                  "layer": "secondary",
                  "effect": (
                      f"Analysts may downgrade sector peers. "
                      f"Watch: {', '.join(COMPETITORS.get(ticker, [])[:2])}"
                  ),
                  "timeframe": "1-3 days",
              },
              {
                  "layer": "sector_ripple",
                  "effect": f"Risk-off sentiment may spread across {sector}",
                  "timeframe": "2-7 days",
              },
          ]
      elif event_type in ("EXEC_DEPARTURE", "EXEC_HIRE"):
          chain_reactions = [
              {
                  "layer": "immediate",
                  "effect": "Volatility spike as market reprices leadership risk",
                  "timeframe": "0-48h",
              },
              {
                  "layer": "secondary",
                  "effect": "Strategy uncertainty may delay enterprise deals",
                  "timeframe": "1-4 weeks",
              },
          ]
      elif event_type == "ACTIVIST_ENTRY":
          chain_reactions = [
              {
                  "layer": "immediate",
                  "effect": "Stock premium on takeover/restructuring speculation",
                  "timeframe": "0-24h",
              },
              {
                  "layer": "secondary",
                  "effect": "Peers may see activist copycat positioning",
                  "timeframe": "1-4 weeks",
              },
          ]
      elif event_type == "MERGER_ACQUISITION":
          chain_reactions = [
              {
                  "layer": "immediate",
                  "effect": "Target stock premiums typically 20-40% on announcement",
                  "timeframe": "0-24h",
              },
              {
                  "layer": "secondary",
                  "effect": "Acquirer may face integration cost concerns",
                  "timeframe": "1-4 weeks",
              },
              {
                  "layer": "sector_ripple",
                  "effect": "M&A activity often triggers sector consolidation wave",
                  "timeframe": "1-6 months",
              },
          ]

      # ── 5. Macro links (from enrichment sentiment) ─────────
      macro_links = []
      news_theme = enrichment_data.get("news_dominant_theme", "")
      if "rate" in news_theme.lower() or "fed" in news_theme.lower():
          macro_links.extend(MACRO_RULES.get("INTEREST_RATE_HIKE", []))
      if "oil" in news_theme.lower() or "energy" in news_theme.lower():
          macro_links.extend(MACRO_RULES.get("OIL_SPIKE", []))

      return {
          "related_entities": related_entities[:10],  # cap at 10
          "sector_links": sector_links,
          "macro_links": macro_links,
          "chain_reactions": chain_reactions,
          "sector": sector,
          "correlation_version": "1.0",
      }

In signal_pipeline.py, after enrichment and before storage, add:

  from intelligence.correlation_engine import build_correlations

  # After enrichment:
  correlations = build_correlations(
      signal={
          "ticker": ticker,
          "event_type": classification.get("event_type", ""),
          "signal": classification.get("signal", "Neutral"),
      },
      enrichment_data=enrichment
  )

  # Add to signal_data before insert:
  signal_data["correlations"] = json.dumps(correlations)
  signal_data["related_entities"] = correlations["related_entities"]
  signal_data["chain_reactions"] = correlations["chain_reactions"]
  signal_data["sector"] = correlations["sector"]

Add these columns to Supabase signals table:
  ALTER TABLE signals ADD COLUMN IF NOT EXISTS 
    correlations JSONB DEFAULT '{}';
  ALTER TABLE signals ADD COLUMN IF NOT EXISTS 
    related_entities JSONB DEFAULT '[]';
  ALTER TABLE signals ADD COLUMN IF NOT EXISTS 
    chain_reactions JSONB DEFAULT '[]';
  ALTER TABLE signals ADD COLUMN IF NOT EXISTS 
    sector TEXT;
  ALTER TABLE signals ADD COLUMN IF NOT EXISTS 
    why_it_matters TEXT;
  ALTER TABLE signals ADD COLUMN IF NOT EXISTS 
    market_impact TEXT;

=============================================================
TASK 2 — CATEGORY MAPPER
=============================================================

Create backend/intelligence/category_mapper.py:

  TICKER_CATEGORIES = {
      "NVDA": {"primary":"Technology","secondary":["AI","Chips","Semiconductors"]},
      "AMD":  {"primary":"Technology","secondary":["AI","Chips","Semiconductors"]},
      "TSM":  {"primary":"Technology","secondary":["Chips","Manufacturing"]},
      "INTC": {"primary":"Technology","secondary":["Chips","Semiconductors"]},
      "ASML": {"primary":"Technology","secondary":["Chip Equipment","Semiconductors"]},
      "AAPL": {"primary":"Technology","secondary":["Consumer Tech","Mobile","Services"]},
      "MSFT": {"primary":"Technology","secondary":["Cloud","AI","Enterprise"]},
      "GOOG": {"primary":"Technology","secondary":["AI","Advertising","Cloud"]},
      "META": {"primary":"Technology","secondary":["Social Media","AI","Advertising"]},
      "AMZN": {"primary":"Technology","secondary":["Cloud","E-Commerce","Logistics"]},
      "NFLX": {"primary":"Technology","secondary":["Streaming","Media"]},
      "CRM":  {"primary":"Technology","secondary":["SaaS","Enterprise","CRM"]},
      "SNOW": {"primary":"Technology","secondary":["Cloud","Data","SaaS"]},
      "DDOG": {"primary":"Technology","secondary":["Cloud","Monitoring","SaaS"]},
      "NET":  {"primary":"Technology","secondary":["Cybersecurity","Cloud"]},
      "TSLA": {"primary":"EV/Auto","secondary":["Electric Vehicles","AI","Energy Storage"]},
      "RIVN": {"primary":"EV/Auto","secondary":["Electric Vehicles","Trucks"]},
      "GM":   {"primary":"Auto","secondary":["Electric Vehicles","Traditional Auto"]},
      "F":    {"primary":"Auto","secondary":["Electric Vehicles","Traditional Auto"]},
      "XOM":  {"primary":"Energy","secondary":["Oil & Gas","Refining"]},
      "CVX":  {"primary":"Energy","secondary":["Oil & Gas","Chemicals"]},
      "COP":  {"primary":"Energy","secondary":["Oil & Gas","Upstream"]},
      "JPM":  {"primary":"Financials","secondary":["Banking","Investment Banking"]},
      "GS":   {"primary":"Financials","secondary":["Investment Banking","Trading"]},
      "BAC":  {"primary":"Financials","secondary":["Banking","Consumer Finance"]},
      "V":    {"primary":"Financials","secondary":["Payments","Fintech"]},
      "MA":   {"primary":"Financials","secondary":["Payments","Fintech"]},
      "PYPL": {"primary":"Fintech","secondary":["Payments","Digital Wallet"]},
      "COIN": {"primary":"Fintech","secondary":["Crypto","Digital Assets"]},
      "PFE":  {"primary":"Healthcare","secondary":["Pharma","Vaccines"]},
      "LLY":  {"primary":"Healthcare","secondary":["Pharma","Obesity","Diabetes"]},
      "JNJ":  {"primary":"Healthcare","secondary":["Pharma","Medical Devices"]},
      "LMT":  {"primary":"Defense","secondary":["Aerospace","Military"]},
      "RTX":  {"primary":"Defense","secondary":["Aerospace","Missiles"]},
      "WMT":  {"primary":"Retail","secondary":["Grocery","E-Commerce"]},
      "COST": {"primary":"Retail","secondary":["Wholesale","Membership"]},
      "AAL":  {"primary":"Airlines","secondary":["Travel","Consumer Discretionary"]},
      "DAL":  {"primary":"Airlines","secondary":["Travel","Consumer Discretionary"]},
  }

  EVENT_TAGS = {
      "EARNINGS_BEAT":    ["earnings","beat","growth"],
      "EARNINGS_MISS":    ["earnings","miss","risk"],
      "GUIDANCE_RAISED":  ["guidance","growth","outlook"],
      "GUIDANCE_CUT":     ["guidance","risk","outlook"],
      "EXEC_DEPARTURE":   ["leadership","risk","change"],
      "EXEC_HIRE":        ["leadership","change"],
      "INSIDER_BUY":      ["insider","bullish"],
      "INSIDER_SELL":     ["insider","bearish"],
      "ACTIVIST_ENTRY":   ["activist","M&A","catalyst"],
      "MERGER_ACQUISITION":["M&A","acquisition","consolidation"],
      "DEBT_FINANCING":   ["debt","financing","capital"],
      "REGULATORY_ACTION":["regulation","risk","compliance"],
      "MATERIAL_WEAKNESS":["risk","accounting","compliance"],
      "LATE_FILING":      ["risk","compliance","red-flag"],
      "SHARE_BUYBACK":    ["buyback","capital-return","bullish"],
      "DIVIDEND_CHANGE":  ["dividend","income","capital-return"],
      "IPO_REGISTRATION": ["IPO","growth","new-issue"],
      "PRODUCT_LAUNCH":   ["product","growth","innovation"],
      "CONTRACT_WIN":     ["growth","revenue","B2B"],
      "ROUTINE_FILING":   ["routine","admin"],
  }


  def map_categories(ticker: str, event_type: str) -> dict:
      base = TICKER_CATEGORIES.get(
          ticker.upper(),
          {"primary": "Other", "secondary": []}
      )
      tags = EVENT_TAGS.get(event_type, ["filing"])
      return {
          "primary": base["primary"],
          "secondary": base["secondary"],
          "tags": tags,
      }

In signal_pipeline.py, import and call:

  from intelligence.category_mapper import map_categories

  categories = map_categories(ticker, 
      classification.get("event_type", "ROUTINE_FILING"))
  signal_data["category_primary"] = categories["primary"]
  signal_data["category_secondary"] = categories["secondary"]
  signal_data["tags"] = categories["tags"]

Add to signals table:
  ALTER TABLE signals ADD COLUMN IF NOT EXISTS 
    category_primary TEXT;
  ALTER TABLE signals ADD COLUMN IF NOT EXISTS 
    category_secondary JSONB DEFAULT '[]';
  ALTER TABLE signals ADD COLUMN IF NOT EXISTS 
    tags JSONB DEFAULT '[]';

=============================================================
TASK 3 — WHY IT MATTERS (already in Gemini prompt above)
=============================================================

The updated Gemini prompt already extracts:
  "why_it_matters": "cause → market effect"
  "market_impact": "which assets move and how"

In signal_pipeline.py add to signal_data:
  signal_data["why_it_matters"] = classification.get(
      "why_it_matters", ""
  )
  signal_data["market_impact"] = classification.get(
      "market_impact", ""
  )

For rule-based fallback, generate from event_type:

  WHY_TEMPLATES = {
      "EARNINGS_BEAT": (
          "{ticker} beat earnings because demand exceeded expectations "
          "→ stock premium, competitor repricing likely."
      ),
      "EARNINGS_MISS": (
          "{ticker} missed earnings due to weaker demand or higher costs "
          "→ stock discount, sector sentiment risk."
      ),
      "GUIDANCE_RAISED": (
          "{ticker} raised forward guidance → signals management confidence, "
          "drives multiple expansion."
      ),
      "GUIDANCE_CUT": (
          "{ticker} cut guidance → macro or demand headwind confirmed, "
          "expect multiple compression."
      ),
      "EXEC_DEPARTURE": (
          "Leadership change at {ticker} → strategy uncertainty, "
          "short-term volatility likely."
      ),
      "ACTIVIST_ENTRY": (
          "Activist investor in {ticker} → restructuring/sale pressure, "
          "premium likely in 30-90 days."
      ),
      "INSIDER_BUY": (
          "{ticker} insiders buying own stock → strongest bullish signal, "
          "management sees undervaluation."
      ),
      "INSIDER_SELL": (
          "{ticker} insider selling → may signal peak valuation or "
          "personal liquidity, watch volume."
      ),
      "LATE_FILING": (
          "{ticker} missed filing deadline → accounting issues suspected, "
          "high risk of restatement."
      ),
      "MERGER_ACQUISITION": (
          "{ticker} M&A activity → sector consolidation signal, "
          "peers may see takeover premium repricing."
      ),
  }

  def generate_why_it_matters(ticker: str, event_type: str) -> str:
      template = WHY_TEMPLATES.get(event_type, "")
      return template.format(ticker=ticker) if template else ""

=============================================================
TASK 4 — CHAIN REACTION ENGINE
=============================================================

Already built inside correlation_engine.py above 
(the chain_reactions field). 

Also expose via API:

  @app.get("/api/signals/{signal_id}/chain-reactions")
  async def get_chain_reactions(signal_id: str):
      result = await supabase_client.table("signals")\
          .select("ticker,chain_reactions,correlations,sector")\
          .eq("id", signal_id)\
          .single()\
          .execute()
      if not result.data:
          raise HTTPException(status_code=404, detail="Signal not found")
      return result.data

=============================================================
TASK 5 — NEWS INTELLIGENCE IMPROVEMENT
=============================================================

In agents/news_agent.py, upgrade the output structure:

  def process_news_results(articles: list, ticker: str) -> dict:
      """
      Extract structured news intelligence from raw articles.
      """
      if not articles:
          return {
              "theme": "No recent news",
              "sentiment": "neutral",
              "top_headlines": [],
              "news_dominant_theme": "",
              "news_sentiment": "neutral",
          }
      
      # Score sentiment per article
      POSITIVE_WORDS = [
          "beat", "surged", "soared", "record", "growth",
          "partnership", "breakthrough", "wins", "strong",
          "raises", "upgraded", "bullish"
      ]
      NEGATIVE_WORDS = [
          "miss", "fell", "dropped", "loss", "risk",
          "concern", "investigation", "downgrade", "bearish",
          "cut", "decline", "warning", "recall", "fine"
      ]
      
      scores = []
      headlines = []
      themes = []
      
      for article in articles[:10]:
          title = article.get("title", "")
          if not title:
              continue
          
          t_lower = title.lower()
          pos = sum(1 for w in POSITIVE_WORDS if w in t_lower)
          neg = sum(1 for w in NEGATIVE_WORDS if w in t_lower)
          
          score = pos - neg
          scores.append(score)
          headlines.append({
              "title": title,
              "source": article.get("publisher", {}).get("name", ""),
              "url": article.get("link", ""),
              "sentiment": (
                  "positive" if score > 0
                  else "negative" if score < 0
                  else "neutral"
              ),
              "published": article.get("providerPublishTime", ""),
          })
          
          # Theme detection
          if any(w in t_lower for w in ["earnings","revenue","profit","eps"]):
              themes.append("earnings")
          elif any(w in t_lower for w in ["deal","merger","acqui","partner"]):
              themes.append("M&A")
          elif any(w in t_lower for w in ["lawsuit","sec","investigate","fine"]):
              themes.append("regulatory")
          elif any(w in t_lower for w in ["product","launch","release","new"]):
              themes.append("product")
          elif any(w in t_lower for w in ["exec","ceo","cfo","appoint","resign"]):
              themes.append("leadership")
          else:
              themes.append("general")
      
      avg_score = sum(scores) / max(len(scores), 1)
      dominant_theme = max(
          set(themes), key=themes.count
      ) if themes else "general"
      
      overall_sentiment = (
          "positive" if avg_score > 0.3
          else "negative" if avg_score < -0.3
          else "neutral"
      )
      
      return {
          "theme": dominant_theme,
          "sentiment": overall_sentiment,
          "top_headlines": headlines[:3],
          "news_dominant_theme": dominant_theme,
          "news_sentiment": overall_sentiment,
          "news_score": round(avg_score, 2),
      }

=============================================================
TASK 6 — FRONTEND: AlertCard + SignalDetailModal
=============================================================

--- AlertCard.jsx ---

After the WHY line, add these new elements:

  {/* Category badges */}
  {signal.category_primary && (
    <div style={{display:'flex',gap:4,flexWrap:'wrap',marginTop:4}}>
      <span style={{
        fontSize:9,fontWeight:700,padding:'2px 6px',
        borderRadius:3,background:'var(--accent-blue-bg)',
        color:'var(--accent-blue)',border:'1px solid var(--accent-blue-border)'
      }}>
        {signal.category_primary}
      </span>
      {(signal.category_secondary || []).slice(0,2).map(cat => (
        <span key={cat} style={{
          fontSize:9,padding:'2px 6px',borderRadius:3,
          background:'var(--bg-hover)',color:'var(--text-tertiary)',
          border:'1px solid var(--border-default)'
        }}>
          {cat}
        </span>
      ))}
    </div>
  )}

  {/* Why it matters — 1 line */}
  {signal.why_it_matters && (
    <div style={{
      fontSize:11,color:'var(--text-secondary)',
      marginTop:5,lineHeight:1.4,
      borderLeft:'2px solid var(--accent-blue)',
      paddingLeft:7,fontStyle:'italic'
    }}>
      {signal.why_it_matters}
    </div>
  )}

  {/* Chain reaction preview */}
  {signal.chain_reactions?.length > 0 && (
    <div style={{
      marginTop:5,fontSize:10,color:'var(--text-muted)',
      display:'flex',alignItems:'center',gap:4
    }}>
      <span>↪</span>
      <span>{signal.chain_reactions[0]?.effect}</span>
    </div>
  )}

  {/* Related entities pills */}
  {signal.related_entities?.length > 0 && (
    <div style={{
      display:'flex',gap:4,marginTop:5,flexWrap:'wrap'
    }}>
      {signal.related_entities.slice(0,4).map(entity => (
        <span key={entity.ticker} style={{
          fontSize:9,padding:'1px 6px',borderRadius:3,
          fontFamily:'monospace',fontWeight:700,
          background: entity.impact_direction === 'positive'
            ? 'var(--signal-positive-bg)'
            : entity.impact_direction === 'negative'
              ? 'var(--signal-risk-bg)'
              : 'var(--bg-card)',
          color: entity.impact_direction === 'positive'
            ? 'var(--signal-positive)'
            : entity.impact_direction === 'negative'
              ? 'var(--signal-risk)'
              : 'var(--text-muted)',
          border:'1px solid var(--border-default)'
        }}>
          {entity.impact_direction === 'positive' ? '↑' : 
           entity.impact_direction === 'negative' ? '↓' : '→'} 
          {entity.ticker}
        </span>
      ))}
    </div>
  )}

--- SignalDetailModal.jsx ---

Add two new sections after existing enrichment sections:

  {/* WHY IT MATTERS section */}
  {(signal.why_it_matters || signal.market_impact) && (
    <div style={{
      background:'var(--bg-card)',
      border:'1px solid var(--border-default)',
      borderRadius:8,padding:14,marginBottom:12
    }}>
      <div style={{
        fontSize:10,fontWeight:700,color:'var(--text-muted)',
        textTransform:'uppercase',letterSpacing:'0.08em',
        marginBottom:10
      }}>
        WHY IT MATTERS
      </div>
      {signal.why_it_matters && (
        <p style={{
          fontSize:13,color:'var(--text-primary)',
          lineHeight:1.6,margin:0,
          borderLeft:'3px solid var(--accent-blue)',paddingLeft:10
        }}>
          {signal.why_it_matters}
        </p>
      )}
      {signal.market_impact && (
        <p style={{
          fontSize:12,color:'var(--text-secondary)',
          lineHeight:1.5,margin:'8px 0 0',paddingLeft:13
        }}>
          {signal.market_impact}
        </p>
      )}
    </div>
  )}

  {/* CHAIN REACTIONS section */}
  {signal.chain_reactions?.length > 0 && (
    <div style={{
      background:'var(--bg-card)',
      border:'1px solid var(--border-default)',
      borderRadius:8,padding:14,marginBottom:12
    }}>
      <div style={{
        fontSize:10,fontWeight:700,color:'var(--text-muted)',
        textTransform:'uppercase',letterSpacing:'0.08em',
        marginBottom:10
      }}>
        CHAIN REACTIONS
      </div>
      {signal.chain_reactions.map((reaction, i) => (
        <div key={i} style={{
          display:'flex',gap:10,marginBottom:8,
          paddingBottom:8,
          borderBottom: i < signal.chain_reactions.length-1 
            ? '1px solid var(--border-default)' : 'none'
        }}>
          <div style={{
            fontSize:9,fontWeight:700,padding:'2px 6px',
            borderRadius:3,background:'var(--bg-hover)',
            color:'var(--text-muted)',whiteSpace:'nowrap',
            height:'fit-content',textTransform:'uppercase'
          }}>
            {reaction.layer}
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:12,color:'var(--text-primary)'}}>
              {reaction.effect}
            </div>
            <div style={{
              fontSize:10,color:'var(--text-muted)',marginTop:2,
              fontFamily:'monospace'
            }}>
              {reaction.timeframe}
            </div>
          </div>
        </div>
      ))}
    </div>
  )}

  {/* RELATED ENTITIES section */}
  {signal.related_entities?.length > 0 && (
    <div style={{
      background:'var(--bg-card)',
      border:'1px solid var(--border-default)',
      borderRadius:8,padding:14,marginBottom:12
    }}>
      <div style={{
        fontSize:10,fontWeight:700,color:'var(--text-muted)',
        textTransform:'uppercase',letterSpacing:'0.08em',
        marginBottom:10
      }}>
        MARKET RIPPLE
      </div>
      {signal.related_entities.slice(0,6).map((entity, i) => (
        <div key={i} style={{
          display:'flex',alignItems:'center',gap:10,
          padding:'6px 0',
          borderBottom: i < Math.min(signal.related_entities.length,6)-1
            ? '1px solid var(--border-default)' : 'none'
        }}>
          <span style={{
            fontSize:12,fontWeight:700,fontFamily:'monospace',
            color:'var(--text-primary)',width:44
          }}>
            {entity.ticker}
          </span>
          <span style={{
            fontSize:9,padding:'1px 5px',borderRadius:3,
            background: entity.impact_direction === 'positive'
              ? 'var(--signal-positive-bg)'
              : entity.impact_direction === 'negative'
                ? 'var(--signal-risk-bg)'
                : 'var(--bg-hover)',
            color: entity.impact_direction === 'positive'
              ? 'var(--signal-positive)'
              : entity.impact_direction === 'negative'
                ? 'var(--signal-risk)'
                : 'var(--text-muted)',
            fontWeight:700,whiteSpace:'nowrap'
          }}>
            {entity.impact_direction === 'positive' ? '↑ BENEFIT'
             : entity.impact_direction === 'negative' ? '↓ RISK'
             : '→ WATCH'}
          </span>
          <span style={{
            fontSize:11,color:'var(--text-secondary)',
            flex:1,lineHeight:1.4
          }}>
            {entity.reason}
          </span>
          <span style={{
            fontSize:9,color:'var(--text-muted)',
            fontFamily:'monospace',whiteSpace:'nowrap'
          }}>
            {entity.relationship}
          </span>
        </div>
      ))}
    </div>
  )}

=============================================================
FINAL VERIFICATION
=============================================================

After all tasks complete, run this end-to-end test:

  curl -X POST http://localhost:8001/api/demo/trigger-all \
    -H "Content-Type: application/json" \
    -d '{"ticker": "NVDA"}'

Watch logs. You must see ALL of these — not a single one missing:

  ✓ TinyFish extracted N chars  (or fallback method used)
  ✓ Classifying N chars...
  ✓ Gemini: [Positive/Risk/Neutral] conf:[50+] event:[EVENT_TYPE]
  ✓ Building correlations...
  ✓ Related entities: N found
  ✓ Chain reactions: N generated
  ✓ why_it_matters: [text present]
  ✓ Categories: Technology → [AI, Chips]
  ✓ STORED signal [id] — [signal] conf:[50+] impact:[score]

If conf:0 still appears after this — paste the exact 
Gemini error from the new logging and the model list 
output from the diagnostic test.

Report back: files changed, DB columns added, 
and a sample stored signal JSON showing all new fields.