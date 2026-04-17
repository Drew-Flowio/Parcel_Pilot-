import React from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/desirability";
import { ownerTypeLabel } from "@/lib/intelligence";
import type { PortfolioGroupRow } from "@/lib/types";

export function OwnerLeaderboard({
  rows,
  title = "Top Owners by Portfolio Value",
}: {
  rows: PortfolioGroupRow[];
  title?: string;
}) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white shadow-soft">
      <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
            Leaderboard
          </div>
          <div className="font-display text-base font-semibold text-ink-900">{title}</div>
        </div>
        <Link
          href="/cockpit?portfolio=1"
          className="text-xs font-medium text-accent-700 hover:text-accent-800"
        >
          Open in cockpit →
        </Link>
      </div>
      <ol className="divide-y divide-ink-100">
        {rows.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-ink-500">No owners yet.</li>
        ) : null}
        {rows.map((r, i) => (
          <li key={r.owner_key} className="flex items-center gap-3 px-4 py-3">
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-100 text-[11px] font-semibold tabular-nums text-ink-700">
              {i + 1}
            </span>
            <Link
              href={`/cockpit?portfolio=1&q=${encodeURIComponent(r.owner_name_display)}`}
              className="min-w-0 flex-1 group"
            >
              <div className="truncate text-sm font-medium text-ink-900 group-hover:text-accent-700">
                {r.owner_name_display || "(Unknown owner)"}
              </div>
              <div className="truncate text-xs text-ink-500">
                {ownerTypeLabel(r.owner_type)} · {r.parcel_count.toLocaleString()} parcels ·{" "}
                {(r.total_units ?? 0).toLocaleString()} units
              </div>
            </Link>
            <div className="text-right text-sm tabular-nums font-semibold text-ink-900">
              {formatCurrency(r.total_market_value)}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
