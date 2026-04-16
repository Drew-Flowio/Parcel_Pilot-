"use client";

import React, { useId } from "react";

type DualRangeSliderProps = {
  id?: string;
  minBound: number;
  maxBound: number;
  step: number;
  /** Current low value (inclusive). */
  valueLow: number;
  /** Current high value (inclusive). */
  valueHigh: number;
  onChange: (low: number, high: number) => void;
  format: (n: number) => string;
  "aria-label"?: string;
};

/**
 * Two native range inputs on one track; thumbs stay ordered (low ≤ high).
 */
export function DualRangeSlider({
  id: idProp,
  minBound,
  maxBound,
  step,
  valueLow,
  valueHigh,
  onChange,
  format,
  "aria-label": ariaLabel = "Range",
}: DualRangeSliderProps) {
  const uid = useId();
  const baseId = idProp ?? uid;

  const safeLow = Math.min(valueLow, valueHigh);
  const safeHigh = Math.max(valueLow, valueHigh);
  const span = maxBound - minBound;

  const setLow = (v: number) => {
    const next = Math.min(Math.max(minBound, v), safeHigh);
    onChange(next, safeHigh);
  };

  const setHigh = (v: number) => {
    const next = Math.max(Math.min(maxBound, v), safeLow);
    onChange(safeLow, next);
  };

  const lowMax = Math.min(maxBound, safeHigh);
  const highMin = Math.max(minBound, safeLow);

  return (
    <div className="pt-1">
      <div className="relative h-9">
        <div
          className="pointer-events-none absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-ink-200"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-accent-400/90"
          style={{
            left: `${span === 0 ? 0 : ((safeLow - minBound) / span) * 100}%`,
            width: `${span === 0 ? 100 : ((safeHigh - safeLow) / span) * 100}%`,
          }}
          aria-hidden
        />
        <input
          id={`${baseId}-low`}
          type="range"
          className="dual-range-thumb absolute inset-x-0 top-1/2 z-10 w-full -translate-y-1/2"
          min={minBound}
          max={lowMax}
          step={step}
          value={safeLow}
          aria-label={`${ariaLabel} minimum`}
          onChange={(e) => setLow(Number(e.target.value))}
        />
        <input
          id={`${baseId}-high`}
          type="range"
          className="dual-range-thumb absolute inset-x-0 top-1/2 z-20 w-full -translate-y-1/2"
          min={highMin}
          max={maxBound}
          step={step}
          value={safeHigh}
          aria-label={`${ariaLabel} maximum`}
          onChange={(e) => setHigh(Number(e.target.value))}
        />
      </div>
      <div className="mt-2 flex justify-between gap-2 text-xs font-medium tabular-nums text-ink-700">
        <span className="min-w-0 truncate">{format(safeLow)}</span>
        <span className="min-w-0 truncate text-right">{format(safeHigh)}</span>
      </div>
    </div>
  );
}
