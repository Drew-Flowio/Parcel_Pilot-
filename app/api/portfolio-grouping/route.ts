import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseClient";
import type { PortfolioGroupRow } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/portfolio-grouping
 *   ?minParcels=2          minimum portfolio size (default 2)
 *   ?minValue=1000000      minimum total_market_value
 *   ?ownerType=entity      filter by owner_type (individual|entity|institutional|other)
 *   ?sort=value|size|units order by
 *   ?limit=100             (default 50, max 500)
 *   ?offset=0              pagination offset (default 0)
 *   ?q=sterling            case-insensitive search over owner_name_display
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const minParcels = Math.max(1, Number(sp.get("minParcels") ?? 2));
  const minValue = sp.get("minValue") ? Number(sp.get("minValue")) : null;
  const ownerType = sp.get("ownerType");
  const sort = sp.get("sort") ?? "value";
  const limit = Math.min(500, Math.max(1, Number(sp.get("limit") ?? 50)));
  const offset = Math.max(0, Number(sp.get("offset") ?? 0));
  const q = sp.get("q")?.trim();

  const supabase = getSupabaseServer();

  let query = supabase
    .from("portfolio_groups")
    .select("*", { count: "estimated" })
    .gte("parcel_count", minParcels);

  if (minValue != null && Number.isFinite(minValue)) {
    query = query.gte("total_market_value", minValue);
  }
  if (ownerType) {
    query = query.eq("owner_type", ownerType);
  }
  if (q) {
    const pattern = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
    query = query.ilike("owner_name_display", pattern);
  }

  const orderCol =
    sort === "size"
      ? "parcel_count"
      : sort === "units"
        ? "total_units"
        : "total_market_value";
  query = query.order(orderCol, { ascending: false, nullsFirst: false });

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    rows: (data ?? []) as PortfolioGroupRow[],
    total: count ?? 0,
    limit,
    offset,
  });
}
