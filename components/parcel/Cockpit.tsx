"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CockpitMode, Parcel, ParcelFilters } from "@/lib/types";
import { cockpitModeToViewSlice, viewSliceToCockpitMode } from "@/lib/cockpitMode";
import { CockpitModeToggle } from "./CockpitModeToggle";
import { ParcelFiltersForm } from "./ParcelFilters";
import { ParcelTable } from "./ParcelTable";
import { ParcelDetailDrawer } from "./ParcelDetailDrawer";
import { Button, Label, Select } from "@/components/ui/Primitives";
import { PARCEL_SORT_OPTIONS } from "@/lib/parcelSortOptions";
import { parseDesirabilityScore } from "@/lib/desirability";

interface InitialPayload {
  rows: Parcel[];
  total: number;
  filters: ParcelFilters;
}

function ChevronLeftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function Cockpit({ initial }: { initial: InitialPayload }) {
  const router = useRouter();

  const [filters, setFilters] = useState<ParcelFilters>(initial.filters);
  const [rows, setRows] = useState<Parcel[]>(initial.rows);
  const [total, setTotal] = useState<number>(initial.total);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<Parcel | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [cockpitMode, setCockpitMode] = useState<CockpitMode>(() =>
    viewSliceToCockpitMode(initial.filters.view)
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextFetch = useRef(true);

  const buildQueryString = useCallback((f: ParcelFilters) => {
    const sp = new URLSearchParams();
    sp.set("view", f.view);
    if (f.minValue != null) sp.set("minValue", String(f.minValue));
    if (f.maxValue != null) sp.set("maxValue", String(f.maxValue));
    if (f.minUnits != null) sp.set("minUnits", String(f.minUnits));
    if (f.maxUnits != null) sp.set("maxUnits", String(f.maxUnits));
    if (f.absentee && f.absentee !== "all") sp.set("absentee", f.absentee);
    if (f.vacancy?.length) f.vacancy.forEach((v) => sp.append("vacancy", v));
    if (f.minDaysVacant != null) sp.set("minDaysVacant", String(f.minDaysVacant));
    if (f.contactStatus?.length) f.contactStatus.forEach((c) => sp.append("contact", c));
    if (f.sort) sp.set("sort", f.sort);
    if (f.page && f.page > 1) sp.set("page", String(f.page));
    return sp.toString();
  }, []);

  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const qs = buildQueryString(filters);
      router.replace(`/?${qs}`, { scroll: false });
      try {
        const res = await fetch(`/api/parcels?${qs}`);
        const json = await res.json();
        setRows(json.rows ?? []);
        setTotal(json.total ?? 0);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  useEffect(() => {
    if (mobileFiltersOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [mobileFiltersOpen]);

  useEffect(() => {
    if (active) setMobileFiltersOpen(false);
  }, [active]);

  const updateFilters = (patch: Partial<ParcelFilters>) => {
    setFilters((f) => ({ ...f, ...patch, page: 1 }));
  };
  const resetFilters = () => {
    setFilters({
      view: cockpitModeToViewSlice(cockpitMode),
      sort: "desirability_score",
      page: 1,
      pageSize: 25,
    });
  };

  const onCockpitModeChange = (mode: CockpitMode) => {
    setCockpitMode(mode);
    setFilters((f) => ({ ...f, view: cockpitModeToViewSlice(mode), page: 1 }));
  };

  const toggleSelect = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = (ids: string[]) => {
    setSelected((s) => {
      const allIn = ids.every((id) => s.has(id));
      const next = new Set(s);
      if (allIn) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const exportUrl = useMemo(() => {
    if (selected.size > 0) {
      const sp = new URLSearchParams();
      Array.from(selected).forEach((id) => sp.append("id", id));
      return `/api/parcels/export?${sp.toString()}`;
    }
    return `/api/parcels/export?${buildQueryString(filters)}`;
  }, [selected, filters, buildQueryString]);

  const topTargetCount = useMemo(
    () =>
      rows.filter((r) => (parseDesirabilityScore(r.desirability_score) ?? 0) >= 85)
        .length,
    [rows]
  );

  const onUpdated = (p: Parcel) => {
    setRows((rs) => rs.map((r) => (r.id === p.id ? p : r)));
    setActive(p);
  };

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const tableTotalLabel = `${rows.length.toLocaleString()} on page · ${total.toLocaleString()} total`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        {/* Desktop: collapsible filter rail */}
        <aside
          className={`relative hidden shrink-0 flex-col border-r border-ink-200 bg-white transition-[width] duration-200 ease-out lg:flex ${
            sidebarCollapsed ? "w-14" : "min-w-[22rem] w-[22rem]"
          }`}
        >
          {sidebarCollapsed ? (
            <div className="flex flex-col items-center border-b border-ink-100 py-2">
              <button
                type="button"
                title="Expand filters"
                onClick={() => setSidebarCollapsed(false)}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-600 transition hover:bg-ink-50 hover:text-ink-900"
              >
                <ChevronRightIcon />
              </button>
              <span className="mt-1 max-w-[2.5rem] text-center text-[9px] font-semibold uppercase leading-tight tracking-wide text-ink-400">
                Filter
              </span>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
                <span className="text-sm font-semibold text-ink-900">Filters</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="rounded-md px-2 py-1 text-xs font-medium text-ink-500 hover:bg-ink-50 hover:text-accent-700"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    title="Collapse filters"
                    onClick={() => setSidebarCollapsed(true)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100"
                  >
                    <ChevronLeftIcon />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
                <ParcelFiltersForm
                  filters={filters}
                  onChange={updateFilters}
                  onReset={resetFilters}
                  showActions={false}
                />
              </div>
            </>
          )}
        </aside>

        {/* Center: pipeline */}
        <main className="flex min-w-0 flex-1 flex-col bg-ink-50/40">
          {/* Mobile filter trigger */}
          <div className="flex items-center justify-between gap-3 border-b border-ink-200/80 bg-white/90 px-4 py-3 backdrop-blur-sm lg:hidden">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                Pipeline
              </div>
              <div className="text-sm font-semibold text-ink-900">
                {total.toLocaleString()} records
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="shrink-0"
              onClick={() => setMobileFiltersOpen(true)}
            >
              Filters
            </Button>
          </div>

          <div className="flex flex-1 flex-col gap-5 p-4 sm:p-6">
            <CockpitModeToggle value={cockpitMode} onChange={onCockpitModeChange} />

            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                  Lead gen cockpit
                </div>
                <h1 className="font-display text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
                  {total.toLocaleString()}{" "}
                  <span className="text-ink-400">·</span>{" "}
                  <span className="text-accent-600">{topTargetCount}</span>{" "}
                  <span className="text-lg font-normal text-ink-500 sm:text-xl">
                    top targets in view
                  </span>
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selected.size > 0 ? (
                  <span className="rounded-full bg-accent-50 px-3 py-1 text-xs font-medium text-accent-800 ring-1 ring-accent-200/60">
                    {selected.size} selected
                  </span>
                ) : null}
                <a href={exportUrl}>
                  <Button variant="primary">Export CSV</Button>
                </a>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex flex-col gap-2 rounded-xl border border-ink-200 bg-white px-4 py-3 shadow-soft sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <Label htmlFor="parcel-sort" className="!mb-0 shrink-0 sm:pt-0.5">
                  Sort by
                </Label>
                <Select
                  id="parcel-sort"
                  className="sm:max-w-xs sm:flex-1"
                  value={filters.sort ?? "desirability_score"}
                  onChange={(e) =>
                    updateFilters({
                      sort: e.target.value as ParcelFilters["sort"],
                    })
                  }
                >
                  {PARCEL_SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>

              <ParcelTable
                rows={rows}
                loading={loading}
                selected={selected}
                onToggleSelect={toggleSelect}
                onToggleAll={toggleAll}
                onRowClick={(p) => setActive(p)}
                totalLabel={tableTotalLabel}
              />
            </div>

            {pageCount > 1 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm shadow-soft">
                <span className="text-ink-500">
                  Page <span className="font-medium text-ink-800">{page}</span> of{" "}
                  <span className="font-medium text-ink-800">{pageCount}</span>
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    disabled={page <= 1}
                    onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={page >= pageCount}
                    onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </main>
      </div>

      {/* Mobile: full-screen filter drawer */}
      {mobileFiltersOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <div className="drawer-enter absolute inset-0 flex flex-col bg-white shadow-pop">
            <div className="flex items-center justify-between border-b border-ink-100 px-4 py-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                  Refine list
                </div>
                <div className="text-lg font-semibold text-ink-900">Filters</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-sm font-medium text-ink-500 hover:text-accent-700"
                >
                  Reset
                </button>
                <Button type="button" variant="primary" onClick={() => setMobileFiltersOpen(false)}>
                  Done
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-8">
              <ParcelFiltersForm
                filters={filters}
                onChange={updateFilters}
                onReset={resetFilters}
                showActions={false}
              />
            </div>
          </div>
        </div>
      ) : null}

      <ParcelDetailDrawer
        parcel={active}
        onClose={() => setActive(null)}
        onUpdated={onUpdated}
      />
    </div>
  );
}
