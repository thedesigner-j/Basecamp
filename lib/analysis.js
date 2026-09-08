export const PAIRS = [
  { symbol: "EUR/USD", label: "EUR/USD" },
  { symbol: "GBP/USD", label: "GBP/USD" },
  { symbol: "USD/JPY", label: "USD/JPY" },
  { symbol: "USD/CHF", label: "USD/CHF" },
  { symbol: "AUD/USD", label: "AUD/USD" },
  { symbol: "USD/CAD", label: "USD/CAD" },
  { symbol: "NZD/USD", label: "NZD/USD" },
];

export function fmt(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n >= 20 ? n.toFixed(3) : n.toFixed(5);
}

export function computeATR(bars, period) {
  if (bars.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i], p = bars[i - 1];
    trs.push(Math.max(b.high - b.low, Math.abs(b.high - p.close), Math.abs(b.low - p.close)));
  }
  const recent = trs.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

export function findPivots(bars, lr) {
  const pivots = [];
  for (let i = lr; i < bars.length - lr; i++) {
    let isHigh = true, isLow = true;
    for (let j = i - lr; j <= i + lr; j++) {
      if (j === i) continue;
      if (bars[j].high >= bars[i].high) isHigh = false;
      if (bars[j].low <= bars[i].low) isLow = false;
    }
    if (isHigh) pivots.push({ index: i, type: "high", price: bars[i].high });
    if (isLow) pivots.push({ index: i, type: "low", price: bars[i].low });
  }
  return pivots;
}

export function classifyTrend(bars) {
  if (!bars || bars.length < 20) return "range";
  const pivots = findPivots(bars, 3);
  const highs = pivots.filter((p) => p.type === "high").slice(-2);
  const lows = pivots.filter((p) => p.type === "low").slice(-2);
  if (highs.length === 2 && lows.length === 2) {
    const higherHighs = highs[1].price > highs[0].price;
    const higherLows = lows[1].price > lows[0].price;
    const lowerHighs = highs[1].price < highs[0].price;
    const lowerLows = lows[1].price < lows[0].price;
    if (higherHighs && higherLows) return "up";
    if (lowerHighs && lowerLows) return "down";
  }
  return "range";
}

// Finds the most recent contiguous run of bars, near the end of the series,
// whose combined high-low range is tight relative to ATR — i.e. a base.
export function findConsolidationZone(bars, atr) {
  if (!atr || bars.length < 10) return null;
  const maxLookback = Math.min(40, bars.length);
  const recent = bars.slice(bars.length - maxLookback);
  const threshold = atr * 2.2;

  let bestRun = null;
  for (let start = recent.length - 1; start >= 0; start--) {
    const window = recent.slice(start);
    if (window.length < 5) continue;
    const top = Math.max(...window.map((b) => b.high));
    const bottom = Math.min(...window.map((b) => b.low));
    const range = top - bottom;
    if (range <= threshold) {
      bestRun = { start, top, bottom, duration: window.length };
    } else if (bestRun) {
      break;
    }
  }
  if (!bestRun) return null;
  return {
    top: bestRun.top,
    bottom: bestRun.bottom,
    duration: bestRun.duration,
    height: bestRun.top - bestRun.bottom,
  };
}

export function scoreSetup(dir, ctx) {
  const { trendDaily, trend4h, zone, atr, rr, distanceFromEdge, emaAligned } = ctx;
  const checks = [
    { label: "Daily trend agrees", met: (trendDaily === "up" && dir === "long") || (trendDaily === "down" && dir === "short") || trendDaily === "range" },
    { label: "4H structure agrees", met: (trend4h === "up" && dir === "long") || (trend4h === "down" && dir === "short") },
    { label: "Base held 8+ days", met: zone.duration >= 8 },
    { label: "Base is tight (\u22641.2\u00d7 ATR)", met: zone.height <= atr * 1.2 },
    { label: "Reward:risk \u2265 2", met: rr >= 2 },
    { label: "Not chasing (near the base)", met: distanceFromEdge <= atr * 0.6 },
    { label: "EMAs fully stacked with trade", met: !!emaAligned },
  ];
  const count = checks.filter((c) => c.met).length;
  const grade = count >= 6 ? "A" : count >= 4 ? "B" : "C";
  return { checks, count, grade };
}

// ---------- EMA / stacking / cross analysis ----------

export const EMA_PERIODS = [8, 20, 50, 100];

export function computeEMA(bars, period) {
  const k = 2 / (period + 1);
  const out = new Array(bars.length).fill(null);
  if (bars.length < period) return out;
  let seed = 0;
  for (let i = 0; i < period; i++) seed += bars[i].close;
  seed /= period;
  out[period - 1] = seed;
  for (let i = period; i < bars.length; i++) {
    out[i] = bars[i].close * k + out[i - 1] * (1 - k);
  }
  return out;
}

export function computeAllEMAs(bars) {
  const map = {};
  for (const p of EMA_PERIODS) map[p] = computeEMA(bars, p);
  return map;
}

// Signature = EMA periods ordered from highest current value to lowest,
// e.g. "8>20>50>100" is a fully bullish stack, "100>50>20>8" fully bearish.
function stackSignatureAt(emaMap, i) {
  const entries = EMA_PERIODS.map((p) => ({ p, v: emaMap[p][i] }));
  if (entries.some((e) => e.v === null || e.v === undefined)) return null;
  entries.sort((a, b) => b.v - a.v);
  return entries.map((e) => e.p).join(">");
}

export function isFullyBullish(sig) {
  return sig === EMA_PERIODS.join(">");
}
export function isFullyBearish(sig) {
  return sig === [...EMA_PERIODS].reverse().join(">");
}

