"use client";
import { useState, useEffect, useCallback } from "react";
import PairChart from "./PairChart";
import { fmt } from "@/lib/analysis";

function trendChip(trend) {
  const cls = trend === "up" ? "trend-up" : trend === "down" ? "trend-down" : "trend-range";
  const lbl = trend === "up" ? "Uptrend" : trend === "down" ? "Downtrend" : "Range";
  return <span className={`trend-chip ${cls}`}>{lbl}</span>;
}

function SetupCard({ label, s }) {
  const dirLabel = s.direction === "long" ? "Long \u25B2" : "Short \u25BC";
  const statusText = s.isPending ? s.triggerNote || "Pending trigger" : "Live now";
  return (
    <div className="setup-card">
      <div className="setup-top">
        <div>
          <div className="setup-label">{label}</div>
          <div className={`setup-dir ${s.direction}`}>{dirLabel}</div>
        </div>
        <div className={`grade-chip grade-${s.grade}`}>{s.grade}</div>
      </div>
      <div className={`setup-status ${s.isPending ? "" : "active"}`}>{statusText}</div>
      <div className="levels">
        <div><span className="lbl">Entry</span><span className="val">{fmt(s.entry)}</span></div>
        <div><span className="lbl">Stop</span><span className="val">{fmt(s.stop)}</span></div>
        <div><span className="lbl">Take profit</span><span className="val">{fmt(s.target)}</span></div>
        <div><span className="lbl">Reward:risk</span><span className="rr">{s.rr.toFixed(1)}R</span></div>
      </div>
      <div className="checklist">
        {s.checks.map((c, i) => (
          <div key={i} className={`check-item ${c.met ? "met" : ""}`}>
            <span className={`check-mark ${c.met ? "met" : ""}`}>{c.met ? "\u2713" : ""}</span>
            {c.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function stackLabel(signature) {
  if (!signature) return "\u2014";
  return signature.split(">").join(" > ");
}

function EmaPanel({ emaContext }) {
  if (!emaContext) return null;
  return (
    <div className="ema-panel">
      <div className="ema-row">
        <span className="ema-tag">Current stack</span>
        <span className="ema-val">{stackLabel(emaContext.currentStack.signature)}</span>
        <span className="ema-dur">{emaContext.currentStack.duration} days in this order</span>
      </div>
      {emaContext.previousStack && (
        <div className="ema-row">
          <span className="ema-tag">Before that</span>
          <span className="ema-val">{stackLabel(emaContext.previousStack.signature)}</span>
          <span className="ema-dur">held for {emaContext.previousStack.duration} days</span>
        </div>
      )}
      {emaContext.recentCrosses && emaContext.recentCrosses.length > 0 && (
        <div className="ema-crosses">
          <span className="ema-tag">Recent crosses</span>
          <ul>
            {emaContext.recentCrosses.slice(0, 4).map((c, i) => (
              <li key={i} className={c.direction}>
                {c.periodA}/{c.periodB} {c.direction} \u2014 {c.time.slice(0, 10)} @ {fmt(c.price)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function PairBlock({ pair, setup, dailyBars, h4Bars }) {
  const [open, setOpen] = useState(false);
  const [interval, setInterval_] = useState("daily");
  const [mode, setMode] = useState(null); // null | 'line' | 'abcd'
  const [drawings, setDrawings] = useState([]);

  const loadDrawings = useCallback(async () => {
    const res = await fetch(`/api/drawings?symbol=${encodeURIComponent(pair.symbol)}`);
    const data = await res.json();
    setDrawings(data.drawings || []);
  }, [pair.symbol]);

  useEffect(() => {
    if (open) loadDrawings();
  }, [open, loadDrawings]);

  async function handleCreateDrawing(drawing) {
    await fetch("/api/drawings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(drawing),
    });
    setMode(null);
    loadDrawings();
  }

  async function deleteDrawing(id) {
    await fetch(`/api/drawings?id=${id}`, { method: "DELETE" });
    loadDrawings();
  }

  const lastPrice = dailyBars && dailyBars.length ? fmt(dailyBars[dailyBars.length - 1].close) : "\u2014";

  return (
    <div className="pair-block">
      <div className="pair-head" onClick={() => setOpen(!open)}>
        <div className="pair-id">
          <span className="sym">{pair.label}</span>
          <span className="px">{lastPrice}</span>
          {setup?.trend_daily ? trendChip(setup.trend_daily) : null}
        </div>
        <span className={`caret ${open ? "open" : ""}`}>▾</span>
      </div>
      {open && (
        <div className="pair-body">
          <div className="chart-tabs">
            <button className={`chart-tab ${interval === "daily" ? "active" : ""}`} onClick={() => setInterval_("daily")}>Daily</button>
            <button className={`chart-tab ${interval === "h4" ? "active" : ""}`} onClick={() => setInterval_("h4")}>4-hour</button>
            <span style={{ flex: 1 }} />
            <button className={`chart-tab ${mode === "line" ? "active" : ""}`} onClick={() => setMode(mode === "line" ? null : "line")}>Line at cross</button>
            <button className={`chart-tab ${mode === "abcd" ? "active" : ""}`} onClick={() => setMode(mode === "abcd" ? null : "abcd")}>Draw ABCD</button>
          </div>
          <div className="chart-box">
            <PairChart
              symbol={pair.symbol}
              bars={interval === "daily" ? dailyBars : h4Bars}
              interval={interval}
              analysis={setup ? { zone: setup.zone, primary: setup.primary_setup, emaContext: setup.ema_context } : null}
              drawings={drawings}
              onCreateDrawing={handleCreateDrawing}
              mode={mode}
              onModeConsumed={() => setMode(null)}
            />
          </div>

          {drawings.length > 0 && (
            <div className="drawing-list">
              {drawings.map((d) => (
                <span key={d.id} className="drawing-chip">
                  {d.type === "horizontal_line" ? `Line @ ${fmt(d.data.price)}` : `ABCD (${d.data.stats?.direction})`}
                  <button className="drawing-x" onClick={() => deleteDrawing(d.id)}>\u00d7</button>
                </span>
              ))}
            </div>
          )}

          {!setup || !setup.zone ? (
            <div className="no-zone">No clean consolidation base found in the recent range — sitting this one out for now.</div>
          ) : (
            <>
              <div className="zone-summary">
                <span>Base: <b>{fmt(setup.zone.bottom)} \u2013 {fmt(setup.zone.top)}</b></span>
                <span>Duration: <b>{setup.zone.duration} days</b></span>
                <span>4H structure: <b>{setup.trend_4h}</b></span>
              </div>
              <div className="setup-status">
                {setup.status === "brokenUp" && "Price has broken above the base \u2014 breakout is live."}
                {setup.status === "brokenDown" && "Price has broken below the base \u2014 breakdown is live."}
                {setup.status === "inside" && "Price is still inside the base \u2014 setup is pending a breakout."}
              </div>
              <div className="setups">
                <SetupCard label="Primary" s={setup.primary_setup} />
                <SetupCard label="Secondary" s={setup.secondary_setup} />
              </div>
              <EmaPanel emaContext={setup.ema_context} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
