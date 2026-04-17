import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabaseClient";
import {
  applySegmentCriteria,
  fetchSegment,
  parseSegmentCriteria,
} from "@/lib/intelligence";
import { formatCurrency } from "@/lib/desirability";
import { ownerTypeLabel } from "@/lib/intelligence";
import { ParcelPilotLogo } from "@/components/ui/Logo";
import type { Parcel } from "@/lib/types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

export default async function SegmentPage({
  params,
  searchParams,
}: {
  params: { segment: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const supabase = getSupabaseServer();
  const segment = await fetchSegment(supabase, params.segment).catch(() => null);
  if (!segment) notFound();

  const page = Math.max(1, Number(searchParams.page ?? 1));
  const criteria = parseSegmentCriteria(segment.criteria);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, count, error } = await applySegmentCriteria(supabase, criteria, {
    count: true,
    range: [from, to],
  });

  const rows = (data ?? []) as Parcel[];
  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-ink-200/90 bg-white/95 shadow-sm backdrop-blur-md">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <ParcelPilotLogo />
          <nav className="flex flex-wrap items-center gap-2 text-sm">
            <Link
              href="/"
              className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 font-medium text-ink-700 hover:border-ink-300 hover:bg-ink-50"
            >
              ← Intelligence
            </Link>
            <Link
              href="/cockpit"
              className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 font-medium text-ink-700 hover:border-ink-300 hover:bg-ink-50"
            >
              Cockpit
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
            Lead Segment
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
            {segment.label}
          </h1>
          {segment.description ? (
            <p className="mt-1 max-w-3xl text-sm text-ink-500">{segment.description}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-ink-200 bg-ink-50 px-2 py-0.5 font-medium text-ink-700">
              {total.toLocaleString()} matches
            </span>
            {criteria.limit ? (
              <span className="rounded-full border border-ink-200 bg-ink-50 px-2 py-0.5 font-medium text-ink-700">
                Cap {criteria.limit.toLocaleString()}
              </span>
            ) : null}
            {criteria.min_score_v2 != null ? (
              <span className="rounded-full border border-accent-200 bg-accent-50 px-2 py-0.5 font-medium text-accent-800">
                Score v2 ≥ {criteria.min_score_v2}
              </span>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error.message}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-soft">
          <div className="max-h-[70vh] overflow-auto">
            <table className="min-w-full divide-y divide-ink-100 text-sm">
              <thead className="sticky top-0 z-10 bg-ink-50/80 backdrop-blur">
                <tr>
                  <Th>Score v2</Th>
                  <Th>Owner</Th>
                  <Th>Type</Th>
                  <Th>Property</Th>
                  <Th numeric>Units</Th>
                  <Th numeric>Market</Th>
                  <Th numeric>Portfolio</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((p) => (
                  <tr key={p.id} className="hover:bg-ink-50/60">
                    <Td>
                      <span className="tabular-nums font-semibold text-accent-700">
                        {p.score_v2 != null ? Number(p.score_v2).toFixed(1) : "—"}
                      </span>
                    </Td>
                    <Td className="max-w-[240px]">
                      <Link
                        href={`/parcel/${p.id}`}
                        className="block truncate font-medium text-ink-900 hover:text-accent-700"
                      >
                        {p.owner_name}
                      </Link>
                    </Td>
                    <Td className="text-xs">{ownerTypeLabel(p.owner_type)}</Td>
                    <Td className="max-w-[320px]">
                      <div className="truncate text-ink-900">{p.property_address}</div>
                      {p.mailing_address ? (
                        <div className="truncate text-xs text-ink-500">
                          → {p.mailing_address}
                        </div>
                      ) : null}
                    </Td>
                    <Td numeric>{p.unit_count ?? "—"}</Td>
                    <Td numeric>{formatCurrency(p.market_value)}</Td>
                    <Td numeric>
                      {p.owner_portfolio_size != null
                        ? `${p.owner_portfolio_size} · ${formatCurrency(
                            Number(p.owner_portfolio_value ?? 0)
                          )}`
                        : "—"}
                    </Td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-ink-500">
                      No parcels match this segment right now.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageCount={pageCount} slug={segment.slug} />
        </div>
      </main>
    </div>
  );
}

function Th({
  children,
  numeric,
}: {
  children: React.ReactNode;
  numeric?: boolean;
}) {
  return (
    <th
      className={`px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-500 ${
        numeric ? "text-right" : ""
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  numeric,
  className = "",
}: {
  children: React.ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <td
      className={`px-3 py-2 align-top text-sm ${
        numeric ? "text-right tabular-nums" : ""
      } ${className}`}
    >
      {children}
    </td>
  );
}

function Pagination({
  page,
  pageCount,
  slug,
}: {
  page: number;
  pageCount: number;
  slug: string;
}) {
  if (pageCount <= 1) return null;
  const prev = Math.max(1, page - 1);
  const next = Math.min(pageCount, page + 1);
  return (
    <div className="flex items-center justify-between border-t border-ink-100 px-3 py-2 text-xs text-ink-500">
      <div>
        Page {page.toLocaleString()} / {pageCount.toLocaleString()}
      </div>
      <div className="flex items-center gap-2">
        <Link
          href={`/segments/${slug}?page=${prev}`}
          className="rounded-md border border-ink-200 bg-white px-2 py-1 font-medium text-ink-700 hover:border-ink-300 hover:bg-ink-50"
        >
          Prev
        </Link>
        <Link
          href={`/segments/${slug}?page=${next}`}
          className="rounded-md border border-ink-200 bg-white px-2 py-1 font-medium text-ink-700 hover:border-ink-300 hover:bg-ink-50"
        >
          Next
        </Link>
      </div>
    </div>
  );
}
