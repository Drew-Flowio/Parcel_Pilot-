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

  const format = sp.get("format");

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

  const effectiveLimit = format === "csv" ? Math.min(10_000, Math.max(limit, 2_000)) : limit;
  query = query.range(offset, offset + effectiveLimit - 1);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as PortfolioGroupRow[];

  if (format === "csv") {
    const header = [
      "owner_name_display",
      "owner_type",
      "parcel_count",
      "total_units",
      "total_market_value",
      "avg_market_value",
      "absentee_count",
      "vacant_long_count",
      "most_recent_sale_date",
      "primary_mailing_address",
      "primary_city",
      "primary_state",
      "primary_zip",
      "owner_key",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        [
          csvEscape(r.owner_name_display),
          r.owner_type,
          r.parcel_count,
          r.total_units,
          r.total_market_value,
          Math.round(Number(r.avg_market_value) || 0),
          r.absentee_count,
          r.vacant_long_count,
          r.most_recent_sale_date ?? "",
          csvEscape(r.primary_mailing_address ?? ""),
          csvEscape(r.primary_city ?? ""),
          r.primary_state ?? "",
          r.primary_zip ?? "",
          csvEscape(r.owner_key),
        ].join(",")
      );
    }
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(lines.join("\n") + "\n", {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="portfolios-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json({
    rows,
    total: count ?? 0,
    limit,
    offset,
  });
}

function csvEscape(v: string | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
