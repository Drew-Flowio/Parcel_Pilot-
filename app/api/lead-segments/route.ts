import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseClient";
import { fetchAllSegments } from "@/lib/intelligence";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseServer();
  try {
    const segments = await fetchAllSegments(supabase);
    return NextResponse.json({ segments });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load segments" },
      { status: 500 }
    );
  }
}
