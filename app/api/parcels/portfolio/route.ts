import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseClient";
import { applyFilters, parseFilters } from "@/lib/parcelQuery";
import { groupParcels } from "@/lib/portfolioGroup";
import type { Parcel } from "@/lib/types";

export const dynamic = "force-dynamic";

const MAX_ROWS = 5000;

export async function GET(req: NextRequest) {
  const filters = parseFilters(req.nextUrl.searchParams);
  const groupBy = filters.groupBy ?? "owner";
  const supabase = getSupabaseServer();

  const { data, error, count } = await applyFilters(supabase, filters, {
    count: true,
    range: [0, MAX_ROWS - 1],
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Parcel[];
  const groups = groupParcels(rows, groupBy);

  return NextResponse.json({
    groups: groups.map((g) => ({
      key: g.key,
      label: g.label,
      parcelCount: g.parcels.length,
      parcels: g.parcels,
    })),
    total: count ?? rows.length,
    truncated: (count ?? 0) > MAX_ROWS,
    maxRows: MAX_ROWS,
  });
}
