# intelligence/category_mapper.py
# Purpose: Maps ticker + event_type to display categories and tags
# Called from signal_pipeline after classification

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
    "EARNINGS_BEAT":     ["earnings","beat","growth"],
    "EARNINGS_MISS":     ["earnings","miss","risk"],
    "GUIDANCE_RAISED":   ["guidance","growth","outlook"],
    "GUIDANCE_CUT":      ["guidance","risk","outlook"],
    "EXEC_DEPARTURE":    ["leadership","risk","change"],
    "EXEC_HIRE":         ["leadership","change"],
    "INSIDER_BUY":       ["insider","bullish"],
    "INSIDER_SELL":      ["insider","bearish"],
    "ACTIVIST_ENTRY":    ["activist","M&A","catalyst"],
    "MERGER_ACQUISITION":["M&A","acquisition","consolidation"],
    "DEBT_FINANCING":    ["debt","financing","capital"],
    "REGULATORY_ACTION": ["regulation","risk","compliance"],
    "MATERIAL_WEAKNESS": ["risk","accounting","compliance"],
    "LATE_FILING":       ["risk","compliance","red-flag"],
    "SHARE_BUYBACK":     ["buyback","capital-return","bullish"],
    "DIVIDEND_CHANGE":   ["dividend","income","capital-return"],
    "IPO_REGISTRATION":  ["IPO","growth","new-issue"],
    "PRODUCT_LAUNCH":    ["product","growth","innovation"],
    "CONTRACT_WIN":      ["growth","revenue","B2B"],
    "ROUTINE_FILING":    ["routine","admin"],
}

WHY_TEMPLATES = {
    "EARNINGS_BEAT": "{ticker} beat earnings because demand exceeded expectations → stock premium, competitor repricing likely.",
    "EARNINGS_MISS": "{ticker} missed earnings due to weaker demand or higher costs → stock discount, sector sentiment risk.",
    "GUIDANCE_RAISED": "{ticker} raised forward guidance → signals management confidence, drives multiple expansion.",
    "GUIDANCE_CUT": "{ticker} cut guidance → macro or demand headwind confirmed, expect multiple compression.",
    "EXEC_DEPARTURE": "Leadership change at {ticker} → strategy uncertainty, short-term volatility likely.",
    "ACTIVIST_ENTRY": "Activist investor in {ticker} → restructuring/sale pressure, premium likely in 30-90 days.",
    "INSIDER_BUY": "{ticker} insiders buying own stock → strongest bullish signal, management sees undervaluation.",
    "INSIDER_SELL": "{ticker} insider selling → may signal peak valuation or personal liquidity, watch volume.",
    "LATE_FILING": "{ticker} missed filing deadline → accounting issues suspected, high risk of restatement.",
    "MERGER_ACQUISITION": "{ticker} M&A activity → sector consolidation signal, peers may see takeover premium repricing.",
}


def map_categories(ticker: str, event_type: str) -> dict:
    base = TICKER_CATEGORIES.get(ticker.upper(), {"primary": "Other", "secondary": []})
    tags = EVENT_TAGS.get(event_type, ["filing"])
    return {
        "primary": base["primary"],
        "secondary": base["secondary"],
        "tags": tags,
    }


def generate_why_it_matters(ticker: str, event_type: str) -> str:
    template = WHY_TEMPLATES.get(event_type, "")
    return template.format(ticker=ticker) if template else ""
