"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Parcel, ParcelFilters, ViewSlice } from "@/lib/types";
import { ParcelViewToggle } from "./ParcelViewToggle";
import { ParcelFiltersPanel } from "./ParcelFilters";
import { ParcelTable } from "./ParcelTable";
import { ParcelDetailDrawer } from "./ParcelDetailDrawer";
import { Button } from "@/components/ui/Primitives";

interface InitialPayload {
  rows: Parcel[];
  total: number;
  filters: ParcelFilters;
}

export function Cockpit({ initial }: { initial: InitialPayload }) {
  const router = useRouter();

  const [filters, setFilters] = useState<ParcelFilters>(initial.filters);
  const [rows, setRows] = useState<Parcel[]>(initial.rows);
  const [total, setTotal] = useState<number>(initial.total);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<Parcel | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextFetch = useRef(true); // we already have initial

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

  // Fetch on filter change (debounced) + sync URL
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

  const updateFilters = (patch: Partial<ParcelFilters>) => {
    setFilters((f) => ({ ...f, ...patch, page: 1 }));
  };
  const resetFilters = () => {
    setFilters({ view: filters.view, sort: "desirability_score", page: 1, pageSize: 25 });
  };

  const setView = (v: ViewSlice) => setFilters((f) => ({ ...f, view: v, page: 1 }));

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
    () => rows.filter((r) => r.desirability_score >= 70).length,
    [rows]
  );

  const onUpdated = (p: Parcel) => {
    setRows((rs) => rs.map((r) => (r.id === p.id ? p : r)));
    setActive(p);
  };

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      {/* Stats strip */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
            Cockpit
          </div>
          <h1 className="font-display text-3xl font-semibold leading-tight text-ink-900">
            {total.toLocaleString()} parcels{" "}
            <span className="text-ink-400">·</span>{" "}
            <span className="text-accent-600">{topTargetCount}</span>{" "}
            <span className="text-base font-normal text-ink-500">top targets in view</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 ? (
            <span className="text-xs text-ink-500">{selected.size} selected</span>
          ) : null}
          <a href={exportUrl}>
            <Button variant="primary">
              ↓ Export {selected.size > 0 ? "selected" : "list"} (CSV)
            </Button>
          </a>
        </div>
      </div>

      <ParcelViewToggle value={filters.view} onChange={setView} />

      <div className="flex flex-col gap-6 lg:flex-row">
        <ParcelFiltersPanel
          filters={filters}
          onChange={updateFilters}
          onReset={resetFilters}
        />

        <div className="min-w-0 flex-1 space-y-4">
          <ParcelTable
            rows={rows}
            loading={loading}
            selected={selected}
            onToggleSelect={toggleSelect}
            onToggleAll={toggleAll}
            onRowClick={(p) => setActive(p)}
          />

          {/* Pagination */}
          {pageCount > 1 ? (
            <div className="flex items-center justify-between">
              <div className="text-xs text-ink-500">
                Page {page} of {pageCount}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
                >
                  ← Prev
                </Button>
                <Button
                  variant="secondary"
                  disabled={page >= pageCount}
                  onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
                >
                  Next →
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <ParcelDetailDrawer
        parcel={active}
        onClose={() => setActive(null)}
        onUpdated={onUpdated}
      />
    </div>
  );
}
