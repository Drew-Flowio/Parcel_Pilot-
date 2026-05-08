import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseClient";
import { requireSyncSecret } from "@/lib/skywalk/auth";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/skywalk/match
 *
 * Re-run the parcel-link matchers for any rows that don't currently have
 * a `parcel_id` populated. Triggers run on insert/update of
 * `normalized_address` / `phone` / `email`, but if a matching parcel
 * arrives in `parcels_raw` AFTER the Skywalk row was already ingested,
 * the trigger never re-fires. This endpoint is the operator-callable
 * reconciliation pass.
 *
 * Auth: x-skywalk-sync-secret. Same secret as the ingest endpoints.
 *
 * Body (optional):
 *   {
 *     "scope": "all" | "properties" | "contacts",   // default "all"
 *     "limit": 5000                                  // safety cap
 *   }
 *
 * Response:
 *   {
 *     "ok": true,
 *     "properties_matched": N,
 *     "contacts_matched":   N,
 *     "duration_ms": N
 *   }
 *
 * Idempotent. Safe to run on a schedule. Should be called manually after
 * a fresh Hennepin import or a bulk Skywalk backfill.
 */
export async function POST(req: NextRequest) {
  const authError = requireSyncSecret(req);
  if (authError) return authError;

  const startedAt = Date.now();

  let body: { scope?: string; limit?: number } = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    body = {};
  }
  const scope = body.scope === "properties" || body.scope === "contacts" ? body.scope : "all";
  const limit = clampInt(body.limit, 100, 50_000, 5_000);

  const supabase = getSupabaseServer();
  let propertiesMatched = 0;
  let contactsMatched = 0;

  if (scope === "all" || scope === "properties") {
    // Re-link unlinked properties via address. We pull a batch and update
    // each — keeps the work bounded and SQL simple.
    const { data: rows, error } = await supabase
      .from("skywalk_properties")
      .select("id, normalized_address")
      .is("parcel_id", null)
      .not("normalized_address", "is", null)
      .limit(limit);
    if (error) {
      log.error({
        evt: "skywalk.match.properties.list_error",
        error: error.message,
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    for (const r of rows ?? []) {
      const addr = (r as { normalized_address: string | null }).normalized_address;
      if (!addr) continue;
      const { data: matchData } = await supabase.rpc("match_parcel_by_address", {
        p_normalized_address: addr,
      });
      const parcelId = typeof matchData === "string" ? matchData : null;
      if (!parcelId) continue;

      const { error: upErr } = await supabase
        .from("skywalk_properties")
        .update({ parcel_id: parcelId })
        .eq("id", (r as { id: string }).id)
        .is("parcel_id", null);
      if (!upErr) propertiesMatched += 1;
    }
  }

  if (scope === "all" || scope === "contacts") {
    const { data: rows, error } = await supabase
      .from("skywalk_contacts")
      .select("id, phone, email")
      .is("parcel_id", null)
      .or("phone.not.is.null,email.not.is.null")
      .limit(limit);
    if (error) {
      log.error({
        evt: "skywalk.match.contacts.list_error",
        error: error.message,
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    for (const r of rows ?? []) {
      const row = r as { id: string; phone: string | null; email: string | null };
      const { data: matchData } = await supabase.rpc("match_parcel_by_contact", {
        p_phone: row.phone ?? null,
        p_email: row.email ?? null,
      });

      const arr = Array.isArray(matchData) ? matchData : [];
      const m = arr[0] as { parcel_id?: string | null; match_field?: string | null } | undefined;
      const parcelId = m?.parcel_id ?? null;
      const field = m?.match_field ?? null;
      if (!parcelId) continue;

      const { error: upErr } = await supabase
        .from("skywalk_contacts")
        .update({ parcel_id: parcelId, parcel_match_field: field })
        .eq("id", row.id)
        .is("parcel_id", null);
      if (!upErr) contactsMatched += 1;
    }
  }

  const durationMs = Date.now() - startedAt;
  log.info({
    evt: "skywalk.match.completed",
    scope,
    properties_matched: propertiesMatched,
    contacts_matched: contactsMatched,
    duration_ms: durationMs,
  });

  return NextResponse.json({
    ok: true,
    scope,
    properties_matched: propertiesMatched,
    contacts_matched: contactsMatched,
    duration_ms: durationMs,
  });
}

/**
 * GET /api/skywalk/match
 *
 * Read-only: return counts of unmatched skywalk_properties and
 * skywalk_contacts, plus the most recent match success (so operators can
 * tell whether a reconcile pass would do useful work).
 */
export async function GET(req: NextRequest) {
  const authError = requireSyncSecret(req);
  if (authError) return authError;

  const supabase = getSupabaseServer();

  const [propsTotal, propsLinked, contactsTotal, contactsLinked] = await Promise.all([
    supabase
      .from("skywalk_properties")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("skywalk_properties")
      .select("id", { count: "exact", head: true })
      .not("parcel_id", "is", null),
    supabase
      .from("skywalk_contacts")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("skywalk_contacts")
      .select("id", { count: "exact", head: true })
      .not("parcel_id", "is", null),
  ]);

  return NextResponse.json({
    ok: true,
    properties: {
      total: propsTotal.count ?? 0,
      linked: propsLinked.count ?? 0,
      unlinked: (propsTotal.count ?? 0) - (propsLinked.count ?? 0),
      coverage_pct: pct(propsLinked.count, propsTotal.count),
    },
    contacts: {
      total: contactsTotal.count ?? 0,
      linked: contactsLinked.count ?? 0,
      unlinked: (contactsTotal.count ?? 0) - (contactsLinked.count ?? 0),
      coverage_pct: pct(contactsLinked.count, contactsTotal.count),
    },
  });
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number.parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function pct(num: number | null | undefined, denom: number | null | undefined): number {
  if (!num || !denom) return 0;
  return Math.round((num * 1000) / denom) / 10;
}
