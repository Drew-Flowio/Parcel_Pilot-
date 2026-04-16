"use client";

import React from "react";
import type { CockpitMode } from "@/lib/types";

/**
 * Segments shown in the shell — property-management focus.
 * (`flipper_mode` exists on the type for future work; not listed here until that product slice ships.)
 */
const PM_COCKPIT_MODES: { id: CockpitMode; label: string }[] = [
  { id: "top_targets", label: "Top Targets" },
  { id: "high_value_pm", label: "High Value PM" },
  { id: "small_buildings", label: "Small Buildings" },
  { id: "portfolio_view", label: "Portfolio View" },
];

export function CockpitModeToggle({
  value,
  onChange,
}: {
  value: CockpitMode;
  onChange: (mode: CockpitMode) => void;
}) {
  return (
    <div className="w-full min-w-0">
      <div className="rounded-2xl border border-ink-200/90 bg-gradient-to-b from-ink-100 to-ink-50/90 p-1.5 shadow-[inset_0_1px_2px_rgba(17,21,31,0.06)]">
        <div
          role="tablist"
          aria-label="Workspace mode"
          className="flex gap-1 overflow-x-auto overscroll-x-contain pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:flex-wrap sm:overflow-x-visible [&::-webkit-scrollbar]:hidden"
        >
          {PM_COCKPIT_MODES.map((m) => {
            const active = m.id === value;
            return (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onChange(m.id)}
                className={`shrink-0 rounded-xl px-3 py-2.5 text-center text-sm font-semibold transition sm:min-w-0 sm:flex-1 ${
                  active
                    ? "bg-white text-ink-900 shadow-md ring-1 ring-ink-200/80"
                    : "text-ink-600 hover:bg-white/70 hover:text-ink-900"
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
