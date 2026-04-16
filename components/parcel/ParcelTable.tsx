"use client";

import React, { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Parcel, ScoringMode } from "@/lib/types";
import type { ScoringWeightsBundle } from "@/lib/scoringWeights";
import {
  desirabilityTierEmoji,
  formatCurrency,
  formatVacancy,
  getDisplayScore,
  scoreColor,
} from "@/lib/desirability";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { Badge, Button } from "@/components/ui/Primitives";
import { ContactQuickActions } from "./ContactQuickActions";
import { LLCSkipTraceModal } from "./LLCSkipTraceModal";
import { classifyOwnerType, ownerTypeBadgeClass } from "@/lib/ownerType";
import { hasNeedsSkipTraceNote } from "@/lib/skipTrace";

const COL_SPAN = 9;
const ROW_ESTIMATE_PX = 64;

function ParcelTableRow({
  p,
  selected,
  scoringMode,
  scoringWeights,
  onToggleSelect,
  onRowClick,
  onParcelUpdated,
  onSkipTraceClick,
}: {
  p: Parcel;
  selected: boolean;
  scoringMode: ScoringMode;
  scoringWeights: ScoringWeightsBundle;
  onToggleSelect: (id: string) => void;
  onRowClick: (parcel: Parcel) => void;
  onParcelUpdated?: (parcel: Parcel) => void;
  onSkipTraceClick: (parcel: Parcel) => void;
}) {
  const s = getDisplayScore(p, scoringMode, scoringWeights);
  const emoji = desirabilityTierEmoji(s);
  const ownerType = classifyOwnerType(p.owner_name);

  return (
    <tr
      onClick={() => onRowClick(p)}
      className="group cursor-pointer border-l-[3px] border-l-transparent transition hover:border-l-accent-500 hover:bg-accent-50/50"
    >
      <td className="px-4 py-3 align-middle" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(p.id)}
          className="h-4 w-4 rounded border-ink-300 text-accent-600 focus:ring-accent-200"
          aria-label={`Select ${p.owner_name}`}
        />
      </td>
      <td className="max-w-[min(280px,40vw)] px-3 py-3 align-top">
        <div className="font-medium text-ink-900">{p.owner_name}</div>
        <div className="mt-0.5 text-xs leading-relaxed text-ink-500">{p.property_address}</div>
        <div className="mt-0.5 text-[11px] text-ink-500 md:hidden">
          Units:{" "}
          <span className="font-mono tabular-nums text-ink-700">{p.unit_count ?? "—"}</span>
        </div>
      </td>
      <td className="px-3 py-3 align-top" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col items-start gap-2">
          <Badge
            className={`inline-flex items-center border text-xs font-semibold ${ownerTypeBadgeClass(
              ownerType.kind
            )}`}
          >
            <span className="select-none" aria-hidden>
              {ownerType.emoji}
            </span>
            <span className="ml-1">{ownerType.label}</span>
          </Badge>
          {ownerType.kind === "llc" ? (
            hasNeedsSkipTraceNote(p.contact_notes) ? (
              <span className="text-[10px] font-medium uppercase tracking-wide text-accent-700">
                Skip trace noted
              </span>
            ) : (
              <Button
                type="button"
                variant="secondary"
                className="px-2 py-1 text-[11px] font-semibold"
                onClick={() => onSkipTraceClick(p)}
              >
                Skip trace
              </Button>
            )
          ) : null}
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
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums ${scoreColor(
            s
          )}`}
          title={
            s >= 85
              ? "High desirability (85+)"
              : s >= 60
                ? "Medium (60–84)"
                : "Lower priority (<60)"
          }
        >
          <span className="select-none" aria-hidden>
            {emoji}
          </span>
          {s.toFixed(1)}
        </span>
      </td>
      <td className="hidden px-3 py-3 align-top lg:table-cell">
        <ContactQuickActions parcel={p} onUpdated={(updated) => onParcelUpdated?.(updated)} />
      </td>
    </tr>
  );
}

function TableSkeleton({ rows: rowCount }: { rows: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-soft">
      <div className="border-b border-ink-100 px-4 py-3">
        <div className="h-4 w-40 animate-pulse rounded bg-ink-100" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-ink-100 bg-ink-50/95 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-500">
            <tr>
              <th className="w-12 px-4 py-3">
                <div className="h-4 w-4 rounded bg-ink-100" />
              </th>
              <th className="px-3 py-3">Owner / Property</th>
              <th className="px-3 py-3">Owner Type</th>
              <th className="hidden px-3 py-3 sm:table-cell">Mailing</th>
              <th className="px-3 py-3 text-right">Value</th>
              <th className="hidden px-3 py-3 text-right md:table-cell">Units</th>
              <th className="hidden px-3 py-3 lg:table-cell">Vacancy</th>
              <th className="px-3 py-3">Desirability</th>
              <th className="hidden px-3 py-3 lg:table-cell">Contact</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {Array.from({ length: rowCount }).map((_, i) => (
              <tr key={i}>
                <td className="px-4 py-3">
                  <div className="h-4 w-4 rounded bg-ink-100" />
                </td>
                <td className="px-3 py-3">
                  <div className="h-4 w-48 max-w-full animate-pulse rounded bg-ink-100" />
                  <div className="mt-2 h-3 w-64 max-w-full animate-pulse rounded bg-ink-50" />
                </td>
                <td className="px-3 py-3">
                  <div className="h-6 w-16 rounded-full bg-ink-100" />
                </td>
                <td className="hidden px-3 py-3 sm:table-cell">
                  <div className="h-3 w-32 animate-pulse rounded bg-ink-50" />
                </td>
                <td className="px-3 py-3 text-right">
                  <div className="ml-auto h-4 w-20 animate-pulse rounded bg-ink-100" />
                </td>
                <td className="hidden px-3 py-3 md:table-cell">
                  <div className="ml-auto h-4 w-8 animate-pulse rounded bg-ink-100" />
                </td>
                <td className="hidden px-3 py-3 lg:table-cell">
                  <div className="h-6 w-20 rounded-full bg-ink-100" />
                </td>
                <td className="px-3 py-3">
                  <div className="h-7 w-14 animate-pulse rounded-full bg-ink-100" />
                </td>
                <td className="hidden px-3 py-3 lg:table-cell">
                  <div className="h-8 w-24 animate-pulse rounded-lg bg-ink-50" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ParcelTable({
  rows,
  loading,
  selected,
  onToggleSelect,
  onToggleAll,
  onRowClick,
  onParcelUpdated,
  totalLabel,
  scoringMode = "pm",
  scoringWeights,
  pageSize = DEFAULT_PAGE_SIZE,
}: {
  rows: Parcel[];
  loading: boolean;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleAll: (ids: string[]) => void;
  onRowClick: (p: Parcel) => void;
  onParcelUpdated?: (p: Parcel) => void;
  totalLabel?: string;
  scoringMode?: ScoringMode;
  scoringWeights: ScoringWeightsBundle;
  pageSize?: number;
}) {
  const [skipModalParcel, setSkipModalParcel] = useState<Parcel | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_ESTIMATE_PX,
    overscan: 12,
    getItemKey: (index) => rows[index]?.id ?? String(index),
  });

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? (virtualItems[0]?.start ?? 0) : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? rowVirtualizer.getTotalSize() -
        (virtualItems[virtualItems.length - 1]?.end ?? 0)
      : 0;

  const skipTraceModal = (
    <LLCSkipTraceModal
      parcel={skipModalParcel}
      open={skipModalParcel != null}
      onClose={() => setSkipModalParcel(null)}
      onMarked={(updated) => onParcelUpdated?.(updated)}
    />
  );

  const skeletonRows = Math.min(Math.max(pageSize, 8), 24);

  if (loading && rows.length === 0) {
    return (
      <>
        {skipTraceModal}
        <TableSkeleton rows={skeletonRows} />
      </>
    );
  }

  if (!loading && !rows.length) {
    return (
      <>
        {skipTraceModal}
        <div className="rounded-xl border border-dashed border-ink-200 bg-white px-8 py-16 text-center shadow-soft">
          <div className="font-display text-lg font-semibold text-ink-800">
            No records match
          </div>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-500">
            Adjust filters or widen your criteria to see more parcels.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      {skipTraceModal}
      <div className="relative overflow-hidden rounded-xl border border-ink-200 bg-white shadow-soft">
        {loading && rows.length > 0 ? (
          <div
            className="pointer-events-none absolute inset-0 z-20 flex items-start justify-center bg-white/55 pt-20 backdrop-blur-[1px]"
            aria-hidden
          >
            <div className="rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-800 shadow-soft">
              Updating…
            </div>
          </div>
        ) : null}
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

        <div ref={parentRef} className="max-h-[min(70vh,780px)] overflow-auto">
          <table
            className="w-full text-sm"
            aria-busy={loading && rows.length > 0}
          >
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
                <th className="whitespace-nowrap px-3 py-3">Owner Type</th>
                <th className="hidden px-3 py-3 sm:table-cell">Mailing</th>
                <th className="px-3 py-3 text-right">Value</th>
                <th className="hidden px-3 py-3 text-right md:table-cell">Units</th>
                <th className="hidden px-3 py-3 lg:table-cell">Vacancy</th>
                <th className="px-3 py-3">Desirability</th>
                <th className="hidden min-w-[200px] px-3 py-3 lg:table-cell">
                  Contact status
                </th>
              </tr>
            </thead>
            <tbody
              className={`divide-y divide-ink-100 ${
                loading && rows.length > 0 ? "opacity-60" : ""
              }`}
            >
              {paddingTop > 0 ? (
                <tr aria-hidden>
                  <td colSpan={COL_SPAN} style={{ height: paddingTop }} />
                </tr>
              ) : null}
              {virtualItems.map((vi) => {
                const p = rows[vi.index];
                if (!p) return null;
                return (
                  <ParcelTableRow
                    key={p.id}
                    p={p}
                    selected={selected.has(p.id)}
                    scoringMode={scoringMode}
                    scoringWeights={scoringWeights}
                    onToggleSelect={onToggleSelect}
                    onRowClick={onRowClick}
                    onParcelUpdated={onParcelUpdated}
                    onSkipTraceClick={setSkipModalParcel}
                  />
                );
              })}
              {paddingBottom > 0 ? (
                <tr aria-hidden>
                  <td colSpan={COL_SPAN} style={{ height: paddingBottom }} />
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
