import { runDailyRefresh, runH4Refresh } from "@/lib/refresh";

// Called twice by the client (daily, then h4 ~60s later) so each call stays
// a single fast batched request and we don't blow past Twelve Data's
// 8-credits-per-minute free tier cap.
export async function POST(request) {
  const { stage } = await request.json();
  try {
    const result = stage === "h4" ? await runH4Refresh() : await runDailyRefresh();
    return Response.json(result);
  } catch (e) {
    console.error(e);
    return Response.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}
