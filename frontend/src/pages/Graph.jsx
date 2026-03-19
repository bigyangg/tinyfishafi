// Graph.jsx — Bloomberg 3-Panel Correlation Network
// Force-graph visualization: sectors/signals left | graph center | node detail right
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Sector colors — Title Case keys matching backend TICKER_SECTOR values
const SECTOR_COLORS = {
    'Semiconductors': '#818cf8',
    'Big Tech':       '#38bdf8',
    'AI/Software':    '#a78bfa',
    'Fintech':        '#4ade80',
    'Banking':        '#34d399',
    'Healthcare':     '#f472b6',
    'Energy':         '#fb923c',
    'Retail':         '#fbbf24',
    'Aerospace':      '#94a3b8',
    'Crypto':         '#f59e0b',
    'ETF':            '#6b7280',
    // Legacy keys from old correlation_engine
    'Cloud':          '#38bdf8',
    'Pharma':         '#f472b6',
    'EV/Auto':        '#fb923c',
    'Defense':        '#94a3b8',
    'Airlines':       '#94a3b8',
};

const SIGNAL_COLORS = {
    Positive: '#34D399',
    Risk:     '#F87171',
    Neutral:  '#94A3B8',
};

const LINK_TYPE_COLORS = {
    competitor:   { badge: '#6366f1', label: 'COMPETITOR' },
    supply_chain: { badge: '#a855f7', label: 'SUPPLY CHAIN' },
    customer:     { badge: '#22d3ee', label: 'CUSTOMER' },
    peer:         { badge: '#64748b', label: 'PEER' },
};

const SECTOR_POSITIONS = {
    'Semiconductors': { x: -280, y: -180 },
    'Big Tech':       { x:  200, y: -200 },
    'AI/Software':    { x:   80, y: -300 },
    'Cloud':          { x:   80, y: -300 },
    'Pharma':         { x: -260, y:  160 },
    'Healthcare':     { x: -260, y:  160 },
    'Fintech':        { x:  260, y:  180 },
    'EV/Auto':        { x:    0, y:  280 },
    'Energy':         { x: -180, y:  280 },
    'Banking':        { x:  180, y:  260 },
    'Defense':        { x: -300, y:    0 },
    'Aerospace':      { x: -300, y:    0 },
    'Retail':         { x:  320, y:    0 },
    'Crypto':         { x:  100, y:  300 },
    'ETF':            { x:    0, y:    0 },
    'Airlines':       { x:    0, y:  160 },
};

