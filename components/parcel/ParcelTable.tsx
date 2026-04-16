"use client";

import React from "react";
import type { Parcel } from "@/lib/types";
import {
  formatContactStatus,
  formatCurrency,
  formatVacancy,
  scoreColor,
} from "@/lib/desirability";
import { Badge } from "@/components/ui/Primitives";

export function ParcelTable({
  rows,
  loading,
  selected,
  onToggleSelect,
  onToggleAll,
  onRowClick,
}: {
  rows: Parcel[];
  loading: boolean;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleAll: (ids: string[]) => void;
  onRowClick: (p: Parcel) => void;
}) {
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg shimmer" />
        ))}
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-ink-300 bg-white p-12 text-center">
        <div className="font-display text-lg text-ink-800">No parcels match these filters.</div>
        <div className="mt-1 text-sm text-ink-500">
          Try widening your criteria or switching the view above.
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-soft">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-ink-50 text-left text-[11px] uppercase tracking-wider text-ink-500">
            <tr>
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => onToggleAll(rows.map((r) => r.id))}
                  className="h-4 w-4 rounded border-ink-300 text-accent-500 focus:ring-accent-300"
                />
              </th>
              <th className="px-3 py-3">Owner / Property</th>
              <th className="px-3 py-3">Mailing</th>
              <th className="px-3 py-3 text-right">Value</th>
              <th className="px-3 py-3 text-right">Units</th>
              <th className="px-3 py-3">Vacancy</th>
              <th className="px-3 py-3">Score</th>
              <th className="px-3 py-3">Contact</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((p) => (
              <tr
                key={p.id}
                onClick={() => onRowClick(p)}
                className="cursor-pointer transition hover:bg-accent-50/40"
              >
                <td className="px-3 py-2.5 align-middle" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => onToggleSelect(p.id)}
                    className="h-4 w-4 rounded border-ink-300 text-accent-500 focus:ring-accent-300"
                  />
                </td>
                <td className="px-3 py-2.5 align-top">
                  <div className="font-medium text-ink-900">{p.owner_name}</div>
                  <div className="text-xs text-ink-500">{p.property_address}</div>
                </td>
                <td className="max-w-[220px] truncate px-3 py-2.5 text-ink-600">
                  {p.mailing_address ?? "—"}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-ink-800">
                  {formatCurrency(p.market_value)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-ink-700">
                  {p.unit_count ?? "—"}
                </td>
                <td className="px-3 py-2.5">
                  <Badge className="border-ink-200 text-ink-700">
                    {formatVacancy(p.vacancy_status)}
                  </Badge>
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${scoreColor(
                      p.desirability_score
                    )}`}
                  >
                    {p.desirability_score.toFixed(1)}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <Badge className="border-ink-200 text-ink-700">
                    {formatContactStatus(p.contact_status)}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
