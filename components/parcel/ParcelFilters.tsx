"use client";

import React from "react";
import type { ContactStatus, ParcelFilters, VacancyStatus } from "@/lib/types";
import {
  MARKET_SLIDER_MAX,
  MARKET_SLIDER_MIN,
  MARKET_SLIDER_STEP,
  UNIT_SLIDER_MAX,
  UNIT_SLIDER_MIN,
  UNIT_SLIDER_STEP,
} from "@/lib/filterBounds";
import { formatCurrency } from "@/lib/desirability";
import { DualRangeSlider } from "@/components/ui/DualRangeSlider";
import { Checkbox, Input, Label } from "@/components/ui/Primitives";

const VACANCY_OPTIONS: { id: VacancyStatus; label: string }[] = [
  { id: "vacant_long", label: "Vacant Long" },
  { id: "partially_vacant", label: "Partial" },
  { id: "occupied", label: "Occupied" },
  { id: "unknown", label: "Unknown" },
];

const CONTACT_OPTIONS: { id: ContactStatus; label: string }[] = [
  { id: "not_contacted", label: "Not Contacted" },
  { id: "contacted", label: "Contacted" },
  { id: "follow_up", label: "Follow-Up" },
  { id: "do_not_contact", label: "Do not contact" },
];

const ABSENTEE_SEGMENTS: {
  value: NonNullable<ParcelFilters["absentee"]>;
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "only", label: "Only Absentee" },
  { value: "owner_occupied", label: "Owner-Occupied" },
];

function formatMarketLabel(n: number): string {
  if (n >= 1_000_000) return formatCurrency(n);
  return formatCurrency(n);
}

function formatUnitLabel(n: number): string {
  return `${n} unit${n === 1 ? "" : "s"}`;
}

