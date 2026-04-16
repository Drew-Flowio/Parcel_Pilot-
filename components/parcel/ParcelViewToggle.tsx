"use client";

import React from "react";
import type { ViewSlice } from "@/lib/types";

const VIEWS: { id: ViewSlice; label: string; sub: string }[] = [
  { id: "top", label: "Top Targets", sub: "Hottest list, ranked by score" },
  { id: "high_value", label: "High Value & Under-Managed", sub: "Absentee + valuable + no PM" },
  { id: "small_juicy", label: "Small but Juicy", sub: "3–40 units, winnable accounts" },
];

export function ParcelViewToggle({
  value,
  onChange,
}: {
  value: ViewSlice;
  onChange: (v: ViewSlice) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-ink-200 bg-white p-1 shadow-soft">
      {VIEWS.map((v) => {
        const active = v.id === value;
        return (
          <button
            key={v.id}
            onClick={() => onChange(v.id)}
            className={`group relative rounded-lg px-4 py-2 text-left transition ${
              active
                ? "bg-ink-900 text-white shadow-pop"
                : "text-ink-600 hover:bg-ink-50"
            }`}
          >
            <div className="text-sm font-semibold">{v.label}</div>
            <div
              className={`text-[11px] ${
                active ? "text-ink-200" : "text-ink-400"
              }`}
            >
              {v.sub}
            </div>
          </button>
        );
      })}
    </div>
  );
}
