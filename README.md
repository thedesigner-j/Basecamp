# Basecamp — setup

A private FX swing-trading dashboard: watches the major pairs for consolidation
bases, grades primary/secondary breakout setups A/B/C, and emails you when
something changes. Built with Next.js, Supabase, and Resend, deployed on Vercel.

## 1. Open this folder in VS Code

Unzip the project, then in VS Code: **File → Open Folder…** and select the
`basecamp-app` folder.

Open a terminal inside VS Code (``Terminal → New Terminal``) for the steps
below — every command runs from the project root.

## 2. Create the Supabase project

1. At supabase.com, create a new project (free tier is fine).
2. Once it's ready, go to **SQL Editor → New query**, paste the contents of
   `supabase/schema.sql`, and run it. This creates the three tables the app needs.
3. Go to **Project Settings → API**. Copy the **Project URL** and the
   **service_role key** (not the anon key — the service role key is the one
   with full access, and it should never be shown in a browser).

## 3. Get a Resend API key

1. At resend.com, create a free account and an API key
   (**API Keys → Create API Key**).
2. For the "from" address: Resend's shared `onboarding@resend.dev` works
   immediately with no setup, but only delivers to the email you signed up
   with. To send to any address, verify a domain you own under
   **Domains → Add Domain** and use an address on it instead.

## 4. Set up local environment variables

Copy `.env.example` to `.env.local` and fill in the values you just collected:

```
cp .env.example .env.local
```

For `CRON_SECRET`, make up any random string of 16+ characters yourself —
this isn't provisioned anywhere, you're inventing a shared password between
Vercel and your own API routes.

## 5. Push to GitHub

```
git init
git add .
git commit -m "Basecamp initial commit"
```

Create a new empty repository on GitHub (no README/license — you already have
files), then:

```
git remote add origin https://github.com/YOUR-USERNAME/basecamp.git
git branch -M main
git push -u origin main
```

## 6. Deploy on Vercel

1. At vercel.com, **Add New → Project**, and import the GitHub repo you just pushed.
2. Before deploying, expand **Environment Variables** and add every value from
   your `.env.local` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `RESEND_API_KEY`, `RESEND_FROM`, `CRON_SECRET`).
3. Click **Deploy**.

Vercel will also read `vercel.json` and register the two daily cron jobs
automatically (Settings → Cron Jobs on your project will show them once
deployed).

## 7. New: EMA crosses, stacking, and drawing tools

The strategy now tracks four EMAs (8/20/50/100) on the daily chart:

- **Stacking**: how the EMAs are ordered (fastest-to-slowest by current value)
  and how many days they've held that order. This feeds a 7th grading
  criterion — "EMAs fully stacked with trade" — so grading is now out of 7
  (A = 6-7, B = 4-5, C = 1-3).
- **Trade events**: every time a base breaks out (entry) or that breakout
  fails/reverses (exit), Basecamp snapshots the EMA stack at that moment and
  the stack that came right before it, into the `trade_events` table — so you
  can look back at what the EMAs were doing going into and out of a move.
- **Cross markers**: 8/20, 20/50, and 50/100 crossovers are marked directly
  on the daily chart.
- **Line at cross**: tap the button, then click near a cross on the chart —
  drops a persistent horizontal line at that price, to watch whether price
  retraces back to it.
- **Draw ABCD**: tap the button, then click four points in order — A (the
  EMA cross), B (the high after the cross), C (the retest of the EMA), D
  (the break above B confirming continuation). It connects them and reports
  the B\u2192C retracement % and whether D actually cleared B.

**If you already ran `supabase/schema.sql` before this feature existed**, run
this once more in the Supabase SQL Editor to add what's missing:

```sql
alter table setups add column if not exists ema_context jsonb;

create table if not exists trade_events (
  id bigserial primary key,
  symbol text not null,
  event_type text not null,
  direction text,
  stack_before jsonb,
  stack_at_event jsonb,
  created_at timestamptz not null default now()
);

create table if not exists drawings (
  id bigserial primary key,
  symbol text not null,
  interval text not null default 'daily',
  type text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
```

If you haven't deployed yet, just run the full `supabase/schema.sql` — it
already includes all of this.

## 8. First-time setup in the app itself

1. Open your new `*.vercel.app` URL.
2. Go to **Settings**, paste your Twelve Data API key, add your alert email,
   and save.
3. Back on the main page, tap **Refresh now**. First sync takes about a
   minute (it fetches daily candles, waits for Twelve Data's free-tier rate
   limit to reset, then fetches 4-hour candles).

From here it re-syncs on its own once a day, and emails you when a setup
changes — you only need to open it when you want to look, or when an email
tells you to.

## Making future edits

Whenever you want to change something (add a pair, tweak the scoring, adjust
colors): edit the files in VS Code, then:

```
git add .
git commit -m "describe what changed"
git push
```

Vercel redeploys automatically within a minute or two of the push — no
dashboard clicking required.

## A note on the free tiers

- **Twelve Data free plan**: 8 API credits/minute, 800/day. Each daily or 4H
  refresh uses 7 credits (one batched request for all 7 pairs), so this is
  nowhere close to the daily cap even with the manual refresh button used
  often.
- **Vercel Hobby plan**: cron jobs are capped at once/day minimum frequency
  and 2 jobs max — which is exactly what this app uses. If you ever want
  more frequent automatic checks, that requires a Vercel Pro plan.
- **Supabase free plan**: comfortably covers this app's tiny amount of data.
- **Resend free plan**: 3,000 emails/month, more than enough for setup alerts.