export function ParcelFiltersForm({
  filters,
  onChange,
  onReset,
  showActions = true,
}: {
  filters: ParcelFilters;
  onChange: (next: Partial<ParcelFilters>) => void;
  onReset: () => void;
  showActions?: boolean;
}) {
  const toggleVacancy = (v: VacancyStatus) => {
    const cur = filters.vacancy ?? [];
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    onChange({ vacancy: next.length ? next : undefined });
  };
  const toggleContact = (c: ContactStatus) => {
    const cur = filters.contactStatus ?? [];
    const next = cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c];
    onChange({ contactStatus: next.length ? next : undefined });
  };

  const marketLow = filters.minValue ?? MARKET_SLIDER_MIN;
  const marketHigh = filters.maxValue ?? MARKET_SLIDER_MAX;
  const onMarketRange = (low: number, high: number) => {
    const full =
      low <= MARKET_SLIDER_MIN && high >= MARKET_SLIDER_MAX;
    onChange({
      minValue: full ? undefined : low,
      maxValue: full ? undefined : high,
    });
  };

  const unitLow = filters.minUnits ?? UNIT_SLIDER_MIN;
  const unitHigh = filters.maxUnits ?? UNIT_SLIDER_MAX;
  const onUnitRange = (low: number, high: number) => {
    const full = low <= UNIT_SLIDER_MIN && high >= UNIT_SLIDER_MAX;
    onChange({
      minUnits: full ? undefined : low,
      maxUnits: full ? undefined : high,
    });
  };

  return (
    <div className="space-y-6">
      {showActions ? (
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-900">Filters</h2>
          <button
            type="button"
            onClick={onReset}
            className="text-xs font-medium text-ink-500 hover:text-accent-600"
          >
            Reset
          </button>
        </div>
      ) : null}

      {/* 1. Market value */}
      <section className="space-y-2">
        <Label>Min / Max Market Value</Label>
        <DualRangeSlider
          minBound={MARKET_SLIDER_MIN}
          maxBound={MARKET_SLIDER_MAX}
          step={MARKET_SLIDER_STEP}
          valueLow={marketLow}
          valueHigh={marketHigh}
          onChange={onMarketRange}
          format={formatMarketLabel}
          aria-label="Market value"
        />
        <p className="text-[11px] text-ink-500">
          Full range = no value filter. Adjust sliders to narrow by assessed value.
        </p>
      </section>

      {/* 2. Unit count */}
      <section className="space-y-2">
        <Label>Unit Count (Min / Max)</Label>
        <DualRangeSlider
          minBound={UNIT_SLIDER_MIN}
          maxBound={UNIT_SLIDER_MAX}
          step={UNIT_SLIDER_STEP}
          valueLow={unitLow}
          valueHigh={unitHigh}
          onChange={onUnitRange}
          format={formatUnitLabel}
          aria-label="Unit count"
        />
        <p className="text-[11px] text-ink-500">
          Full range = no unit filter. Unknown unit counts in data may still appear.
        </p>
      </section>

      {/* 3. Absentee Owner */}
      <section className="space-y-2">
        <Label>Absentee Owner</Label>
        <div
          className="flex rounded-xl border border-ink-200 bg-ink-50/80 p-1"
          role="group"
          aria-label="Absentee owner"
        >
          {ABSENTEE_SEGMENTS.map((seg) => {
            const active = (filters.absentee ?? "all") === seg.value;
            return (
              <button
                key={seg.value}
                type="button"
                onClick={() => onChange({ absentee: seg.value })}
                className={`shrink-0 flex-1 rounded-lg px-2 py-2 text-center text-xs font-semibold leading-tight transition sm:text-[13px] ${
                  active
                    ? "bg-white text-ink-900 shadow-sm ring-1 ring-ink-200"
                    : "text-ink-600 hover:text-ink-900"
                }`}
              >
                {seg.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* 4. Vacancy */}
      <section className="space-y-2">
        <Label>Vacancy Status</Label>
        <div className="space-y-2 rounded-xl border border-ink-100 bg-ink-50/40 px-3 py-2">
          {VACANCY_OPTIONS.map((v) => (
            <Checkbox
              key={v.id}
              label={v.label}
              checked={filters.vacancy?.includes(v.id) ?? false}
              onChange={() => toggleVacancy(v.id)}
            />
          ))}
        </div>
        <p className="text-[11px] text-ink-500">
          No boxes checked = all vacancy statuses.
        </p>
      </section>

      {/* 5. Contact */}
      <section className="space-y-2">
        <Label>Contact Status</Label>
        <div className="space-y-2 rounded-xl border border-ink-100 bg-ink-50/40 px-3 py-2">
          {CONTACT_OPTIONS.map((c) => (
            <Checkbox
              key={c.id}
              label={c.label}
              checked={filters.contactStatus?.includes(c.id) ?? false}
              onChange={() => toggleContact(c.id)}
            />
          ))}
        </div>
        <p className="text-[11px] text-ink-500">
          No boxes checked = all contact statuses.
        </p>
      </section>

      {/* Secondary: sort + min days */}
      <details className="rounded-xl border border-ink-200 bg-white open:shadow-sm">
        <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-semibold text-ink-800 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-2">
            More options
            <span className="text-ink-400" aria-hidden>
              ▼
            </span>
          </span>
        </summary>
        <div className="space-y-4 border-t border-ink-100 px-3 pb-4 pt-3">
          <div>
            <Label>Min days vacant</Label>
            <Input
              className="mt-1.5"
              type="number"
              min={0}
              placeholder="e.g. 60"
              value={filters.minDaysVacant ?? ""}
              onChange={(e) =>
                onChange({
                  minDaysVacant: e.target.value ? Number(e.target.value) : undefined,
                })
              }
            />
          </div>
        </div>
      </details>
    </div>
  );
}

/** Legacy wrapper — prefer ParcelFiltersForm inside layout shells */
export function ParcelFiltersPanel({
  filters,
  onChange,
  onReset,
}: {
  filters: ParcelFilters;
  onChange: (next: Partial<ParcelFilters>) => void;
  onReset: () => void;
}) {
  return (
    <aside className="w-full lg:w-72 lg:shrink-0">
      <div className="space-y-5 rounded-xl border border-ink-200 bg-white p-5 shadow-soft">
        <ParcelFiltersForm filters={filters} onChange={onChange} onReset={onReset} />
      </div>
    </aside>
  );
}
