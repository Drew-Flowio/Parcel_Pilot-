import React from "react";
import { getSupabaseServer } from "@/lib/supabaseClient";
import { applyFilters, filtersForQuery, parseFilters } from "@/lib/parcelQuery";
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
  const queryFilters = filtersForQuery(filters);
  const supabase = getSupabaseServer();

  const page = queryFilters.page ?? 1;
  const pageSize = queryFilters.pageSize ?? 25;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let rows: Parcel[] = [];
  let total = 0;
  let errorMsg: string | null = null;

  try {
    if (filters.portfolio) {
      const { count, error } = await applyFilters(supabase, queryFilters, {
        count: true,
      });
      if (error) errorMsg = error.message;
      else total = count ?? 0;
    } else {
      const { data, count, error } = await applyFilters(supabase, queryFilters, {
        count: true,
        range: [from, to],
      });
      if (error) errorMsg = error.message;
      else {
        rows = (data ?? []) as Parcel[];
        total = count ?? 0;
      }
    }
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-ink-200/90 bg-white/95 shadow-sm backdrop-blur-md">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <ParcelPilotLogo />
          <div className="flex flex-wrap items-center gap-3 text-sm text-ink-600">
            <span className="hidden sm:inline">
              <span className="font-mono font-medium text-ink-800">{total.toLocaleString()}</span>
              <span className="text-ink-400"> records</span>
            </span>
            <span className="rounded-full border border-ink-200 bg-ink-50 px-3 py-1 text-xs font-medium text-ink-600">
              v1 · single-tenant
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col">
        {errorMsg ? (
          <div className="mx-4 mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:mx-6">
            <div className="font-semibold">Couldn&apos;t load parcels.</div>
            <div className="mt-1 text-xs">{errorMsg}</div>
            <div className="mt-2 text-xs text-red-600">
              Check that <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
              <code>SUPABASE_SERVICE_ROLE_KEY</code> are set in <code>.env.local</code>, and
              that you&apos;ve run <code>supabase/schema.sql</code> in your project.
            </div>
          </div>
        ) : null}

        {!errorMsg ? <Cockpit initial={{ rows, total, filters }} /> : null}
      </div>
    </div>
  );
}
