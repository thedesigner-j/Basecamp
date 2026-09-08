import { getServiceClient } from "@/lib/supabase";

export async function GET() {
  try {
    const sb = getServiceClient();
    const [{ data: setups }, { data: candles }] = await Promise.all([
      sb.from("setups").select("*"),
      sb.from("candles").select("*"),
    ]);
    return Response.json({ setups: setups || [], candles: candles || [] });
  } catch (e) {
    console.error(e);
    return Response.json({ setups: [], candles: [], error: String(e.message || e) }, { status: 500 });
  }
}
