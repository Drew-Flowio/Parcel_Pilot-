import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseClient";
import { classifyOwnerType } from "@/lib/ownerType";
import { appendNeedsSkipTraceNote, hasNeedsSkipTraceNote } from "@/lib/skipTrace";

export const dynamic = "force-dynamic";

type BulkAction = "mark_contacted" | "skip_trace_llc" | "mark_vacant";

type BulkBody = {
  action?: BulkAction;
  ids?: string[];
  /** For `mark_vacant`: vacancy_status to set (default `vacant_long`). */
  vacancy_status?: "occupied" | "partially_vacant" | "vacant_long" | "unknown";
  /** For `mark_vacant`: optional days_vacant override (explicit number or null to clear). */
  days_vacant?: number | null;
};

export async function POST(req: NextRequest) {
  let body: BulkBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action;
  const ids = body.ids;
  if (!action || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "Missing action or ids" }, { status: 400 });
  }

  const supabase = getSupabaseServer();

  if (action === "mark_contacted") {
    const { error } = await supabase
      .from("parcels")
      .update({
        contact_status: "contacted",
        last_contacted_at: new Date().toISOString(),
      })
      .in("id", ids);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, updated: ids.length });
  }

  if (action === "skip_trace_llc") {
    const { data: rows, error: fetchErr } = await supabase
      .from("parcels")
      .select("id, owner_name, contact_notes")
      .in("id", ids);

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    let updated = 0;
    for (const row of rows ?? []) {
      if (classifyOwnerType(row.owner_name).kind !== "llc") continue;
      if (hasNeedsSkipTraceNote(row.contact_notes)) continue;
      const notes = appendNeedsSkipTraceNote(row.contact_notes);

      const { error: updErr } = await supabase
        .from("parcels")
        .update({ contact_notes: notes })
        .eq("id", row.id);

      if (!updErr) updated += 1;
    }

    return NextResponse.json({ ok: true, updated });
  }

  if (action === "mark_vacant") {
    const vacancy_status = body.vacancy_status ?? "vacant_long";
    if (
      !["occupied", "partially_vacant", "vacant_long", "unknown"].includes(
        vacancy_status
      )
    ) {
      return NextResponse.json({ error: "Invalid vacancy_status" }, { status: 400 });
    }
    const update: Record<string, unknown> = { vacancy_status };
    if (body.days_vacant !== undefined) update.days_vacant = body.days_vacant;

    const { error } = await supabase.from("parcels").update(update).in("id", ids);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, updated: ids.length });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
