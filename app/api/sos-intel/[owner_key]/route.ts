import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseClient";
import type { SosIntelRow, SosLookupStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

type PatchBody = Partial<
  Pick<
    SosIntelRow,
    | "business_name"
    | "filing_type"
    | "status"
    | "file_number"
    | "registered_agent_name"
    | "registered_agent_address"
    | "principal_office_address"
    | "organizer_name"
    | "formation_date"
    | "last_renewal_date"
    | "jurisdiction"
    | "source_url"
    | "lookup_status"
    | "lookup_error"
  >
>;

const ALLOWED: (keyof PatchBody)[] = [
  "business_name",
  "filing_type",
  "status",
  "file_number",
  "registered_agent_name",
  "registered_agent_address",
  "principal_office_address",
  "organizer_name",
  "formation_date",
  "last_renewal_date",
  "jurisdiction",
  "source_url",
  "lookup_status",
  "lookup_error",
];

const STATUSES: SosLookupStatus[] = [
  "pending",
  "found",
  "not_found",
  "error",
  "manual",
];

/** GET /api/sos-intel/:owner_key — fetch one row (owner_key in URL is case-insensitive). */
export async function GET(
  _req: NextRequest,
  { params }: { params: { owner_key: string } }
) {
  const key = decodeURIComponent(params.owner_key).trim().toUpperCase();
  if (!key) {
    return NextResponse.json({ error: "Missing owner_key" }, { status: 400 });
  }
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("sos_intel")
    .select("*")
    .eq("owner_key", key)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ row: data as SosIntelRow | null });
}

/**
 * PATCH /api/sos-intel/:owner_key
 *   Upsert a manual / resolved row. When the caller sets `registered_agent_name`
 *   (or any core field) without specifying `lookup_status`, we mark it as `manual`
 *   so the scoring boost lights up immediately.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { owner_key: string } }
) {
  const key = decodeURIComponent(params.owner_key).trim().toUpperCase();
  if (!key) {
    return NextResponse.json({ error: "Missing owner_key" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  for (const k of ALLOWED) {
    if (k in body) patch[k] = body[k];
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No updatable fields" }, { status: 400 });
  }

  if (patch.lookup_status && !STATUSES.includes(patch.lookup_status as SosLookupStatus)) {
    return NextResponse.json({ error: "Invalid lookup_status" }, { status: 400 });
  }
  if (!patch.lookup_status && patch.registered_agent_name) {
    patch.lookup_status = "manual";
    patch.fetched_at = new Date().toISOString();
  }

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("sos_intel")
    .upsert(
      { owner_key: key, business_name: key, ...patch },
      { onConflict: "owner_key", ignoreDuplicates: false }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ row: data as SosIntelRow });
}

/** DELETE /api/sos-intel/:owner_key — clear a row (e.g. to re-queue a lookup). */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { owner_key: string } }
) {
  const key = decodeURIComponent(params.owner_key).trim().toUpperCase();
  if (!key) {
    return NextResponse.json({ error: "Missing owner_key" }, { status: 400 });
  }
  const supabase = getSupabaseServer();
  const { error } = await supabase.from("sos_intel").delete().eq("owner_key", key);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
