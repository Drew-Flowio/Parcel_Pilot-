import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseClient";
import {
  applySegmentCriteria,
  fetchSegment,
  parseSegmentCriteria,
} from "@/lib/intelligence";
import type { Parcel } from "@/lib/types";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;

/**
 * GET /api/lead-segments/:slug
 *   ?page=1&pageSize=50
 * Returns parcels_intel rows filtered by the stored `criteria` JSON.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { segment: string } }
) {
  const slug = params.segment;
  const supabase = getSupabaseServer();

  const segment = await fetchSegment(supabase, slug).catch((e) => {
    throw e;
  });
  if (!segment) {
    return NextResponse.json({ error: "Segment not found" }, { status: 404 });
  }

  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(sp.get("pageSize") ?? DEFAULT_PAGE_SIZE))
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const criteria = parseSegmentCriteria(segment.criteria);
  const { data, error, count } = await applySegmentCriteria(supabase, criteria, {
    count: true,
    range: [from, to],
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    segment: {
      slug: segment.slug,
      label: segment.label,
      description: segment.description,
      icon: segment.icon,
      criteria,
    },
    rows: (data ?? []) as Parcel[],
    total: count ?? 0,
    page,
    pageSize,
  });
}