// Groups consecutive bars sharing the same stack signature into runs.
export function computeStackRuns(bars, emaMap) {
  const runs = [];
  let current = null;
  for (let i = 0; i < bars.length; i++) {
    const sig = stackSignatureAt(emaMap, i);
    if (sig === null) continue;
    if (!current || current.signature !== sig) {
      if (current) runs.push(current);
      current = { signature: sig, startIndex: i, endIndex: i, startTime: bars[i].time, endTime: bars[i].time, duration: 1 };
    } else {
      current.endIndex = i;
      current.endTime = bars[i].time;
      current.duration += 1;
    }
  }
  if (current) runs.push(current);
  return runs;
}

// Detects every crossover between two EMA lines across the series.
export function detectCrosses(bars, emaMap, periodA, periodB) {
  const a = emaMap[periodA], b = emaMap[periodB];
  const crosses = [];
  for (let i = 1; i < bars.length; i++) {
    if (a[i] == null || b[i] == null || a[i - 1] == null || b[i - 1] == null) continue;
    const prevDiff = a[i - 1] - b[i - 1];
    const diff = a[i] - b[i];
    if (prevDiff === 0) continue;
    if ((prevDiff < 0 && diff > 0) || (prevDiff > 0 && diff < 0)) {
      crosses.push({
        index: i,
        time: bars[i].time,
        price: bars[i].close,
        direction: diff > 0 ? "bullish" : "bearish", // periodA crossed above/below periodB
        periodA,
        periodB,
        label: `${periodA}/${periodB} ${diff > 0 ? "bullish" : "bearish"} cross`,
      });
    }
  }
  return crosses;
}

export function buildEmaContext(bars) {
  if (!bars || bars.length < Math.max(...EMA_PERIODS) + 5) return null;
  const emaMap = computeAllEMAs(bars);
  const runs = computeStackRuns(bars, emaMap);
  if (runs.length === 0) return null;

  const current = runs[runs.length - 1];
  const previous = runs.length > 1 ? runs[runs.length - 2] : null;

  const pairKeys = [[8, 20], [20, 50], [50, 100]];
  let allCrosses = [];
  for (const [pA, pB] of pairKeys) {
    allCrosses = allCrosses.concat(detectCrosses(bars, emaMap, pA, pB));
  }
  allCrosses.sort((x, y) => y.index - x.index);

  return {
    emaMap,
    currentStack: { signature: current.signature, duration: current.duration, since: current.startTime },
    previousStack: previous ? { signature: previous.signature, duration: previous.duration, since: previous.startTime } : null,
    recentCrosses: allCrosses.slice(0, 6),
    isFullyBullishNow: isFullyBullish(current.signature),
    isFullyBearishNow: isFullyBearish(current.signature),
  };
}

export function buildSetups(record) {
  const { daily, h4 } = record;
  if (!daily || daily.length < 20) return null;
  const atr = computeATR(daily, 14);
  const zone = findConsolidationZone(daily, atr);
  if (!zone || !atr) return { zone: null };

  const trendDaily = classifyTrend(daily);
  const trend4h = h4 && h4.length >= 20 ? classifyTrend(h4) : "range";
  const price = daily[daily.length - 1].close;
  const buffer = atr * 0.25;
  const zoneHeight = zone.height;
  const emaContext = buildEmaContext(daily);

  const breakoutMargin = zoneHeight * 0.1;
  let status;
  if (price > zone.top + breakoutMargin) status = "brokenUp";
  else if (price < zone.bottom - breakoutMargin) status = "brokenDown";
  else status = "inside";

  function makeSetup(dir, entry, stop, isPending, triggerNote) {
    const risk = Math.abs(entry - stop);
    const target = dir === "long" ? entry + Math.max(zoneHeight, 2 * risk) : entry - Math.max(zoneHeight, 2 * risk);
    const rr = risk > 0 ? Math.abs(target - entry) / risk : 0;
    const edgePrice = dir === "long" ? zone.top : zone.bottom;
    const distanceFromEdge = Math.abs(price - edgePrice);
    const emaAligned = emaContext ? (dir === "long" ? emaContext.isFullyBullishNow : emaContext.isFullyBearishNow) : false;
    const scored = scoreSetup(dir, { trendDaily, trend4h, zone, atr, rr, distanceFromEdge, emaAligned });
    return { direction: dir, entry, stop, target, rr, isPending, triggerNote, ...scored };
  }

  let primary, secondary;

  if (status === "brokenUp") {
    primary = makeSetup("long", price, zone.bottom - buffer, false, null);
    secondary = makeSetup("short", zone.bottom - buffer, zone.top + buffer, true, `Activates if price falls back below ${fmt(zone.bottom - buffer)} (failed breakout)`);
  } else if (status === "brokenDown") {
    primary = makeSetup("short", price, zone.top + buffer, false, null);
    secondary = makeSetup("long", zone.top + buffer, zone.bottom - buffer, true, `Activates if price pushes back above ${fmt(zone.top + buffer)} (failed breakdown)`);
  } else {
    const bias = trendDaily === "down" ? "short" : "long";
    if (bias === "long") {
      primary = makeSetup("long", zone.top + buffer, zone.bottom - buffer, true, `Triggers on a close above ${fmt(zone.top + buffer)}`);
      secondary = makeSetup("short", zone.bottom - buffer, zone.top + buffer, true, `Triggers on a close below ${fmt(zone.bottom - buffer)}`);
    } else {
      primary = makeSetup("short", zone.bottom - buffer, zone.top + buffer, true, `Triggers on a close below ${fmt(zone.bottom - buffer)}`);
      secondary = makeSetup("long", zone.top + buffer, zone.bottom - buffer, true, `Triggers on a close above ${fmt(zone.top + buffer)}`);
    }
  }

  return { zone, status, trendDaily, trend4h, price, primary, secondary, atr, emaContext };
}
