import React from "react";
import { getSupabaseServer } from "@/lib/supabaseClient";
import { applyFilters, parseFilters } from "@/lib/parcelQuery";
import { Cockpit } from "@/components/parcel/Cockpit";
import { ParcelPilotLogo } from "@/components/ui/Logo";
import type { Parcel } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const filters = parseFilters(searchParams);
  const supabase = getSupabaseServer();

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let rows: Parcel[] = [];
  let total = 0;
  let errorMsg: string | null = null;

  try {
    const { data, count, error } = await applyFilters(supabase, filters, {
      count: true,
      range: [from, to],
    });
    if (error) errorMsg = error.message;
    else {
      rows = (data ?? []) as Parcel[];
      total = count ?? 0;
    }
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      {/* Top bar */}
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-ink-200 pb-6">
        <ParcelPilotLogo />
        <nav className="flex items-center gap-4 text-sm text-ink-500">
          <span className="hidden sm:inline">
            <span className="font-mono text-ink-700">{total.toLocaleString()}</span> parcels loaded
          </span>
          <a
            href="https://supabase.com"
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-ink-200 bg-white px-3 py-1 text-xs text-ink-600 shadow-soft hover:border-accent-300 hover:text-accent-700"
          >
            v1 · single-tenant
          </a>
        </nav>
      </header>

      {errorMsg ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-semibold">Couldn&apos;t load parcels.</div>
          <div className="mt-1 text-xs">{errorMsg}</div>
          <div className="mt-2 text-xs text-red-600">
            Check that <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code>SUPABASE_SERVICE_ROLE_KEY</code> are set in <code>.env.local</code>, and
            that you&apos;ve run <code>supabase/schema.sql</code> in your project.
          </div>
        </div>
      ) : null}

      <Cockpit initial={{ rows, total, filters }} />
    </div>
  );
}
