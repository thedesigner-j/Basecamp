import { getServiceClient } from "./supabase";
import { fetchBatch } from "./twelvedata";
import { buildSetups, PAIRS } from "./analysis";
import { sendAlertEmail } from "./email";

export async function getSettings() {
  const sb = getServiceClient();
  const { data } = await sb.from("settings").select("*").eq("id", 1).single();
  return data;
}

export async function runDailyRefresh() {
  const settings = await getSettings();
  if (!settings?.twelvedata_api_key) return { ok: false, error: "No Twelve Data API key saved yet." };

  const symbols = PAIRS.map((p) => p.symbol);
  // 150 bars gives the 100-period EMA a proper seed plus room to see how long
  // the stack has been in its current configuration.
  const batch = await fetchBatch(symbols, "1day", 150, settings.twelvedata_api_key);

  const sb = getServiceClient();
  for (const p of PAIRS) {
    const bars = batch[p.symbol];
    if (bars) {
      await sb.from("candles").upsert({ symbol: p.symbol, interval: "daily", data: bars, fetched_at: new Date().toISOString() });
    }
  }
  await recomputeAndAlert(settings);
  return { ok: true, fetched: Object.keys(batch).length };
}

export async function runH4Refresh() {
  const settings = await getSettings();
  if (!settings?.twelvedata_api_key) return { ok: false, error: "No Twelve Data API key saved yet." };

  const symbols = PAIRS.map((p) => p.symbol);
  const batch = await fetchBatch(symbols, "4h", 120, settings.twelvedata_api_key);

  const sb = getServiceClient();
  for (const p of PAIRS) {
    const bars = batch[p.symbol];
    if (bars) {
      await sb.from("candles").upsert({ symbol: p.symbol, interval: "h4", data: bars, fetched_at: new Date().toISOString() });
    }
  }
  await recomputeAndAlert(settings);
  return { ok: true, fetched: Object.keys(batch).length };
}

async function recomputeAndAlert(settings) {
  const sb = getServiceClient();
  const { data: candleRows } = await sb.from("candles").select("*");
  const bySymbol = {};
  for (const row of candleRows || []) {
    bySymbol[row.symbol] = bySymbol[row.symbol] || {};
    bySymbol[row.symbol][row.interval] = row.data;
  }

  const { data: prevSetups } = await sb.from("setups").select("*");
  const prevBySymbol = Object.fromEntries((prevSetups || []).map((s) => [s.symbol, s]));

  const alerts = [];

  for (const p of PAIRS) {
    const record = bySymbol[p.symbol];
    if (!record || !record.daily) continue;

    const analysis = buildSetups({ daily: record.daily, h4: record.h4 });
    if (!analysis || !analysis.zone) {
      await sb.from("setups").upsert({
        symbol: p.symbol, trend_daily: null, trend_4h: null, zone: null, status: null,
        primary_setup: null, secondary_setup: null, updated_at: new Date().toISOString(),
      });
      continue;
    }

    const prev = prevBySymbol[p.symbol];
    const reasons = [];
    if (analysis.primary.grade === "A" && prev?.primary_setup?.grade !== "A") reasons.push("primary setup is now grade A");

    const wasBroken = prev?.status === "brokenUp" || prev?.status === "brokenDown";
    const isBroken = analysis.status === "brokenUp" || analysis.status === "brokenDown";

    // Entry event: newly broke out (wasn't broken before, or flipped direction)
    if (isBroken && prev?.status !== analysis.status) {
      reasons.push(analysis.status === "brokenUp" ? "base broke out to the upside" : "base broke down");
      if (analysis.emaContext) {
        await sb.from("trade_events").insert({
          symbol: p.symbol,
          event_type: "entry",
          direction: analysis.status === "brokenUp" ? "long" : "short",
          stack_before: analysis.emaContext.previousStack,
          stack_at_event: analysis.emaContext.currentStack,
        });
      }
    }
    // Exit event: was broken, now isn't (or flipped) — the prior trade's run ended
    if (wasBroken && prev.status !== analysis.status && analysis.emaContext) {
      await sb.from("trade_events").insert({
        symbol: p.symbol,
        event_type: "exit",
        direction: prev.status === "brokenUp" ? "long" : "short",
        stack_before: null,
        stack_at_event: analysis.emaContext.currentStack,
      });
    }

    if (reasons.length) alerts.push({ symbol: p.symbol, analysis, reasons });

    // emaMap holds a full per-bar array for all 4 EMAs — useful for the chart
    // (which recomputes it client-side from candles anyway) but not worth
    // storing in the setups row, so strip it before persisting.
    const { emaMap, ...emaContextForStorage } = analysis.emaContext || {};

    await sb.from("setups").upsert({
      symbol: p.symbol,
      trend_daily: analysis.trendDaily,
      trend_4h: analysis.trend4h,
      zone: analysis.zone,
      status: analysis.status,
      primary_setup: analysis.primary,
      secondary_setup: analysis.secondary,
      ema_context: analysis.emaContext ? emaContextForStorage : null,
      updated_at: new Date().toISOString(),
    });
  }

  if (alerts.length && settings.alerts_enabled && settings.alert_email) {
    try {
      await sendAlertEmail(settings.alert_email, alerts);
    } catch (e) {
      console.error("Failed to send alert email", e);
    }
  }
}
