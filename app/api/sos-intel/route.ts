import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseClient";
import { ownerKeyFromName } from "@/lib/intelligence";
import type { SosIntelRow } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/sos-intel
 *   ?owner_key=ACME+HOLDINGS+LLC         exact lookup
 *   ?q=acme                              ilike search on business_name/owner_key
 *   ?agent=john                          ilike search on registered_agent_name
 *   ?status=pending|found|not_found|error|manual
 *   ?limit=50
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const owner_key = sp.get("owner_key");
  const q = sp.get("q")?.trim();
  const agent = sp.get("agent")?.trim();
  const status = sp.get("status");
  const limit = Math.min(500, Math.max(1, Number(sp.get("limit") ?? 50)));

  const supabase = getSupabaseServer();
  let query = supabase.from("sos_intel").select("*", { count: "estimated" });

  if (owner_key) {
    query = query.eq("owner_key", owner_key.toUpperCase());
  } else if (q) {
    const pattern = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
    query = query.or(
      `owner_key.ilike.${JSON.stringify(pattern)},business_name.ilike.${JSON.stringify(pattern)}`
    );
  }
  if (agent) {
    query = query.ilike("registered_agent_name", `%${agent}%`);
  }
  if (status) {
    query = query.eq("lookup_status", status);
  }

  query = query.order("updated_at", { ascending: false }).limit(limit);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    rows: (data ?? []) as SosIntelRow[],
    total: count ?? 0,
  });
}

/**
 * POST /api/sos-intel
 *   body: { owner_keys?: string[], owner_names?: string[], updates?: Partial<SosIntelRow>[] }
 *
 * Dual purpose:
 *  1. **Enqueue**: given a list of names, upsert `sos_intel` rows with `lookup_status=pending`
 *     (this is what the UI calls to stage LLC lookups — the actual scraper is future work).
 *  2. **Ingest**: given `updates`, upsert pre-resolved SOS data (e.g. from a manual lookup or
 *     a future BatchData/SOS scraper) into the same table.
 */
export async function POST(req: NextRequest) {
  let body: {
    owner_keys?: string[];
    owner_names?: string[];
    updates?: Array<Partial<SosIntelRow>>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = getSupabaseServer();
  const rows: Array<Partial<SosIntelRow>> = [];

  const enqueueKeys = new Set<string>();
  for (const n of body.owner_names ?? []) {
    const key = ownerKeyFromName(n);
    if (key) enqueueKeys.add(key);
  }
  for (const k of body.owner_keys ?? []) {
    const key = (k ?? "").trim().toUpperCase();
    if (key) enqueueKeys.add(key);
  }
  for (const key of enqueueKeys) {
    rows.push({
      owner_key: key,
      business_name: key,
      lookup_status: "pending",
    });
  }
  for (const u of body.updates ?? []) {
    if (!u.owner_key) continue;
    rows.push({ ...u, owner_key: u.owner_key.toUpperCase() });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "Nothing to upsert" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("sos_intel")
    .upsert(rows, { onConflict: "owner_key", ignoreDuplicates: false })
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, upserted: data?.length ?? 0, rows: data });
}
