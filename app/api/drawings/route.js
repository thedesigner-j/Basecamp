import { getServiceClient } from "@/lib/supabase";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  const sb = getServiceClient();
  let query = sb.from("drawings").select("*").order("created_at", { ascending: true });
  if (symbol) query = query.eq("symbol", symbol);
  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ drawings: data || [] });
}

export async function POST(request) {
  const body = await request.json();
  const { symbol, interval, type, data } = body;
  if (!symbol || !type || !data) {
    return Response.json({ ok: false, error: "symbol, type, and data are required" }, { status: 400 });
  }
  const sb = getServiceClient();
  const { data: row, error } = await sb
    .from("drawings")
    .insert({ symbol, interval: interval || "daily", type, data })
    .select()
    .single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, drawing: row });
}

export async function DELETE(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ ok: false, error: "id is required" }, { status: 400 });
  const sb = getServiceClient();
  const { error } = await sb.from("drawings").delete().eq("id", id);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
