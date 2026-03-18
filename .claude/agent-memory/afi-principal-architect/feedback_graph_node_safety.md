---
name: Graph node safety pattern for react-force-graph-2d
description: How to prevent "node not found" errors in the correlation graph
type: feedback
---

react-force-graph-2d throws "node not found: TICKER" when a link references a node ID that doesn't exist in the nodes array.

**Why:** `SUPPLY_CHAIN` in `correlation_engine.py` includes tickers like `ASML`, `PANASONIC`, `HAL`, `IBM`, `SWKS` as suppliers/customers that are NOT in `SECTOR_MAP`. The backend already filters these out in `build_graph_data()` with `if supplier not in nodes: continue`. But the frontend adds a second layer of protection.

**How to apply (frontend guard in Graph.jsx):**
1. Build `nodeIdSet = new Set(data.nodes.map(n => n.id))` BEFORE processing edges
2. Filter edges: `.filter(e => nodeIdSet.has(e.source) && nodeIdSet.has(e.target))`
3. THEN filter nodes to only connected ones
4. Also add an empty state when `filteredData.nodes.length === 0` after sector filter

**Backend invariant:**
- `SECTOR_MAP` is the authoritative set of valid graph nodes
- Any ticker in `SUPPLY_CHAIN` that is not in `SECTOR_MAP` will be silently skipped
- This is intentional — ASML (Dutch semiconductor equipment) is in supply chain data but not tracked as a monitored sector node
