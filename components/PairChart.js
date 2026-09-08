"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { createChart } from "lightweight-charts";
import { computeAllEMAs, EMA_PERIODS } from "@/lib/analysis";

const EMA_COLORS = { 8: "#e0b34c", 20: "#5aa9e6", 50: "#b98cf0", 100: "#9aa5b8" };
const ABCD_LABELS = ["A", "B", "C", "D"];

function toChartTime(rawTime, interval) {
  return interval === "daily" ? rawTime.slice(0, 10) : Math.floor(new Date(rawTime.replace(" ", "T") + "Z").getTime() / 1000);
}

export default function PairChart({ symbol, bars, interval, analysis, drawings, onCreateDrawing, mode, onModeConsumed }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const abcdPointsRef = useRef([]);
  const abcdSeriesRef = useRef([]);
  const modeRef = useRef(mode);
  const [abcdProgress, setAbcdProgress] = useState(0);
  const [lastPatternStats, setLastPatternStats] = useState(null);

  useEffect(() => { modeRef.current = mode; }, [mode]);

  const buildCrossMarkers = useCallback(() => {
    if (interval !== "daily" || !analysis?.emaContext) return [];
    return (analysis.emaContext.recentCrosses || []).map((c) => ({
      time: c.time.slice(0, 10),
      position: c.direction === "bullish" ? "belowBar" : "aboveBar",
      color: c.direction === "bullish" ? "#4bd0a0" : "#e2645a",
      shape: c.direction === "bullish" ? "arrowUp" : "arrowDown",
      text: `${c.periodA}/${c.periodB}`,
      size: 0.8,
    }));
  }, [analysis, interval]);

  const buildAbcdMarkers = useCallback(() => {
    return abcdPointsRef.current.map((p, i) => ({
      time: p.chartTime,
      position: "inBar",
      color: "#e7ebf1",
      shape: "circle",
      text: ABCD_LABELS[i],
    }));
  }, []);

  const refreshMarkers = useCallback(() => {
    if (!seriesRef.current) return;
    const combined = [...buildCrossMarkers(), ...buildAbcdMarkers()].sort((a, b) => (a.time > b.time ? 1 : -1));
    seriesRef.current.setMarkers(combined);
  }, [buildCrossMarkers, buildAbcdMarkers]);

  const drawSegment = useCallback((p1, p2) => {
    if (!chartRef.current) return;
    const ordered = p1.chartTime <= p2.chartTime ? [p1, p2] : [p2, p1];
    const seg = chartRef.current.addLineSeries({ color: "#e7ebf1", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    seg.setData([{ time: ordered[0].chartTime, value: ordered[0].price }, { time: ordered[1].chartTime, value: ordered[1].price }]);
    abcdSeriesRef.current.push(seg);
  }, []);

  const clearAbcdInProgress = useCallback(() => {
    abcdPointsRef.current = [];
    abcdSeriesRef.current.forEach((s) => { try { chartRef.current?.removeSeries(s); } catch (e) {} });
    abcdSeriesRef.current = [];
    setAbcdProgress(0);
    refreshMarkers();
  }, [refreshMarkers]);

  const renderSavedDrawings = useCallback(() => {
    if (!seriesRef.current || !chartRef.current) return;
    for (const d of drawings || []) {
      if (d.interval && d.interval !== interval) continue;
      if (d.type === "horizontal_line") {
        seriesRef.current.createPriceLine({
          price: d.data.price, color: "#e0b34c", lineWidth: 1, lineStyle: 3,
          title: d.data.label || "cross line",
        });
      } else if (d.type === "abcd_pattern") {
        const pts = d.data.points;
        for (let i = 0; i < pts.length - 1; i++) {
          drawSegment(
            { chartTime: pts[i].chartTime, price: pts[i].price },
            { chartTime: pts[i + 1].chartTime, price: pts[i + 1].price }
          );
        }
      }
    }
  }, [drawings, interval, drawSegment]);

  useEffect(() => {
    if (!containerRef.current || !bars || bars.length === 0) return;
    containerRef.current.innerHTML = "";
    abcdSeriesRef.current = [];
    abcdPointsRef.current = [];
    setAbcdProgress(0);
    setLastPatternStats(null);

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 300,
      layout: { background: { color: "transparent" }, textColor: "#8a93a6", fontFamily: "IBM Plex Mono" },
      grid: { vertLines: { color: "#232a36" }, horzLines: { color: "#232a36" } },
      timeScale: { borderColor: "#2a3140" },
      rightPriceScale: { borderColor: "#2a3140" },
      crosshair: { mode: 0 },
    });
    const series = chart.addCandlestickSeries({
      upColor: "#4bd0a0", downColor: "#e2645a", borderVisible: false,
      wickUpColor: "#4bd0a0", wickDownColor: "#e2645a",
    });

    const chartData = bars.map((b) => ({ time: toChartTime(b.time, interval), open: b.open, high: b.high, low: b.low, close: b.close }));
    series.setData(chartData);
    chartRef.current = chart;
    seriesRef.current = series;

    // EMA overlays (daily only, where the strategy actually uses them)
    if (interval === "daily") {
      const emaMap = computeAllEMAs(bars);
      for (const period of EMA_PERIODS) {
        const line = chart.addLineSeries({ color: EMA_COLORS[period], lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: `EMA ${period}` });
        const data = bars.map((b, i) => ({ time: toChartTime(b.time, interval), value: emaMap[period][i] })).filter((d) => d.value !== null);
        line.setData(data);
      }
    }

    if (analysis?.zone && interval === "daily") {
      series.createPriceLine({ price: analysis.zone.top, color: "#5c6577", lineWidth: 1, lineStyle: 2, title: "base top" });
      series.createPriceLine({ price: analysis.zone.bottom, color: "#5c6577", lineWidth: 1, lineStyle: 2, title: "base bottom" });
    }
    if (analysis?.primary) {
      const s = analysis.primary;
      series.createPriceLine({ price: s.entry, color: "#e7ebf1", lineWidth: 1, title: "entry" });
      series.createPriceLine({ price: s.stop, color: "#e2645a", lineWidth: 1, title: "stop" });
      series.createPriceLine({ price: s.target, color: "#4bd0a0", lineWidth: 1, title: "target" });
    }

    renderSavedDrawings();
    refreshMarkers();
    chart.timeScale().fitContent();

    const clickHandler = (param) => {
      if (!param.point || !seriesRef.current) return;
      const price = seriesRef.current.coordinateToPrice(param.point.y);
      if (price === null) return;
      const chartTime = param.time || chartData[chartData.length - 1]?.time;
      if (!chartTime) return;

      if (modeRef.current === "line") {
        onCreateDrawing({ symbol, interval, type: "horizontal_line", data: { price, label: "cross line", chartTime } });
        onModeConsumed();
      } else if (modeRef.current === "abcd") {
        const point = { chartTime, price, label: ABCD_LABELS[abcdPointsRef.current.length] };
        const prevPoint = abcdPointsRef.current[abcdPointsRef.current.length - 1];
        abcdPointsRef.current.push(point);
        if (prevPoint) drawSegment(prevPoint, point);
        setAbcdProgress(abcdPointsRef.current.length);
        refreshMarkers();

        if (abcdPointsRef.current.length === 4) {
          const [A, B, C, D] = abcdPointsRef.current;
          const bullish = B.price >= A.price;
          const abMove = B.price - A.price;
          const bcRetracePct = abMove !== 0 ? Math.abs((B.price - C.price) / abMove) * 100 : 0;
          const cdMove = D.price - C.price;
          const confirmedContinuation = bullish ? D.price > B.price : D.price < B.price;
          const stats = { direction: bullish ? "bullish" : "bearish", abMove, bcRetracePct, cdMove, confirmedContinuation };
          setLastPatternStats(stats);
          onCreateDrawing({
            symbol, interval, type: "abcd_pattern",
            data: { points: abcdPointsRef.current.map((p) => ({ chartTime: p.chartTime, price: p.price, label: p.label })), stats },
          });
          onModeConsumed();
          setTimeout(() => clearAbcdInProgress(), 50);
        }
      }
    };
    chart.subscribeClick(clickHandler);

    const handleResize = () => chart.applyOptions({ width: containerRef.current.clientWidth });
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      chart.unsubscribeClick(clickHandler);
      chart.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars, interval, analysis, drawings]);

  return (
    <div>
      <div ref={containerRef} style={{ height: 300 }} />
      {mode === "abcd" && (
        <div className="draw-hint">
          Click point {ABCD_LABELS[abcdProgress] || "\u2014"} on the chart
          {abcdProgress > 0 ? ` (${abcdProgress}/4 placed)` : " \u2014 start with A, where the EMA cross happened"}.
        </div>
      )}
      {mode === "line" && <div className="draw-hint">Click on the chart near a cross to drop a horizontal line at that price.</div>}
      {lastPatternStats && (
        <div className="pattern-stats">
          <b>Last ABCD pattern</b> \u2014 {lastPatternStats.direction}, A\u2192B move {lastPatternStats.abMove.toFixed(5)},
          B\u2192C retrace {lastPatternStats.bcRetracePct.toFixed(0)}%,
          {" "}{lastPatternStats.confirmedContinuation ? "D confirmed continuation past B" : "D did not clear B \u2014 pattern failed"}
        </div>
      )}
    </div>
  );
}
