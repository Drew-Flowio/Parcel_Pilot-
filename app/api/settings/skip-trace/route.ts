import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

/**
 * POST /api/settings/skip-trace   { batchdata_api_key: string }
 * DELETE /api/settings/skip-trace
 *
 * Keys are stored in `public.app_settings.skip_trace_keys`. The GET route intentionally
 * does not return the key — the Settings page only reports whether one is configured.
 */
export async function POST(req: NextRequest) {
  let body: { batchdata_api_key?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const key = (body.batchdata_api_key ?? "").trim();
  if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 });
  if (key.length > 256) return NextResponse.json({ error: "Key too long" }, { status: 400 });

  const supabase = getSupabaseServer();
  const { error } = await supabase
    .from("app_settings")
    .upsert(
      {
        key: "skip_trace_keys",
        value: { batchdata_api_key: key, updated_at: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const supabase = getSupabaseServer();
  const { error } = await supabase
    .from("app_settings")
    .delete()
    .eq("key", "skip_trace_keys");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
