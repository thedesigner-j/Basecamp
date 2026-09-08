function parseValues(values) {
  return values
    .map((v) => ({ time: v.datetime, open: +v.open, high: +v.high, low: +v.low, close: +v.close }))
    .reverse(); // Twelve Data returns newest-first; we want oldest-first for charting/analysis
}

// Fetches all symbols in ONE request using Twelve Data's batch symbol support
// (symbol=A,B,C). This keeps the whole refresh to a single HTTP call, well
// under any serverless timeout, and uses one credit per symbol against the
// free tier's 8-credits/minute cap.
export async function fetchBatch(symbols, interval, outputsize, apiKey) {
  const symbolParam = symbols.join(",");
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbolParam)}&interval=${interval}&outputsize=${outputsize}&apikey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();

  const result = {};
  if (symbols.length === 1) {
    if (json.status === "error" || !json.values) throw new Error(json.message || "Twelve Data error");
    result[symbols[0]] = parseValues(json.values);
    return result;
  }

  for (const sym of symbols) {
    const entry = json[sym];
    if (!entry || entry.status === "error" || !entry.values) continue;
    result[sym] = parseValues(entry.values);
  }
  return result;
}
