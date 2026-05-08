import React from "react";

const CAPS = [
  "Live county cohort",
  "Score v2 routing",
  "Repeat-owner reach",
  "SOS resolution",
  "Absentee signal",
  "Entity mix",
  "One-click segments",
  "Assessor-grounded value",
] as const;

function MarqueeSegment({ idPrefix }: { idPrefix: string }) {
  return (
    <>
      {CAPS.map((label) => (
        <span
          key={`${idPrefix}-${label}`}
          className="flex shrink-0 items-center gap-3 text-[11px] font-bold uppercase tracking-[0.22em] text-ink-500"
        >
          <span className="h-[3px] w-[3px] rounded-full bg-gradient-to-br from-accent-500 to-emerald-500 shadow-[0_0_8px_rgba(245,124,0,0.45)]" aria-hidden />
          {label}
        </span>
      ))}
    </>
  );
}

/** Infinite horizontal ribbon — duplicate segment + CSS marquee (no JS). */
export function FlowioMarquee() {
  return (
    <div
      className="relative isolate overflow-hidden border-y border-white/60 bg-gradient-to-r from-transparent via-white/55 to-transparent py-3"
      role="presentation"
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-white/90 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-white/90 to-transparent" />
      <div className="flowio-marquee-track items-center gap-16">
        <div className="flex shrink-0 items-center gap-16 pr-16">
          <MarqueeSegment idPrefix="a" />
        </div>
        <div className="flex shrink-0 items-center gap-16 pr-16" aria-hidden>
          <MarqueeSegment idPrefix="b" />
        </div>
      </div>
    </div>
  );
}
