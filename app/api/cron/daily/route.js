import { runDailyRefresh } from "@/lib/refresh";

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const result = await runDailyRefresh();
    return Response.json(result);
  } catch (e) {
    console.error(e);
    return Response.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}
