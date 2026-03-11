// SignalSkeleton.jsx — Shimmer loading placeholders for the signal feed
export const SignalSkeleton = ({ count = 8 }) => (
    <div>
        {Array.from({ length: count }).map((_, i) => (
            <div
                key={i}
                style={{
                    display: "flex",
                    alignItems: "stretch",
                    borderLeft: "2px solid #111",
                    borderBottom: "1px solid #0d0d0d",
                    padding: "12px 16px",
                    opacity: 1 - i * 0.08,
                }}
            >
                <div style={{ display: "flex", width: "100%", gap: "16px", alignItems: "flex-start" }}>
                    {/* COL 1: Ticker + company */}
                    <div style={{ width: "90px", flexShrink: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                        <div style={{ width: "52px", height: "14px", background: "#111", animation: `shimmer 1.5s ${i * 0.1}s ease infinite` }} />
                        <div style={{ width: "70px", height: "10px", background: "#0d0d0d", animation: `shimmer 1.5s ${i * 0.1 + 0.1}s ease infinite` }} />
                    </div>
                    {/* COL 2: Event */}
                    <div style={{ width: "110px", flexShrink: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                        <div style={{ width: "64px", height: "11px", background: "#0d0d0d", animation: `shimmer 1.5s ${i * 0.1 + 0.15}s ease infinite` }} />
                    </div>
                    {/* COL 3: Summary */}
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div style={{ width: `${75 + (i % 3) * 8}%`, height: "11px", background: "#0a0a0a", animation: `shimmer 1.5s ${i * 0.1 + 0.2}s ease infinite` }} />
                        <div style={{ width: `${50 + (i % 4) * 10}%`, height: "11px", background: "#090909", animation: `shimmer 1.5s ${i * 0.1 + 0.3}s ease infinite` }} />
                    </div>
                    {/* COL 4: Time */}
                    <div style={{ width: "80px", flexShrink: 0, display: "flex", justifyContent: "flex-end" }}>
                        <div style={{ width: "40px", height: "10px", background: "#0a0a0a", animation: `shimmer 1.5s ease infinite` }} />
                    </div>
                </div>
            </div>
        ))}
    </div>
);

export const StatsSkeleton = () => (
    <div style={{ padding: "16px", borderBottom: "1px solid #0f0f0f" }}>
        <div style={{ width: "40px", height: "10px", background: "#111", marginBottom: "12px", animation: "shimmer 1.5s ease infinite" }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1px", background: "#0d0d0d" }}>
            {[1, 2, 3].map(i => (
                <div key={i} style={{ background: "#080808", padding: "10px 12px" }}>
                    <div style={{ width: "24px", height: "20px", background: "#111", marginBottom: "4px", animation: `shimmer 1.5s ${i * 0.15}s ease infinite` }} />
                    <div style={{ width: "40px", height: "8px", background: "#0d0d0d", animation: `shimmer 1.5s ${i * 0.15}s ease infinite` }} />
                </div>
            ))}
        </div>
    </div>
);

export const WatchlistSkeleton = () => (
    <div style={{ padding: "16px" }}>
        <div style={{ width: "60px", height: "10px", background: "#111", marginBottom: "12px", animation: "shimmer 1.5s ease infinite" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {[1, 2, 3].map(i => (
                <div key={i} style={{ height: "32px", background: "#0a0a0a", border: "1px solid #0d0d0d", animation: `shimmer 1.5s ${i * 0.15}s ease infinite` }} />
            ))}
        </div>
    </div>
);
