"use client";

import React from "react";
import type { Parcel } from "@/lib/types";
import {
  desirabilityTierEmoji,
  formatContactStatus,
  formatCurrency,
  formatVacancy,
  parseDesirabilityScore,
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
  totalLabel,
}: {
  rows: Parcel[];
  loading: boolean;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleAll: (ids: string[]) => void;
  onRowClick: (p: Parcel) => void;
  totalLabel?: string;
}) {
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  if (loading) {
    return (
      <div className="rounded-xl border border-ink-200 bg-white shadow-soft">
        <div className="border-b border-ink-100 px-4 py-3">
          <div className="h-4 w-32 animate-pulse rounded bg-ink-100" />
        </div>
        <div className="divide-y divide-ink-100 p-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg shimmer" />
          ))}
        </div>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-ink-200 bg-white px-8 py-16 text-center shadow-soft">
        <div className="font-display text-lg font-semibold text-ink-800">
          No records match
        </div>
        <p className="mt-2 max-w-sm mx-auto text-sm text-ink-500">
          Adjust filters or widen your criteria to see more parcels.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 bg-gradient-to-r from-ink-50/90 to-white px-4 py-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-ink-900">Parcels</h2>
          {totalLabel ? (
            <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-600">
              {totalLabel}
            </span>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 border-b border-ink-100 bg-ink-50/95 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-500 backdrop-blur-sm">
            <tr>
              <th className="w-12 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => onToggleAll(rows.map((r) => r.id))}
                  className="h-4 w-4 rounded border-ink-300 text-accent-600 focus:ring-accent-200"
                  aria-label="Select all on page"
                />
              </th>
              <th className="px-3 py-3">Owner / Property</th>
              <th className="hidden sm:table-cell px-3 py-3">Mailing</th>
              <th className="px-3 py-3 text-right">Value</th>
              <th className="hidden md:table-cell px-3 py-3 text-right">Units</th>
              <th className="hidden lg:table-cell px-3 py-3">Vacancy</th>
              <th className="px-3 py-3">Desirability</th>
              <th className="hidden xl:table-cell px-3 py-3">Contact</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((p) => {
              const s = parseDesirabilityScore(p.desirability_score);
              const emoji = s != null ? desirabilityTierEmoji(s) : null;
              return (
                <tr
                  key={p.id}
                  onClick={() => onRowClick(p)}
                  className="group cursor-pointer border-l-[3px] border-l-transparent transition hover:border-l-accent-500 hover:bg-accent-50/50"
                >
                  <td className="px-4 py-3 align-middle" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => onToggleSelect(p.id)}
                      className="h-4 w-4 rounded border-ink-300 text-accent-600 focus:ring-accent-200"
                      aria-label={`Select ${p.owner_name}`}
                    />
                  </td>
                  <td className="max-w-[min(280px,40vw)] px-3 py-3 align-top">
                    <div className="font-medium text-ink-900">{p.owner_name}</div>
                    <div className="mt-0.5 text-xs leading-relaxed text-ink-500">
                      {p.property_address}
                    </div>
                    <div className="mt-0.5 text-[11px] text-ink-500 md:hidden">
                      Units:{" "}
                      <span className="font-mono tabular-nums text-ink-700">
                        {p.unit_count ?? "—"}
                      </span>
                    </div>
                  </td>
                  <td className="hidden max-w-[200px] truncate px-3 py-3 text-ink-600 sm:table-cell">
                    {p.mailing_address ?? "—"}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-ink-800">
                    {formatCurrency(p.market_value)}
                  </td>
                  <td className="hidden px-3 py-3 text-right font-mono tabular-nums text-ink-700 md:table-cell">
                    {p.unit_count ?? "—"}
                  </td>
                  <td className="hidden px-3 py-3 lg:table-cell">
                    <Badge className="border-ink-200/80 bg-white text-ink-700">
                      {formatVacancy(p.vacancy_status)}
                    </Badge>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums ${
                        s != null ? scoreColor(s) : "border-ink-200 bg-ink-50 text-ink-500"
                      }`}
                      title={
                        s == null
                          ? "No desirability score from API"
                          : s >= 85
                            ? "High desirability (85+)"
                            : s >= 60
                              ? "Medium (60–84)"
                              : "Lower priority (<60)"
                      }
                    >
                      {emoji != null ? (
                        <span className="select-none" aria-hidden>
                          {emoji}
                        </span>
                      ) : null}
                      {s != null ? s.toFixed(1) : "—"}
                    </span>
                  </td>
                  <td className="hidden px-3 py-3 xl:table-cell">
                    <Badge className="border-ink-200/80 bg-white text-ink-700">
                      {formatContactStatus(p.contact_status)}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
