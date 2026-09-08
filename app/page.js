"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import PairBlock from "@/components/PairBlock";
import { PAIRS } from "@/lib/analysis";

export default function Home() {
  const [state, setState] = useState({ setups: [], candles: [] });
  const [syncing, setSyncing] = useState(false);
  const [progressLabel, setProgressLabel] = useState("");
  const [lastSynced, setLastSynced] = useState(null);

  const loadState = useCallback(async () => {
    const res = await fetch("/api/state");
    const data = await res.json();
    setState(data);
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  async function refreshAll() {
    setSyncing(true);
    try {
      setProgressLabel("Fetching daily candles for all pairs\u2026");
      await fetch("/api/manual-refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "daily" }),
      });
      await loadState();

      setProgressLabel("Waiting for the free-tier rate limit to reset\u2026");
      await new Promise((r) => setTimeout(r, 61000));

      setProgressLabel("Fetching 4-hour candles for all pairs\u2026");
      await fetch("/api/manual-refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "h4" }),
      });
      await loadState();

      setLastSynced(new Date());
      setProgressLabel("Synced.");
    } catch (e) {
      setProgressLabel("Something went wrong: " + e.message);
    } finally {
      setTimeout(() => setSyncing(false), 1200);
    }
  }

  const setupBySymbol = Object.fromEntries((state.setups || []).map((s) => [s.symbol, s]));
  const candlesBySymbol = {};
  for (const row of state.candles || []) {
    candlesBySymbol[row.symbol] = candlesBySymbol[row.symbol] || {};
    candlesBySymbol[row.symbol][row.interval] = row.data;
  }

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">
          <h1>Basecamp</h1>
          <p>Watches EUR/USD, GBP/USD, USD/JPY and the other majors for consolidation zones, then grades the breakout and its fallback so you only have to check in, not stare.</p>
        </div>
        <div className="top-actions">
          <button className="btn primary" onClick={refreshAll} disabled={syncing}>
            {syncing ? "Syncing\u2026" : "Refresh now"}
          </button>
          <Link href="/settings" className="settings-link">Settings</Link>
          <div className="sync-line">
            {lastSynced ? `last synced ${lastSynced.toLocaleString()}` : "auto-syncs daily \u2014 or tap Refresh"}
          </div>
        </div>
      </header>

      <div className="legend">
        <span><span className="dot" style={{ background: "var(--green)" }}></span>Long / uptrend</span>
        <span><span className="dot" style={{ background: "var(--red)" }}></span>Short / downtrend</span>
        <span><span className="dot" style={{ background: "var(--grey-chip)" }}></span>Range / no clear trend</span>
        <span><span className="grade-chip grade-A" style={{ width: 16, height: 16, fontSize: 9 }}>A</span>5\u20136 of 6 criteria</span>
        <span><span className="grade-chip grade-B" style={{ width: 16, height: 16, fontSize: 9 }}>B</span>3\u20134 criteria</span>
        <span><span className="grade-chip grade-C" style={{ width: 16, height: 16, fontSize: 9 }}>C</span>1\u20132 criteria</span>
      </div>

      {syncing && (
        <div className="progress-wrap">
          <div className="progress-track"><div className="progress-bar" style={{ width: "60%" }} /></div>
          <div className="progress-label">{progressLabel}</div>
        </div>
      )}

      <div>
        {PAIRS.map((p) => (
          <PairBlock
            key={p.symbol}
            pair={p}
            setup={setupBySymbol[p.symbol]}
            dailyBars={candlesBySymbol[p.symbol]?.daily}
            h4Bars={candlesBySymbol[p.symbol]?.h4}
          />
        ))}
      </div>

      <footer className="note">
        <b>How a setup is built:</b> Basecamp finds the most recent tight, multi-day price range on the daily chart (a &quot;base&quot;) and measures it against 14-day ATR. If price has broken out of that base, the <b>primary</b> trade is the breakout in that direction; if price is still inside the base, the primary is the pending breakout in the direction of the daily trend. The <b>secondary</b> trade is the mirror-image setup that activates if the primary&apos;s stop gets hit \u2014 the failed-breakout fade. Every setup is checked against six criteria and graded A/B/C by how many it meets. This is analysis, not advice \u2014 you decide whether and how to take anything shown here.
      </footer>
    </div>
  );
}