export default function Graph() {
    const [graphData, setGraphData] = useState({ nodes: [], links: [] });
    const [loading, setLoading] = useState(true);
    const [selectedNode, setSelectedNode] = useState(null);
    const [hoveredNode, setHoveredNode] = useState(null);
    const [sectorFilter, setSectorFilter] = useState(null);
    const [linkTypeFilter, setLinkTypeFilter] = useState(null);
    const [sectors, setSectors] = useState([]);
    const [nodeSignalHistory, setNodeSignalHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [sweeping, setSweeping] = useState(false);
    const [sweepStatus, setSweepStatus] = useState(null); // null | 'running' | 'done' | 'error'
    const [nodeLatestSignal, setNodeLatestSignal] = useState(null);
    const graphRef = useRef();
    const centerRef = useRef();
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
    const pulseNodes = useRef(new Set());

    const handleEngineStart = useCallback(() => {
        const fg = graphRef.current;
        if (!fg) return;

        fg.d3Force('cluster', alpha => {
            (graphData.nodes || []).forEach(node => {
                const target = SECTOR_POSITIONS[node.sector];
                if (!target) return;
                node.vx = (node.vx || 0) + (target.x - (node.x || 0)) * 0.04 * alpha;
                node.vy = (node.vy || 0) + (target.y - (node.y || 0)) * 0.04 * alpha;
            });
        });

        const chargeForce = fg.d3Force('charge');
        if (chargeForce) {
            chargeForce.strength(node => (node.hasSignal || node.has_signal) ? -200 : -120);
        }

        const linkForce = fg.d3Force('link');
        if (linkForce) {
            linkForce
                .distance(link => {
                    if (link.type === 'supply_chain') return 50;
                    if (link.type === 'competitor') return 60;
                    if (link.type === 'customer') return 80;
                    if (link.type === 'peer') return 45;
                    return 65;
                })
                .strength(link => {
                    if (link.type === 'supply_chain') return 0.8;
                    if (link.type === 'peer') return 0.6;
                    return 0.4;
                });
        }

        const centerForce = fg.d3Force('center');
        if (centerForce) centerForce.strength(0.03);

        fg.d3ReheatSimulation();
        setTimeout(() => { if (graphRef.current) graphRef.current.zoomToFit(400, 60); }, 3500);
    }, [graphData]);

    // Fetch graph data
    useEffect(() => {
        const fetchGraph = async () => {
            try {
                const res = await axios.get(`${API}/correlations/graph`);
                const data = res.data;

                const rawLinks = data.links || data.edges || [];
                const rawNodes = (data.nodes || []).filter(n => n.id && n.label);
                const nodeIdSet = new Set(rawNodes.map(n => n.id));

                const links = rawLinks
                    .filter(e => nodeIdSet.has(e.source) && nodeIdSet.has(e.target))
                    .map(e => ({ ...e }));

                const nodes = rawNodes.map(n => ({ ...n }));

                setGraphData({ nodes, links });

                // Derive unique sectors from nodes
                const sectorSet = new Set(nodes.map(n => n.sector).filter(Boolean));
                setSectors([...sectorSet].sort());

                // Mark pulsing nodes
                nodes.forEach(n => {
                    if (n.has_signal || n.hasSignal) {
                        pulseNodes.current.add(n.id);
                    }
                });

                setLoading(false);
            } catch (e) {
                console.error('Graph fetch failed:', e);
                setLoading(false);
            }
        };
        fetchGraph();
    }, []);

    // Center panel dimensions
    useEffect(() => {
        const updateDimensions = () => {
            if (centerRef.current) {
                setDimensions({
                    width: centerRef.current.offsetWidth,
                    height: centerRef.current.offsetHeight,
                });
            }
        };
        updateDimensions();
        window.addEventListener('resize', updateDimensions);
        return () => window.removeEventListener('resize', updateDimensions);
    }, []);

    // Debounce sector filter
    const debounceRef = useRef(null);
    const handleSectorClick = useCallback((sector) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => setSectorFilter(sector), 150);
    }, []);

    // Filtered data
    const filteredData = useMemo(() => {
        let nodes = graphData.nodes;
        let links = graphData.links;

        if (sectorFilter) {
            nodes = nodes.filter(n => n.sector === sectorFilter);
            const nodeIds = new Set(nodes.map(n => n.id));
            links = links.filter(l => {
                const src = typeof l.source === 'string' ? l.source : l.source?.id;
                const tgt = typeof l.target === 'string' ? l.target : l.target?.id;
                return nodeIds.has(src) && nodeIds.has(tgt);
            });
        }

        if (linkTypeFilter) {
            links = links.filter(l => l.type === linkTypeFilter);
        }

        return { nodes, links };
    }, [graphData, sectorFilter, linkTypeFilter]);

    // Sector node counts
    const sectorCounts = useMemo(() => {
        const counts = {};
        graphData.nodes.forEach(n => {
            if (n.sector) counts[n.sector] = (counts[n.sector] || 0) + 1;
        });
        return counts;
    }, [graphData]);

    // Active signal nodes sorted by impact_score
    const activeSignalNodes = useMemo(() => {
        return graphData.nodes
            .filter(n => n.hasSignal || n.has_signal)
            .sort((a, b) => (b.impact_score || 0) - (a.impact_score || 0));
    }, [graphData]);

    // Connected nodes for selected node
    const connectedNodes = useMemo(() => {
        if (!selectedNode) return [];
        const connections = [];
        graphData.links.forEach(l => {
            const src = typeof l.source === 'object' ? l.source?.id : l.source;
            const tgt = typeof l.target === 'object' ? l.target?.id : l.target;
            const nodeId = selectedNode.id || selectedNode.label;
            if (src === nodeId) {
                const target = graphData.nodes.find(n => n.id === tgt);
                if (target) connections.push({ node: target, type: l.type, value: l.value || 0 });
            } else if (tgt === nodeId) {
                const source = graphData.nodes.find(n => n.id === src);
                if (source) connections.push({ node: source, type: l.type, value: l.value || 0 });
            }
        });
        return connections.slice(0, 8);
    }, [selectedNode, graphData]);

    // Node canvas painter
    const paintNode = useCallback((node, ctx) => {
        const hasSignal = node.hasSignal || node.has_signal;
        const nodeId = node.id || node.label || '??';
        const nodeName = node.name || '';
        const size = hasSignal ? 8 : 5;
        const color = SECTOR_COLORS[node.sector] || '#94A3B8';
        const signalColor = node.signal ? SIGNAL_COLORS[node.signal] : null;

        if (hasSignal) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, size + 4, 0, 2 * Math.PI);
            ctx.fillStyle = (signalColor || color) + '15';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(node.x, node.y, size + 2, 0, 2 * Math.PI);
            ctx.fillStyle = (signalColor || color) + '30';
            ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
        ctx.fillStyle = signalColor || color;
        ctx.fill();

        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        const isLight = document.body.classList.contains('theme-light');
        const labelColor = hasSignal
            ? (isLight ? '#1E2330' : '#E2E8F0')
            : '#64748B';

        ctx.font = `${hasSignal ? '8' : '6'}px JetBrains Mono`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = labelColor;
        ctx.fillText(nodeId, node.x, node.y + size + 2);

        if (hasSignal && nodeName && nodeName !== nodeId) {
            ctx.font = '5px Inter';
            ctx.fillStyle = isLight ? '#64748B' : '#475569';
            ctx.fillText(
                nodeName.length > 18 ? nodeName.slice(0, 17) + '\u2026' : nodeName,
                node.x,
                node.y + size + 12,
            );
        }

        if (hasSignal && node.impact_score > 0) {
            ctx.font = '5px JetBrains Mono';
            ctx.fillStyle = signalColor || '#94A3B8';
            ctx.fillText(Math.round(node.impact_score).toString(), node.x, node.y + size + (nodeName ? 21 : 11));
        }
    }, []);

    const getLinkColor = useCallback((link) => {
        const isActive = !sectorFilter || sectorFilter === 'ALL' ||
            link.source?.sector === sectorFilter ||
            link.target?.sector === sectorFilter;
        const opacity = isActive ? 1 : 0.05;

        const colors = {
            supply_chain: `rgba(124,58,237,${0.5 * opacity})`,
            competitor:   `rgba(14,165,233,${0.35 * opacity})`,
            customer:     `rgba(52,211,153,${0.3 * opacity})`,
            peer:         `rgba(71,85,105,${0.25 * opacity})`,
        };
        return colors[link.type] || `rgba(71,85,105,${0.2 * opacity})`;
    }, [sectorFilter]);

    const getLinkWidth = useCallback((link) => {
        const widths = { supply_chain: 2.0, competitor: 1.2, customer: 1.5, peer: 0.6 };
        return widths[link.type] || 0.6;
    }, []);

    const paintLink = useCallback((link, ctx) => {
        const sourceNode = typeof link.source === 'object' ? link.source : null;
        const targetNode = typeof link.target === 'object' ? link.target : null;
        if (!sourceNode || !targetNode) return;

        ctx.beginPath();
        ctx.moveTo(sourceNode.x, sourceNode.y);
        ctx.lineTo(targetNode.x, targetNode.y);
        ctx.strokeStyle = getLinkColor(link);
        ctx.lineWidth = getLinkWidth(link);
        ctx.stroke();
    }, [getLinkColor, getLinkWidth]);

    const handleNodeClick = useCallback((node) => {
        setSelectedNode(node);
        setNodeSignalHistory([]);
        setNodeLatestSignal(null);
        if (graphRef.current) {
            graphRef.current.centerAt(node.x, node.y, 400);
            graphRef.current.zoom(3, 400);
        }
        setHistoryLoading(true);
        const nodeId = node.id || node.label;
        axios.get(`${API}/signals?tickers=${nodeId}&limit=5`)
            .then(res => {
                const data = Array.isArray(res.data) ? res.data : (res.data?.signals || []);
                const signals = data.slice(0, 5);
                setNodeSignalHistory(signals);
                // Fetch full detail for latest signal (enrichment fields)
                if (signals.length > 0 && signals[0].id) {
                    axios.get(`${API}/signals/${signals[0].id}`)
                        .then(r => setNodeLatestSignal(r.data))
                        .catch(() => setNodeLatestSignal(signals[0]));
                }
            })
            .catch(() => setNodeSignalHistory([]))
            .finally(() => setHistoryLoading(false));
    }, []);

    const handleTriggerSweep = async () => {
        if (!selectedNode?.id || sweeping) return;
        const ticker = selectedNode.id;
        setSweeping(true);
        setSweepStatus('running');
        try {
            const r = await fetch(
                `${process.env.REACT_APP_BACKEND_URL}/api/demo/trigger-all`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ticker }),
                }
            );
            if (!r.ok) {
                const err = await r.text();
                throw new Error(`HTTP ${r.status}: ${err}`);
            }
            const data = await r.json();
            console.log('Sweep started:', data);
            setSweepStatus('done');
            setTimeout(() => { setSweeping(false); setSweepStatus(null); }, 5000);
        } catch (e) {
            console.error('Sweep error:', e);
            setSweepStatus('error');
            setTimeout(() => { setSweeping(false); setSweepStatus(null); }, 3000);
        }
    };

    const panelBorder = '1px solid var(--border-default)';
    const labelStyle = { fontSize: '9px', letterSpacing: '0.1em', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 };

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: '220px 1fr 260px',
            height: '100vh',
            overflow: 'hidden',
            background: 'var(--bg-base)',
            fontFamily: "'JetBrains Mono', monospace",
        }}>
            {/* ── LEFT PANEL ── */}
            <div style={{
                borderRight: panelBorder,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                background: 'var(--bg-surface)',
            }}>
                {/* Sectors header */}
                <div style={{ padding: '10px 12px 6px', borderBottom: panelBorder, flexShrink: 0 }}>
                    <span style={labelStyle}>SECTORS</span>
                </div>

                {/* Sector list */}
                <div style={{ overflowY: 'auto', flexShrink: 0, maxHeight: '240px' }}>
                    {/* All sectors option */}
                    <div
                        onClick={() => handleSectorClick(null)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '6px 12px', cursor: 'pointer',
                            background: !sectorFilter ? 'var(--accent-blue-bg)' : 'transparent',
                            borderLeft: `2px solid ${!sectorFilter ? 'var(--accent-blue)' : 'transparent'}`,
                            transition: 'background 80ms',
                        }}
                    >
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--text-muted)', flexShrink: 0 }} />
                        <span style={{ fontSize: '10px', color: !sectorFilter ? 'var(--accent-blue)' : 'var(--text-secondary)', flex: 1 }}>All Sectors</span>
                        <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                            {graphData.nodes.length}
                        </span>
                    </div>
                    {sectors.map(sector => (
                        <div
                            key={sector}
                            onClick={() => handleSectorClick(sectorFilter === sector ? null : sector)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '6px 12px', cursor: 'pointer',
                                background: sectorFilter === sector ? (SECTOR_COLORS[sector] || '#475569') + '15' : 'transparent',
                                borderLeft: `2px solid ${sectorFilter === sector ? (SECTOR_COLORS[sector] || '#475569') : 'transparent'}`,
                                transition: 'background 80ms',
                            }}
                        >
                            <div style={{
                                width: '6px', height: '6px', borderRadius: '50%',
                                background: SECTOR_COLORS[sector] || '#475569',
                                flexShrink: 0,
                            }} />
                            <span style={{
                                fontSize: '10px',
                                color: sectorFilter === sector ? (SECTOR_COLORS[sector] || 'var(--text-secondary)') : 'var(--text-secondary)',
                                flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                                {sector}
                            </span>
                            <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                                {sectorCounts[sector] || 0}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Divider */}
                <div style={{ borderTop: panelBorder, flexShrink: 0 }} />

                {/* Active Signals */}
                <div style={{ padding: '10px 12px 6px', borderBottom: panelBorder, flexShrink: 0 }}>
                    <span style={labelStyle}>ACTIVE SIGNALS</span>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {loading && (
                        <div style={{ padding: '16px 12px', fontSize: '9px', color: 'var(--text-muted)' }}>Loading...</div>
                    )}
                    {!loading && activeSignalNodes.length === 0 && (
                        <div style={{ padding: '16px 12px', fontSize: '9px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            No active signals
                        </div>
                    )}
                    {activeSignalNodes.map(node => (
                        <div
                            key={node.id}
                            onClick={() => handleNodeClick(node)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '6px 12px', cursor: 'pointer',
                                background: selectedNode?.id === node.id ? 'var(--bg-card)' : 'transparent',
                                borderLeft: `2px solid ${selectedNode?.id === node.id ? 'var(--accent-blue)' : 'transparent'}`,
                                transition: 'background 80ms',
                            }}
                        >
                            <span style={{
                                fontSize: '10px', fontWeight: 700,
                                color: 'var(--text-primary)',
                                fontFamily: "'JetBrains Mono', monospace",
                                minWidth: '36px',
                            }}>
                                {node.id}
                            </span>
                            <div style={{
                                fontSize: '8px', padding: '1px 5px',
                                background: (SIGNAL_COLORS[node.signal] || '#94A3B8') + '20',
                                color: SIGNAL_COLORS[node.signal] || '#94A3B8',
                                border: `1px solid ${(SIGNAL_COLORS[node.signal] || '#94A3B8')}40`,
                                borderRadius: '2px', letterSpacing: '0.06em', flexShrink: 0,
                            }}>
                                {node.signal}
                            </div>
                            <span style={{ fontSize: '9px', color: 'var(--text-muted)', marginLeft: 'auto', fontFamily: "'JetBrains Mono', monospace" }}>
                                {node.impact_score != null ? Math.round(node.impact_score) : '—'}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── CENTER PANEL ── */}
            <div ref={centerRef} style={{ position: 'relative', overflow: 'hidden', background: 'var(--bg-base)' }}>
                {/* Top bar */}
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
                    padding: '8px 12px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'linear-gradient(180deg, var(--bg-base) 50%, transparent)',
                    pointerEvents: 'none',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-primary)', letterSpacing: '0.12em', fontWeight: 700 }}>
                            CORRELATION NETWORK
                        </span>
                        <span style={{
                            fontSize: '9px', color: 'var(--text-tertiary)',
                            background: 'var(--bg-card)', border: '1px solid var(--border-default)',
                            padding: '2px 7px', borderRadius: '10px',
                        }}>
                            {filteredData.nodes.length} entities · {filteredData.links.length} connections · {activeSignalNodes.length} signals
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', pointerEvents: 'auto' }}>
                        {Object.entries(SIGNAL_COLORS).map(([type, color]) => (
                            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: color }} />
                                <span style={{ fontSize: '8px', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>{type.toUpperCase()}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Link type filter pills */}
                <div style={{
                    position: 'absolute', top: '36px', left: '12px', zIndex: 10,
                    display: 'flex', gap: '4px',
                }}>
                    {['All', 'competitor', 'supply_chain', 'peer'].map(type => {
                        const isActive = type === 'All' ? !linkTypeFilter : linkTypeFilter === type;
                        const info = LINK_TYPE_COLORS[type];
                        return (
                            <button
                                key={type}
                                onClick={() => setLinkTypeFilter(type === 'All' ? null : (linkTypeFilter === type ? null : type))}
                                style={{
                                    background: isActive ? (info?.badge || 'var(--accent-blue)') + '20' : 'var(--bg-card)',
                                    border: `1px solid ${isActive ? (info?.badge || 'var(--accent-blue)') : 'var(--border-default)'}`,
                                    color: isActive ? (info?.badge || 'var(--accent-blue)') : 'var(--text-muted)',
                                    padding: '2px 7px', fontSize: '7px', cursor: 'pointer',
                                    fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.06em',
                                    borderRadius: '10px', textTransform: 'uppercase', transition: 'all 120ms',
                                }}
                            >
                                {type === 'All' ? 'ALL' : (info?.label || type)}
                            </button>
                        );
                    })}
                </div>

                {/* Loading */}
                {loading && (
                    <div style={{
                        position: 'absolute', inset: 0, display: 'flex',
                        alignItems: 'center', justifyContent: 'center', zIndex: 20,
                    }}>
                        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', letterSpacing: '0.12em' }}>
                            LOADING CORRELATION GRAPH...
                        </div>
                    </div>
                )}

                {/* FIT button */}
                {!loading && (
                    <button
                        onClick={() => graphRef.current?.zoomToFit(400, 60)}
                        style={{
                            position: 'absolute', bottom: '16px', right: '16px', zIndex: 10,
                            background: 'var(--bg-card)', border: '1px solid var(--border-default)',
                            color: 'var(--text-secondary)', padding: '5px 10px',
                            borderRadius: '4px', cursor: 'pointer', fontSize: '10px',
                            fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.06em',
                            transition: 'all 120ms',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                    >
                        FIT
                    </button>
                )}

                {/* Force graph */}
                {!loading && filteredData.nodes.length > 0 && (
                    <ForceGraph2D
                        ref={graphRef}
                        graphData={filteredData}
                        width={dimensions.width}
                        height={dimensions.height}
                        backgroundColor="transparent"
                        nodeCanvasObject={paintNode}
                        nodePointerAreaPaint={(node, color, ctx) => {
                            ctx.beginPath();
                            ctx.arc(node.x, node.y, 10, 0, 2 * Math.PI);
                            ctx.fillStyle = color;
                            ctx.fill();
                        }}
                        linkCanvasObject={paintLink}
                        onNodeClick={handleNodeClick}
                        onNodeHover={node => setHoveredNode(node)}
                        onEngineStart={handleEngineStart}
                        cooldownTicks={100}
                        cooldownTime={4000}
                        d3AlphaDecay={0.015}
                        d3VelocityDecay={0.25}
                        warmupTicks={100}
                        linkDirectionalParticles={link => link.type === 'supply_chain' ? 2 : 0}
                        linkDirectionalParticleSpeed={0.003}
                        linkDirectionalParticleWidth={1.5}
                        linkDirectionalParticleColor={() => 'rgba(59,130,246,0.4)'}
                    />
                )}

                {!loading && filteredData.nodes.length === 0 && (
                    <div style={{
                        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', gap: '8px',
                    }}>
                        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', letterSpacing: '0.12em' }}>NO NODES</div>
                        <button
                            onClick={() => { setSectorFilter(null); setLinkTypeFilter(null); }}
                            style={{
                                background: 'transparent', border: '1px solid var(--border-default)',
                                color: 'var(--text-secondary)', fontSize: '9px', cursor: 'pointer',
                                padding: '5px 14px', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.08em',
                            }}
                        >CLEAR FILTERS</button>
                    </div>
                )}
            </div>

            {/* ── RIGHT PANEL ── */}
            <div style={{
                borderLeft: panelBorder,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                background: 'var(--bg-surface)',
            }}>
                {/* Header */}
                <div style={{ padding: '10px 12px', borderBottom: panelBorder, flexShrink: 0 }}>
                    <span style={labelStyle}>NODE DETAIL</span>
                </div>

                {/* No selection state */}
                {!selectedNode && (
                    <div style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '20px',
                    }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '24px', opacity: 0.2, marginBottom: '10px' }}>⬡</div>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Click a node to explore</div>
                        </div>
                    </div>
                )}

                {/* Selected node detail */}
                {selectedNode && (
                    <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>

                        {/* ── COMPANY HEADER ── */}
                        <div style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--border-default)' }}>
                            {selectedNode.name && selectedNode.name !== (selectedNode.id || selectedNode.label) && (
                                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px', lineHeight: 1.3, fontFamily: 'Inter, sans-serif' }}>
                                    {selectedNode.name}
                                </div>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent-blue)', fontFamily: "'JetBrains Mono', monospace" }}>
                                    {selectedNode.id || selectedNode.label}
                                </span>
                                <span style={{
                                    fontSize: '8px', padding: '2px 6px',
                                    background: (SECTOR_COLORS[selectedNode.sector] || '#475569') + '20',
                                    color: SECTOR_COLORS[selectedNode.sector] || 'var(--text-muted)',
                                    border: `1px solid ${(SECTOR_COLORS[selectedNode.sector] || '#475569')}40`,
                                    borderRadius: '2px', letterSpacing: '0.06em',
                                }}>
                                    {selectedNode.sector || 'UNKNOWN'}
                                </span>
                            </div>
                            {/* TinyFish market data from latest signal enrichment */}
                            {nodeLatestSignal?.tf_price && (
                                <div style={{ display: 'flex', gap: '10px', marginTop: '8px', flexWrap: 'wrap' }}>
                                    <div>
                                        <div style={{ fontSize: '7px', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>PRICE</div>
                                        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}>
                                            ${nodeLatestSignal.tf_price}
                                        </div>
                                    </div>
                                    {nodeLatestSignal.tf_change_pct != null && (
                                        <div>
                                            <div style={{ fontSize: '7px', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>CHG</div>
                                            <div style={{
                                                fontSize: '11px', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                                                color: nodeLatestSignal.tf_change_pct > 0 ? '#34D399' : nodeLatestSignal.tf_change_pct < 0 ? '#F87171' : 'var(--text-secondary)',
                                            }}>
                                                {nodeLatestSignal.tf_change_pct > 0 ? '+' : ''}{nodeLatestSignal.tf_change_pct}%
                                            </div>
                                        </div>
                                    )}
                                    {nodeLatestSignal.tf_market_cap && (
                                        <div>
                                            <div style={{ fontSize: '7px', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>MKTCAP</div>
                                            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', fontFamily: "'JetBrains Mono', monospace" }}>
                                                {nodeLatestSignal.tf_market_cap}
                                            </div>
                                        </div>
                                    )}
                                    {nodeLatestSignal.tf_analyst_rating && (
                                        <div>
                                            <div style={{ fontSize: '7px', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>ANALYST</div>
                                            <div style={{ fontSize: '10px', color: '#60A5FA', fontFamily: "'JetBrains Mono', monospace" }}>
                                                {nodeLatestSignal.tf_analyst_rating}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* ── LATEST SIGNAL ── */}
                        {historyLoading && (
                            <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginBottom: '12px' }}>Loading intelligence...</div>
                        )}

                        {!historyLoading && nodeSignalHistory.length > 0 && (() => {
                            const sig = nodeLatestSignal || nodeSignalHistory[0];
                            const sigKey = sig.classification || sig.signal;
                            const sigColor = SIGNAL_COLORS[sigKey] || '#94A3B8';
                            const conf = sig.confidence ?? sig.confidence_score ?? selectedNode.confidence;
                            return (
                                <div style={{ marginBottom: '12px' }}>
                                    <div style={{ ...labelStyle, marginBottom: '6px' }}>LATEST SIGNAL</div>
                                    <div style={{
                                        background: 'var(--bg-card)', border: `1px solid ${sigColor}30`,
                                        borderLeft: `3px solid ${sigColor}`,
                                        borderRadius: '4px', padding: '8px',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                            <span style={{
                                                fontSize: '8px', padding: '2px 6px',
                                                background: sigColor + '20', color: sigColor,
                                                border: `1px solid ${sigColor}40`,
                                                borderRadius: '2px', letterSpacing: '0.08em', fontWeight: 700,
                                            }}>
                                                {sigKey || 'PENDING'}
                                            </span>
                                            {sig.filing_type && (
                                                <span style={{ fontSize: '8px', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                                                    {sig.filing_type}
                                                </span>
                                            )}
                                            {sig.filed_at && (
                                                <span style={{ fontSize: '7px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                                                    {new Date(sig.filed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                </span>
                                            )}
                                        </div>
                                        {conf != null && (
                                            <div style={{ marginBottom: '6px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                                                    <span style={{ fontSize: '7px', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>CONFIDENCE</span>
                                                    <span style={{ fontSize: '7px', color: sigColor, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{conf}%</span>
                                                </div>
                                                <div style={{ height: '2px', background: 'var(--bg-base)', borderRadius: '1px' }}>
                                                    <div style={{ height: '100%', width: `${conf}%`, background: sigColor, borderRadius: '1px', transition: 'width 0.5s' }} />
                                                </div>
                                            </div>
                                        )}
                                        {sig.event_type && (
                                            <div style={{ fontSize: '8px', color: 'var(--text-secondary)', marginBottom: '3px', fontFamily: "'JetBrains Mono', monospace" }}>
                                                {sig.event_type}
                                            </div>
                                        )}
                                        {sig.summary && (
                                            <div style={{ fontSize: '9px', color: 'var(--text-secondary)', lineHeight: 1.4, marginTop: '4px' }}>
                                                {sig.summary.slice(0, 120)}{sig.summary.length > 120 ? '…' : ''}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}

                        {!historyLoading && nodeSignalHistory.length === 0 && (
                            <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: '12px' }}>
                                No signals — trigger sweep to generate intelligence
                            </div>
                        )}

                        {/* ── WHY IT MATTERS ── */}
                        {(nodeLatestSignal?.why_it_matters || nodeLatestSignal?.market_impact) && (
                            <div style={{ marginBottom: '12px' }}>
                                <div style={{ ...labelStyle, marginBottom: '6px' }}>WHY IT MATTERS</div>
                                <div style={{
                                    background: 'var(--bg-card)', border: '1px solid var(--border-default)',
                                    borderRadius: '4px', padding: '8px',
                                }}>
                                    {nodeLatestSignal.why_it_matters && (
                                        <div style={{
                                            fontSize: '10px', color: 'var(--text-primary)', lineHeight: 1.5,
                                            borderLeft: '2px solid var(--accent-blue)', paddingLeft: '7px',
                                            marginBottom: nodeLatestSignal.market_impact ? '6px' : 0,
                                        }}>
                                            {nodeLatestSignal.why_it_matters}
                                        </div>
                                    )}
                                    {nodeLatestSignal.market_impact && (
                                        <div style={{
                                            fontSize: '9px', color: 'var(--text-secondary)', lineHeight: 1.4,
                                            paddingLeft: '9px', marginTop: '4px',
                                        }}>
                                            {nodeLatestSignal.market_impact}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── CHAIN REACTIONS ── */}
                        {nodeLatestSignal?.chain_reactions?.length > 0 && (
                            <div style={{ marginBottom: '12px' }}>
                                <div style={{ ...labelStyle, marginBottom: '6px' }}>CHAIN REACTIONS</div>
                                <div style={{
                                    background: 'var(--bg-card)', border: '1px solid var(--border-default)',
                                    borderRadius: '4px', padding: '8px',
                                }}>
                                    {nodeLatestSignal.chain_reactions.slice(0, 3).map((r, i) => (
                                        <div key={i} style={{
                                            display: 'flex', gap: '8px', alignItems: 'flex-start',
                                            paddingBottom: i < 2 ? '6px' : 0,
                                            marginBottom: i < 2 ? '6px' : 0,
                                            borderBottom: i < 2 ? '1px solid var(--border-default)' : 'none',
                                        }}>
                                            <span style={{
                                                fontSize: '7px', fontWeight: 700, padding: '1px 5px',
                                                background: 'var(--bg-base)', color: 'var(--text-muted)',
                                                borderRadius: '2px', whiteSpace: 'nowrap', letterSpacing: '0.06em',
                                                textTransform: 'uppercase', flexShrink: 0, marginTop: '1px',
                                            }}>
                                                {r.layer}
                                            </span>
                                            <div>
                                                <div style={{ fontSize: '9px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{r.effect}</div>
                                                <div style={{ fontSize: '7px', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace", marginTop: '2px' }}>{r.timeframe}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── MARKET RIPPLE ── */}
                        {nodeLatestSignal?.related_entities?.length > 0 && (
                            <div style={{ marginBottom: '12px' }}>
                                <div style={{ ...labelStyle, marginBottom: '6px' }}>MARKET RIPPLE</div>
                                <div style={{
                                    background: 'var(--bg-card)', border: '1px solid var(--border-default)',
                                    borderRadius: '4px', padding: '8px',
                                }}>
                                    {nodeLatestSignal.related_entities.slice(0, 5).map((entity, i, arr) => (
                                        <div key={entity.ticker || i} style={{
                                            display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0',
                                            borderBottom: i < arr.length - 1 ? '1px solid var(--border-default)' : 'none',
                                        }}>
                                            <span style={{
                                                fontSize: '9px', fontWeight: 700,
                                                fontFamily: "'JetBrains Mono', monospace",
                                                color: 'var(--text-primary)', width: '38px', flexShrink: 0,
                                            }}>
                                                {entity.ticker}
                                            </span>
                                            <span style={{
                                                fontSize: '7px', padding: '1px 4px', borderRadius: '2px', fontWeight: 700,
                                                flexShrink: 0,
                                                background: entity.impact_direction === 'positive' ? 'rgba(52,211,153,0.12)'
                                                    : entity.impact_direction === 'negative' ? 'rgba(248,113,113,0.12)'
                                                    : 'var(--bg-base)',
                                                color: entity.impact_direction === 'positive' ? '#34D399'
                                                    : entity.impact_direction === 'negative' ? '#F87171'
                                                    : 'var(--text-muted)',
                                            }}>
                                                {entity.impact_direction === 'positive' ? '↑' : entity.impact_direction === 'negative' ? '↓' : '→'}
                                                {' '}{entity.relationship || ''}
                                            </span>
                                            <span style={{ fontSize: '8px', color: 'var(--text-muted)', lineHeight: 1.3, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {entity.reason}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── SIGNAL HISTORY ── */}
                        {nodeSignalHistory.length > 1 && (
                            <div style={{ marginBottom: '12px' }}>
                                <div style={{ ...labelStyle, marginBottom: '6px' }}>SIGNAL HISTORY</div>
                                {nodeSignalHistory.slice(1).map((sig, i) => {
                                    const sigColor = SIGNAL_COLORS[sig.classification || sig.signal] || 'var(--text-tertiary)';
                                    const date = sig.filed_at ? new Date(sig.filed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
                                    return (
                                        <div key={sig.id || i} style={{
                                            display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0',
                                            borderBottom: i < nodeSignalHistory.length - 2 ? '1px solid var(--border-default)' : 'none',
                                        }}>
                                            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: sigColor, flexShrink: 0 }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '8px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {sig.filing_type || sig.form_type} · {date}
                                                </div>
                                                <div style={{ fontSize: '7px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {sig.summary ? sig.summary.slice(0, 55) : '—'}
                                                </div>
                                            </div>
                                            <div style={{ fontSize: '7px', color: sigColor, flexShrink: 0, letterSpacing: '0.06em' }}>
                                                {sig.classification || sig.signal}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* ── CORRELATIONS (graph connections) ── */}
                        {connectedNodes.length > 0 && (
                            <div style={{ marginBottom: '12px' }}>
                                <div style={{ ...labelStyle, marginBottom: '6px' }}>CONNECTED PEERS</div>
                                {connectedNodes.map(({ node, type, value }, i) => {
                                    const typeInfo = LINK_TYPE_COLORS[type] || { badge: '#64748b', label: type?.toUpperCase() || 'LINK' };
                                    return (
                                        <div
                                            key={node.id || i}
                                            onClick={() => handleNodeClick(node)}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', cursor: 'pointer',
                                                borderBottom: i < connectedNodes.length - 1 ? '1px solid var(--border-default)' : 'none',
                                            }}
                                        >
                                            <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace", minWidth: '38px' }}>
                                                {node.id}
                                            </span>
                                            <span style={{
                                                fontSize: '7px', padding: '1px 4px',
                                                background: typeInfo.badge + '20', color: typeInfo.badge,
                                                border: `1px solid ${typeInfo.badge}40`,
                                                borderRadius: '2px', letterSpacing: '0.04em', flexShrink: 0,
                                            }}>
                                                {typeInfo.label}
                                            </span>
                                            <div style={{ flex: 1, height: '2px', background: 'var(--bg-card)', borderRadius: '1px', overflow: 'hidden' }}>
                                                <div style={{ height: '100%', width: `${Math.round((value || 0.5) * 100)}%`, background: typeInfo.badge, opacity: 0.6 }} />
                                            </div>
                                            {node.signal && (
                                                <div style={{
                                                    width: '5px', height: '5px', borderRadius: '50%', flexShrink: 0,
                                                    background: SIGNAL_COLORS[node.signal] || '#94A3B8',
                                                }} />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* ── TRIGGER SWEEP BUTTON ── */}
                        <div style={{ paddingTop: '8px', borderTop: '1px solid var(--border-default)' }}>
                            <button
                                onClick={handleTriggerSweep}
                                disabled={sweeping || !selectedNode}
                                style={{
                                    width: '100%', padding: '9px 14px',
                                    borderRadius: '6px', cursor: sweeping ? 'not-allowed' : 'pointer',
                                    fontSize: '11px', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
                                    letterSpacing: '0.05em',
                                    border: `1px solid ${sweepStatus === 'done' ? '#166534' : sweepStatus === 'error' ? '#7F1D1D' : '#2D5A9E'}`,
                                    background: sweepStatus === 'done' ? '#0D2E1A' : sweepStatus === 'error' ? '#2E0D0D' : '#1A2744',
                                    color: sweepStatus === 'done' ? '#34D399' : sweepStatus === 'error' ? '#F87171' : '#60A5FA',
                                    opacity: (!selectedNode || sweeping) ? 0.5 : 1,
                                    transition: 'all 200ms',
                                }}
                            >
                                {sweepStatus === 'running' ? '● RUNNING BATCH SWEEP...' :
                                 sweepStatus === 'done'    ? '✓ SWEEP STARTED → CHECK FEED' :
                                 sweepStatus === 'error'   ? '✗ FAILED — CHECK LOGS' :
                                 selectedNode ? `TRIGGER SWEEP → ${selectedNode.id}` : 'SELECT A NODE'}
                            </button>
                            {sweepStatus === 'done' && (
                                <div style={{
                                    fontSize: '9px', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace",
                                    textAlign: 'center', marginTop: '5px', lineHeight: 1.4,
                                }}>
                                    6 forms running in parallel via TinyFish batch.
                                    New signals appear in Feed within ~60s.
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
