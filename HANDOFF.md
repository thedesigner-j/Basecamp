# Basecamp — handoff notes

Context for picking this project up in Claude Code. Read this before making
changes — it captures decisions made in chat that aren't obvious from the
code alone.

## What this is

A private, single-user FX swing-trading dashboard. The person trades majors
manually, holds 2-5 days (no day trading), and wants the app to do the
watching so they don't have to stare at charts. It surfaces graded trade
setups; they decide whether to act on them. Not a broker connection, not
automated execution — analysis and alerting only.

## Stack and why

- **Next.js 14 (App Router, JS not TS)** on **Vercel** — free hosting,
  auto-deploy on git push, built-in cron.
- **Supabase** (Postgres, service-role key only, RLS off) — stores API key,
  cached candles, computed setups, trade event history, and chart drawings.
  All access is server-side; the browser never talks to Supabase directly
  or holds the Twelve Data key.
- **Twelve Data** free tier for FX candles — chosen over Alpaca (Alpaca has
  no forex) and over scraping TradingView (no ToS-compliant way to pull
  data from a Plus plan). Free tier license explicitly permits personal/
  internal use, which this is.
- **Resend** for email alerts.
- **lightweight-charts** (TradingView's own open-source charting library)
  for the candlestick rendering — this is how the chart gets "rebuilt"
  without needing any TradingView data API (which doesn't exist for retail
  plans anyway).

## Key constraints that shaped the design

- **Twelve Data free tier**: 8 credits/minute, 800/day. Solved by batching
  all 7 pairs into ONE request per interval (`symbol=EUR/USD,GBP/USD,...`)
  instead of 14 separate calls — keeps each refresh to 1-2 fast HTTP calls
  instead of a slow sequential loop that would blow serverless timeouts.
- **Vercel Hobby plan cron limits**: max 2 cron jobs, minimum once-daily
  frequency. This is fine — swing trading doesn't need intraday polling —
  so the cron schedule is exactly 2 jobs, once a day, 5 minutes apart
  (`vercel.json`). Manual "Refresh now" in the UI is available anytime;
  it calls the daily and 4H refresh endpoints ~61 seconds apart client-side
  to respect the per-minute rate limit without needing a long-running
  serverless function.

## The strategy logic (lib/analysis.js)

This is the part most likely to need tuning — it's a reasonable first-pass
rule set, not backtested.

1. **Consolidation zone ("base")**: on the daily chart, find the longest
   recent run of bars (min 5) whose combined high-low range stays within
   2.2x the single-bar ATR(14). That range's top/bottom is the "base."
2. **Trend**: classified via swing pivots (5-bar fractal highs/lows) —
   higher-highs+higher-lows = up, lower-highs+lower-lows = down, else range.
   Computed separately for daily and 4H.
3. **Status**: price above base top (+10% of base height buffer) = brokenUp;
   below base bottom = brokenDown; otherwise inside (pending).
4. **Primary / Secondary setups**:
   - If already broken out: primary = trade the breakout now; secondary =
     the failed-breakout fade (mirror trade, triggers if price falls back
     through the base).
   - If still inside the base: primary = pending breakout in the direction
     of the daily trend; secondary = the opposite pending breakout.
   - Entry/stop are placed at the base edges ± a 0.25xATR buffer. Target =
     entry + max(base height, 2x risk) in the trade direction.
5. **Grading (A/B/C)** — 7 checks, count met determines grade
   (A=6-7, B=4-5, C=1-3):
   - Daily trend agrees with trade direction
   - 4H structure agrees
   - Base held 8+ days
   - Base is tight (height <= 1.2x ATR)
   - Reward:risk >= 2
   - Not chasing (price within 0.6xATR of the base edge)
   - EMAs fully stacked in the trade's direction (see below)

## EMA cross / stacking analysis (added after initial build)

Four EMAs on the daily chart: **8, 20, 50, 100** (20/50/100 mirror what the
user tracks on TradingView; 8 was added here since Basecamp computes its
own indicators instead of importing from TradingView).

- `computeStackRuns()` groups consecutive daily bars by EMA ordering
  signature (e.g. `"8>20>50>100"` = fully bullish stack) and measures how
  many days each configuration held before changing.
- On every refresh, if a setup's status just transitioned to brokenUp/
  brokenDown (an "entry") or away from one (an "exit"), a row is written to
  `trade_events` capturing: the stack right before the event, and the stack
  at the event, each with duration. This is meant to let the user later
  look back at "what were the EMAs doing going into/out of trades that
  worked vs. didn't" — **there's no UI for querying/reviewing this table
  yet**, it's just being logged. Building a review screen for
  `trade_events` is a natural next step.
- Cross detection (`detectCrosses`) runs pairwise on 8/20, 20/50, 50/100
  and marks them on the chart.

## Drawing tools (components/PairChart.js, components/PairBlock.js)

Two click-driven tools, persisted per-symbol in the `drawings` table:

- **"Line at cross"**: single click on the chart converts the click's pixel
  position to a price via `series.coordinateToPrice(y)` and drops a
  persistent horizontal price line there. One-shot — mode resets after one
  click. Intent: click near a marked EMA cross, see if price later
  retraces to that level.
- **"Draw ABCD"**: four sequential clicks, modeled after TradingView's
  Elliott Wave / XABCD tool: **A** = where the EMA cross happened, **B** =
  the high made after the cross, **C** = where price retested the EMA,
  **D** = where price broke back above B (continuation confirmation).
  Connects the points with dashed line segments (implemented as 2-point
  `addLineSeries` calls — lightweight-charts v4 has no native trendline
  primitive) and computes: direction (bullish/bearish based on B vs A),
  the A→B move size, the B→C retracement %, and whether D actually cleared
  B (`confirmedContinuation`).

**Known imprecision**: `coordinateToPrice` reads the literal pixel the user
clicked, which can be a bit off on small/zoomed mobile screens. No snapping
to the nearest candle/EMA value is implemented yet — if that turns out to
matter in practice, adding a "snap to nearest EMA cross" mode for point A
specifically would be a good improvement (the cross times/prices are
already computed in `emaContext.recentCrosses`, so it's a matter of finding
the nearest one to the click and using its exact values instead).

## Directory structure

```
app/
  page.js                 main dashboard (client component)
  settings/page.js        API key + alert email form
  api/
    cron/daily/route.js   Vercel cron target, requires CRON_SECRET bearer auth
    cron/h4/route.js      same, for 4H candles
    manual-refresh/route.js  POST {stage:'daily'|'h4'}, called by the UI button
    state/route.js        GET — all candles + setups for the frontend
    settings/route.js     GET/POST — API key, alert email, alerts on/off
    drawings/route.js     GET/POST/DELETE — persisted chart drawings
components/
  PairBlock.js             collapsible per-pair section: chart + setup cards + EMA panel
  PairChart.js              lightweight-charts wrapper, EMA overlays, click tools
lib/
  analysis.js              all strategy math — pure functions, no I/O
  twelvedata.js             batched fetch from Twelve Data
  refresh.js                 orchestration: fetch → store → recompute → alert
  supabase.js                 service-role client factory
  email.js                    Resend alert email
supabase/schema.sql          run this in Supabase SQL editor (idempotent — safe to re-run)
```

## Deployment checklist (not yet done as of this handoff)

Full step-by-step is in `README.md`. Short version:

1. Create Supabase project, run `supabase/schema.sql`.
2. Get a Resend API key (and optionally verify a sending domain).
3. `git init` this folder, push to a new GitHub repo.
4. Import that repo into Vercel, add env vars
   (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`,
   `RESEND_FROM`, `CRON_SECRET` — CRON_SECRET is any string you invent
   yourself, used to authenticate Vercel's cron requests).
5. Deploy. Vercel auto-registers the two cron jobs from `vercel.json`.
6. Open the deployed app → Settings → paste Twelve Data key + alert email
   → Save → back on the main page tap "Refresh now" for the first sync.

## Open questions / good next steps

- No backtest has been run on the scoring rules — thresholds (ATR
  multipliers, base duration minimums, R:R minimum) are reasonable
  starting guesses, not validated. Worth revisiting once there's a few
  weeks of real setups to compare against outcomes.
- `trade_events` is logged but has no review UI yet.
- No auth/password on the deployed app — anyone with the URL can view it
  and trigger a manual refresh (burns Twelve Data credits, nothing more
  sensitive than that). Vercel's Deployment Protection is the easy fix if
  that ever matters.
- ABCD tool has no "snap to exact cross" option yet (see note above).
- EMA periods are hardcoded to 8/20/50/100 in `lib/analysis.js`
  (`EMA_PERIODS` constant) — changing them is a one-line edit but will
  invalidate the meaning of existing `trade_events` stack signatures.
