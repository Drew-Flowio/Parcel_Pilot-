import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseClient";
import { applyFilters, parseFilters } from "@/lib/parcelQuery";
import {
  flattenWithPortfolioColumn,
  groupParcels,
} from "@/lib/portfolioGroup";
import { parcelsToCsv, parcelsToCsvBulk, parcelsToCsvPortfolio } from "@/lib/csv";
import type { Parcel, ParcelFilters } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const ids = sp.getAll("id");
  const portfolioExport = sp.get("portfolio") === "1";
  const supabase = getSupabaseServer();

  let rows: Parcel[] = [];
  let parsedFilters: ParcelFilters | null = null;

  if (ids.length) {
    const { data, error } = await supabase
      .from("parcels")
      .select("*")
      .in("id", ids);
    if (error) {
      return new Response(error.message, { status: 500 });
    }
    rows = (data ?? []) as Parcel[];
  } else {
    parsedFilters = parseFilters(sp);
    const { data, error } = await applyFilters(supabase, parsedFilters, {
      range: [0, 9999],
    });
    if (error) {
      return new Response(error.message, { status: 500 });
    }
    rows = (data ?? []) as Parcel[];
  }

  let csv: string;
  let filename: string;

  if (ids.length) {
    csv = parcelsToCsvBulk(rows);
    filename = `parcel-pilot-${new Date().toISOString().slice(0, 10)}.csv`;
  } else if (portfolioExport && parsedFilters) {
    const groupBy = parsedFilters.groupBy ?? "owner";
    const groups = groupParcels(rows, groupBy);
    const flat = flattenWithPortfolioColumn(groups);
    csv = parcelsToCsvPortfolio(flat);
    filename = `parcel-pilot-portfolio-${new Date().toISOString().slice(0, 10)}.csv`;
  } else {
    csv = parcelsToCsv(rows);
    filename = `parcel-pilot-${new Date().toISOString().slice(0, 10)}.csv`;
  }

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
