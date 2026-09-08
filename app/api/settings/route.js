import { getServiceClient } from "@/lib/supabase";

export async function GET() {
  const sb = getServiceClient();
  const { data } = await sb.from("settings").select("*").eq("id", 1).single();
  return Response.json(data || {});
}

export async function POST(request) {
  const body = await request.json();
  const sb = getServiceClient();
  const { error } = await sb.from("settings").upsert({ id: 1, ...body });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
