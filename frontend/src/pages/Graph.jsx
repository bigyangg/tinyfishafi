// Graph.jsx — "God's View" Correlation Network
// Force-graph visualization showing sector relationships+supply chains with live signal overlays
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Sector colors with softer palette
const SECTOR_COLORS = {
    semiconductors: '#7C3AED',
    pharma: '#0EA5E9',
    fintech: '#10B981',
    cloud: '#F59E0B',
    ev_auto: '#FB923C',
    energy: '#FBBF24',
    big_tech: '#F87171',
    banking: '#34D399',
    defense: '#94A3B8',
    retail: '#C084FC',
};

const SIGNAL_COLORS = {
    Positive: '#34D399',
    Risk: '#F87171',
    Neutral: '#94A3B8',
};

export default function Graph() {
    const [graphData, setGraphData] = useState({ nodes: [], links: [] });
    const [loading, setLoading] = useState(true);
    const [selectedNode, setSelectedNode] = useState(null);
    const [hoveredNode, setHoveredNode] = useState(null);
    const [sectorFilter, setSectorFilter] = useState(null);
    const [sectors, setSectors] = useState([]);
    const [nodeSignalHistory, setNodeSignalHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const graphRef = useRef();
    const containerRef = useRef();
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
    const pulseNodes = useRef(new Set());

    // Fetch graph data
    useEffect(() => {
        const fetchGraph = async () => {
            try {
                const res = await axios.get(`${API}/correlations/graph`);
                const data = res.data;

                // Build a set of all valid node IDs from the backend
                const nodeIdSet = new Set((data.nodes || []).map(n => n.id));

                // Transform edges to links format — only include links where BOTH nodes exist
                const links = (data.edges || [])
                    .filter(e => nodeIdSet.has(e.source) && nodeIdSet.has(e.target))
                    .map(e => ({
                        source: e.source,
                        target: e.target,
                        weight: e.weight || 0.3,
                        type: e.type,
                        sector: e.sector,
                        label: e.label,
                    }));

                // Filter nodes that have at least one valid connection
                const connectedTickers = new Set();
                links.forEach(l => {
                    connectedTickers.add(typeof l.source === 'string' ? l.source : l.source.id);
                    connectedTickers.add(typeof l.target === 'string' ? l.target : l.target.id);
                });

                const nodes = (data.nodes || []).filter(n => connectedTickers.has(n.id));

                setGraphData({ nodes, links });
                setSectors(data.sectors || []);

                // Mark nodes with signals as pulsing
                nodes.forEach(n => {
                    if (n.has_signal) {
                        pulseNodes.current.add(n.id);
                    }
                });

            } catch (err) {
                console.error('Graph fetch failed:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchGraph();
    }, []);

    // Calculate dimensions
    useEffect(() => {
        const updateDimensions = () => {
            if (containerRef.current) {
                setDimensions({
                    width: containerRef.current.offsetWidth,
                    height: containerRef.current.offsetHeight,
                });
            }
        };
        updateDimensions();
        window.addEventListener('resize', updateDimensions);
        return () => window.removeEventListener('resize', updateDimensions);
    }, []);

    // Debounce sector filter changes
    const debounceRef = useRef(null);
    const handleSectorClick = useCallback((sector) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => setSectorFilter(sector), 150);
    }, []);

    // Filter data based on sector
    const filteredData = useMemo(() => {
        if (!sectorFilter) return graphData;
        const filteredNodes = graphData.nodes.filter(n => n.sector === sectorFilter);
        const nodeIds = new Set(filteredNodes.map(n => n.id));
        const filteredLinks = graphData.links.filter(l => {
            const sourceId = typeof l.source === 'string' ? l.source : l.source.id;
            const targetId = typeof l.target === 'string' ? l.target : l.target.id;
            return nodeIds.has(sourceId) && nodeIds.has(targetId);
        });
        return { nodes: filteredNodes, links: filteredLinks };
    }, [graphData, sectorFilter]);

    // Node renderer with theme-aware colors
    const paintNode = useCallback((node, ctx) => {
        const size = node.has_signal ? 8 : 5;
        const color = SECTOR_COLORS[node.sector] || '#94A3B8';
        const signalColor = node.signal ? SIGNAL_COLORS[node.signal] : null;

        // Glow effect for signaled nodes
        if (node.has_signal) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, size + 4, 0, 2 * Math.PI);
            ctx.fillStyle = (signalColor || color) + '15';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(node.x, node.y, size + 2, 0, 2 * Math.PI);
            ctx.fillStyle = (signalColor || color) + '30';
            ctx.fill();
        }

        // Main circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
        ctx.fillStyle = signalColor || color;
        ctx.fill();

        // Border using theme-aware opacity
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Label with theme-aware colors
        const isLight = document.body.classList.contains('theme-light');
        const labelColor = node.has_signal
            ? (isLight ? '#1E2330' : '#E2E8F0')
            : '#64748B';

        ctx.font = `${node.has_signal ? '8' : '6'}px JetBrains Mono`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = labelColor;
        ctx.fillText(node.ticker, node.x, node.y + size + 2);

        // Score badge for active signals
        if (node.has_signal && node.score > 0) {
            ctx.font = '5px JetBrains Mono';
            ctx.fillStyle = signalColor || '#94A3B8';
            ctx.fillText(node.score.toString(), node.x, node.y + size + 11);
        }
    }, []);

    // Link renderer with CSS variable colors
    const paintLink = useCallback((link, ctx) => {
        const sourceNode = typeof link.source === 'object' ? link.source : null;
        const targetNode = typeof link.target === 'object' ? link.target : null;
        if (!sourceNode || !targetNode) return;

        ctx.beginPath();
        ctx.moveTo(sourceNode.x, sourceNode.y);
        ctx.lineTo(targetNode.x, targetNode.y);

        if (link.type === 'supply_chain') {
            ctx.strokeStyle = 'rgba(59,130,246,0.15)';
            ctx.lineWidth = link.weight * 2;
        } else {
            ctx.strokeStyle = 'rgba(255,255,255,0.03)';
            ctx.lineWidth = 0.5;
        }
        ctx.stroke();
    }, []);

    const handleNodeClick = useCallback((node) => {
        setSelectedNode(node);
        setNodeSignalHistory([]);
        if (graphRef.current) {
            graphRef.current.centerAt(node.x, node.y, 400);
            graphRef.current.zoom(3, 400);
        }
        // Fetch signal history for this ticker
        setHistoryLoading(true);
        axios.get(`${API}/signals?tickers=${node.ticker}`)
            .then(res => {
                const data = Array.isArray(res.data) ? res.data : (res.data?.signals || []);
                setNodeSignalHistory(data.slice(0, 5));
            })
            .catch(() => setNodeSignalHistory([]))
            .finally(() => setHistoryLoading(false));
    }, []);

    return (
            <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--bg-base)' }}>

                {/* Header with stats */}
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
                    padding: '12px 20px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'linear-gradient(180deg, var(--bg-base) 40%, transparent)',
                    pointerEvents: 'none',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-primary)', letterSpacing: '0.12em', fontWeight: 700 }}>
                            CORRELATION NETWORK
                        </span>
                        <span style={{
                            fontSize: '9px', color: 'var(--text-tertiary)', letterSpacing: '0.06em',
                            background: 'var(--bg-card)', border: '1px solid var(--border-default)',
                            padding: '2px 8px', borderRadius: '10px',
                        }}>
                            {graphData.nodes.length} nodes · {graphData.links.length} links
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', pointerEvents: 'auto' }}>
                        {Object.entries(SIGNAL_COLORS).map(([type, color]) => (
                            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: color }} />
                                <span style={{ fontSize: '8px', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
                                    {type.toUpperCase()}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Sector filter pills */}
                <div style={{
                    position: 'absolute', top: '44px', left: '20px', zIndex: 10,
                    display: 'flex', gap: '4px', flexWrap: 'wrap', maxWidth: '500px',
                }}>
                    <button
                        onClick={() => handleSectorClick(null)}
                        style={{
                            background: !sectorFilter ? 'var(--accent-blue-bg)' : 'var(--bg-card)',
                            border: `1px solid ${!sectorFilter ? 'var(--accent-blue)' : 'var(--border-default)'}`,
                            color: !sectorFilter ? 'var(--accent-blue)' : 'var(--text-tertiary)',
                            padding: '3px 8px', fontSize: '7px', cursor: 'pointer',
                            fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.06em',
                            borderRadius: '10px', textTransform: 'uppercase',
                            transition: 'all 120ms',
                        }}
                    >
                        ALL
                    </button>
                    {sectors.map(s => (
                        <button
                            key={s}
                            onClick={() => handleSectorClick(s === sectorFilter ? null : s)}
                            style={{
                                background: sectorFilter === s ? (SECTOR_COLORS[s] || 'var(--text-tertiary)') + '15' : 'var(--bg-card)',
                                border: `1px solid ${sectorFilter === s ? (SECTOR_COLORS[s] || 'var(--text-tertiary)') : 'var(--border-default)'}`,
                                color: sectorFilter === s ? (SECTOR_COLORS[s] || 'var(--text-tertiary)') : 'var(--text-tertiary)',
                                padding: '3px 8px', fontSize: '7px', cursor: 'pointer',
                                fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.06em',
                                borderRadius: '10px', textTransform: 'uppercase',
                                transition: 'all 120ms',
                            }}
                        >
                            {s.replace('_', ' ')}
                        </button>
                    ))}
                </div>

                {/* Selected node info panel */}
                {selectedNode && (
                    <div style={{
                        position: 'absolute', top: '16px', right: '16px', zIndex: 10,
                        background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '4px',
                        padding: '12px 16px', minWidth: '240px', maxWidth: '280px',
                        maxHeight: '70vh', overflowY: 'auto',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}>
                                {selectedNode.ticker}
                            </span>
                            <button
                                onClick={() => setSelectedNode(null)}
                                style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: '14px', cursor: 'pointer' }}
                            >×</button>
                        </div>
                        <div style={{ fontSize: '8px', color: SECTOR_COLORS[selectedNode.sector] || 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '6px' }}>
                            {selectedNode.sector?.replace('_', ' ')}
                        </div>
                        {selectedNode.has_signal && (
                            <>
                                <div style={{
                                    display: 'inline-block', padding: '2px 6px', fontSize: '8px',
                                    background: (SIGNAL_COLORS[selectedNode.signal] || 'var(--text-tertiary)') + '15',
                                    color: SIGNAL_COLORS[selectedNode.signal] || 'var(--text-tertiary)',
                                    border: `1px solid ${(SIGNAL_COLORS[selectedNode.signal] || 'var(--text-tertiary)')}30`,
                                    borderRadius: '2px', marginBottom: '6px', letterSpacing: '0.08em',
                                }}>
                                    {selectedNode.signal} · SCORE {selectedNode.score}
                                </div>
                                {selectedNode.event_type && (
                                    <div style={{ fontSize: '8px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                        {selectedNode.event_type}
                                    </div>
                                )}
                                {selectedNode.summary && (
                                    <div style={{ fontSize: '8px', color: 'var(--text-secondary)', lineHeight: 1.4, fontFamily: 'Inter, sans-serif' }}>
                                        {selectedNode.summary}
                                    </div>
                                )}
                            </>
                        )}
                        {!selectedNode.has_signal && (
                            <div style={{ fontSize: '8px', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>No active signals</div>
                        )}

                        {/* Signal History */}
                        <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-default)', paddingTop: '10px' }}>
                            <div style={{ fontSize: '9px', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '8px' }}>
                                SIGNAL HISTORY
                            </div>
                            {historyLoading && (
                                <div style={{ fontSize: '9px', color: 'var(--text-tertiary)' }}>Loading...</div>
                            )}
                            {!historyLoading && nodeSignalHistory.length === 0 && (
                                <div style={{ fontSize: '9px', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>No historical signals</div>
                            )}
                            {!historyLoading && nodeSignalHistory.map((sig, i) => {
                                const sigColor = SIGNAL_COLORS[sig.classification || sig.signal] || 'var(--text-tertiary)';
                                const date = sig.filed_at ? new Date(sig.filed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
                                return (
                                    <div key={sig.id || i} style={{
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        padding: '4px 0',
                                        borderBottom: i < nodeSignalHistory.length - 1 ? '1px solid var(--border-default)' : 'none',
                                    }}>
                                        <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: sigColor, flexShrink: 0 }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '8px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {sig.filing_type || sig.form_type} · {date}
                                            </div>
                                            <div style={{ fontSize: '7px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {sig.summary ? sig.summary.slice(0, 60) : '—'}
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '7px', color: sigColor, flexShrink: 0, letterSpacing: '0.06em' }}>
                                            {sig.classification || sig.signal}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Loading state */}
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

                {/* Empty state */}
                {!loading && filteredData.nodes.length === 0 && (
                    <div style={{
                        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', gap: '8px',
                    }}>
                        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', letterSpacing: '0.12em' }}>
                            NO NODES IN THIS SECTOR
                        </div>
                        <button
                            onClick={() => setSectorFilter(null)}
                            style={{
                                background: 'transparent', border: '1px solid var(--border-default)',
                                color: 'var(--text-secondary)', fontSize: '9px', cursor: 'pointer', padding: '5px 14px',
                                fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.08em',
                                transition: 'all 120ms',
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.borderColor = 'var(--border-strong)';
                                e.currentTarget.style.color = 'var(--text-primary)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.borderColor = 'var(--border-default)';
                                e.currentTarget.style.color = 'var(--text-secondary)';
                            }}
                        >
                            SHOW ALL
                        </button>
                    </div>
                )}

                {/* Force graph + zoom-to-fit button */}
                {!loading && filteredData.nodes.length > 0 && (
                    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                        <button
                            onClick={() => graphRef.current?.zoomToFit(400)}
                            style={{
                                position: 'absolute',
                                top: 12,
                                right: 12,
                                zIndex: 10,
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border-default)',
                                color: 'var(--text-secondary)',
                                padding: '6px 10px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontFamily: "'JetBrains Mono', monospace",
                                transition: 'all 120ms',
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.borderColor = 'var(--border-strong)';
                                e.currentTarget.style.color = 'var(--text-primary)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.borderColor = 'var(--border-default)';
                                e.currentTarget.style.color = 'var(--text-secondary)';
                            }}
                        >
                            ⊙ FIT
                        </button>
                        <ForceGraph2D
                            ref={graphRef}
                            graphData={filteredData}
                            width={dimensions.width}
                            height={dimensions.height}
                            backgroundColor="var(--bg-base)"
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
                            cooldownTicks={100}
                            d3AlphaDecay={0.02}
                            d3VelocityDecay={0.3}
                            warmupTicks={50}
                            linkDirectionalParticles={link => link.type === 'supply_chain' ? 2 : 0}
                            linkDirectionalParticleSpeed={0.005}
                            linkDirectionalParticleWidth={2}
                            linkDirectionalParticleColor={() => 'rgba(59,130,246,0.4)'}
                        />
                    </div>
                )}
            </div>
    );
}
