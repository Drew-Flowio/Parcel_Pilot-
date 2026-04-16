"use client";

import React from "react";
import type { Parcel } from "@/lib/types";

export interface PortfolioTreeGroup {
  key: string;
  label: string;
  parcelCount: number;
  parcels: Parcel[];
}

export function PortfolioTree({
  groups,
  loading,
  onRowClick,
}: {
  groups: PortfolioTreeGroup[];
  loading: boolean;
  onRowClick: (p: Parcel) => void;
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-ink-200 bg-white px-4 py-8 text-center text-sm text-ink-500 shadow-soft">
        Loading portfolio…
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-ink-200 bg-white px-4 py-8 text-center text-sm text-ink-500 shadow-soft">
        No parcels match the current filters.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {groups.map((g) => (
        <li
          key={g.key}
          className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-soft"
        >
          <details open className="group">
            <summary className="cursor-pointer list-none px-4 py-3 font-semibold text-ink-900">
              <span className="font-display">{g.label}</span>{" "}
              <span className="text-sm font-normal text-ink-500">
                ({g.parcelCount} parcel{g.parcelCount === 1 ? "" : "s"})
              </span>
            </summary>
            <ul className="border-t border-ink-100 px-4 py-2 pb-3">
              {g.parcels.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onRowClick(p)}
                    className="flex w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg px-2 py-1.5 text-left text-sm text-ink-800 transition hover:bg-ink-50"
                  >
                    <span className="font-mono text-ink-900">{p.property_address}</span>
                    <span className="text-xs text-ink-500">
                      (Score: {p.desirability_score})
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </details>
        </li>
      ))}
    </ul>
  );
}
