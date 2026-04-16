import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseClient";
import { applyFilters, parseFilters } from "@/lib/parcelQuery";
import { parcelsToCsv } from "@/lib/csv";
import type { Parcel } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const ids = sp.getAll("id");
  const supabase = getSupabaseServer();

  let rows: Parcel[] = [];

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
    const filters = parseFilters(sp);
    const { data, error } = await applyFilters(supabase, filters, {
      range: [0, 9999],
    });
    if (error) {
      return new Response(error.message, { status: 500 });
    }
    rows = (data ?? []) as Parcel[];
  }

  const csv = parcelsToCsv(rows);
  const filename = `parcel-pilot-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
