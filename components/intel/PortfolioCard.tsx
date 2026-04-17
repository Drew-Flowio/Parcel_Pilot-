import React from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/desirability";
import { ownerTypeLabel } from "@/lib/intelligence";
import type { PortfolioGroupRow } from "@/lib/types";

function ownerTypeClass(t: PortfolioGroupRow["owner_type"]): string {
  switch (t) {
    case "entity":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "individual":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "institutional":
      return "border-red-200 bg-red-50 text-red-900";
    default:
      return "border-ink-200 bg-ink-50 text-ink-700";
  }
}

export function PortfolioCard({ group }: { group: PortfolioGroupRow }) {
  const href = `/cockpit?portfolio=1&q=${encodeURIComponent(group.owner_name_display)}`;
  return (
    <Link
      href={href}
      className="group block rounded-xl border border-ink-200 bg-white p-4 shadow-soft transition hover:border-accent-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-display text-base font-semibold text-ink-900 group-hover:text-accent-700">
            {group.owner_name_display || "(Unknown owner)"}
          </div>
          {group.primary_mailing_address ? (
            <div className="truncate text-xs text-ink-500">
              {group.primary_mailing_address}
            </div>
          ) : null}
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${ownerTypeClass(group.owner_type)}`}
        >
          {ownerTypeLabel(group.owner_type)}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Parcels</div>
          <div className="tabular-nums font-semibold text-ink-900">
            {group.parcel_count.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Total Value</div>
          <div className="tabular-nums font-semibold text-ink-900">
            {formatCurrency(group.total_market_value)}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Units</div>
          <div className="tabular-nums font-semibold text-ink-900">
            {group.total_units?.toLocaleString() ?? "—"}
          </div>
        </div>
      </div>

      {group.absentee_count > 0 || group.vacant_long_count > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          {group.absentee_count > 0 ? (
            <span className="rounded-full border border-ink-200 bg-ink-50 px-2 py-0.5 text-ink-700">
              {group.absentee_count} absentee
            </span>
          ) : null}
          {group.vacant_long_count > 0 ? (
            <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-red-800">
              {group.vacant_long_count} vacant
            </span>
          ) : null}
        </div>
      ) : null}
    </Link>
  );
}
