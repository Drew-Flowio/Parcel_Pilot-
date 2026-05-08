import React from "react";
import type { IntelligenceDashboardSummary } from "@/lib/intelligence";
import {
  deriveDashboardGaugeMetrics,
  roundDisplayPct,
  type DashboardGaugeDerived,
  type GaugeFill,
} from "@/lib/dashboardGaugeMetrics";

/** Top semicircle path; pathLength=100 so stroke-dash is percent of arc. */
const ARC_D_TOP = "M 14 72 A 46 46 0 0 0 106 72";

type ArcTone = "gold" | "emerald" | "violet" | "accent";

const ARC_GRAD: Record<ArcTone, [string, string]> = {
  gold: ["#ea580c", "#fbbf24"],
  emerald: ["#059669", "#34d399"],
  violet: ["#7c3aed", "#a78bfa"],
  accent: ["#d97706", "#fca5a5"],
};

function clampPct(v: GaugeFill): number {
  if (v == null || !Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, v));
}

/**
 * Accessible semicircular gauge — fill is normalized 0–100 from live metrics (`deriveDashboardGaugeMetrics`).
 */
export function SemiArcGauge({
  fillPct,
  label,
  caption,
  foot,
  tone,
  idSuffix,
  emptyCohortLabel = "Offline",
  idleLabel = "—",
  emptyCohort,
  idle,
}: {
  fillPct: GaugeFill;
  label: string;
  caption: string;
  /** Short line below caption (counts, numerator/denominator). */
  foot?: string;
  tone: ArcTone;
  idSuffix: string;
  /** No Supabase cohort (or hard zero parcel rows). */
  emptyCohortLabel?: string;
  /** fillPct intentionally null — e.g. SOS with nothing queued yet. */
  idleLabel?: string;
  emptyCohort?: boolean;
  idle?: boolean;
}) {
  const gradId = `gg-${idSuffix}`;
  const [c0, c1] = ARC_GRAD[tone];
  const fill = emptyCohort ? 0 : clampPct(fillPct);
  const showFillArc = !emptyCohort && !idle && fillPct != null && fill > 0;
  const showIdleArc = idle || (!emptyCohort && fillPct == null);
  const showEmptyArc = !!emptyCohort;

  let centerLabel: string;
  if (emptyCohort) centerLabel = emptyCohortLabel;
  else if (idle || fillPct == null) centerLabel = idleLabel;
  else centerLabel = `${Math.round(fill * 10) / 10}%`;

  const ariaPct =
    emptyCohort || idle || fillPct == null ? centerLabel : `${Math.round(fill * 10) / 10}% of arc`;

  return (
    <figure
      className="flex flex-col items-center rounded-2xl border border-white/75 bg-white/90 px-2 py-3 shadow-lift-sm ring-1 ring-ink-900/[0.03] transition duration-300 hover:-translate-y-1 hover:border-accent-200/40 hover:shadow-lift"
      aria-label={`${label}. ${caption}. Showing ${ariaPct}.`}
    >
      <figcaption className="order-2 mx-auto mt-3 max-w-[11rem] text-center">
        <div className="text-[10px] font-bold uppercase tracking-wider text-ink-400">{label}</div>
        <p className="mt-1 text-xs leading-snug text-ink-600">{caption}</p>
        {foot ? <p className="mt-1 font-mono text-[11px] tabular-nums text-ink-500">{foot}</p> : null}
      </figcaption>
      <div className="relative order-1 h-[5.25rem] w-[8.75rem]" aria-hidden>
        <svg className="h-full w-full" viewBox="0 0 120 80">
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={c0} />
              <stop offset="100%" stopColor={c1} />
            </linearGradient>
          </defs>
          <path
            pathLength={100}
            d={ARC_D_TOP}
            fill="none"
            stroke="#eceef1"
            strokeWidth={9}
            strokeLinecap="round"
          />
          {showFillArc ? (
            <path
              pathLength={100}
              d={ARC_D_TOP}
              fill="none"
              stroke={`url(#${gradId})`}
              strokeWidth={9}
              strokeLinecap="round"
              strokeDasharray={`${fill} ${100}`}
              className="transition-[stroke-dasharray] duration-700 ease-out"
            />
          ) : null}
          {(showIdleArc || showEmptyArc) && !showFillArc ? (
            <path
              pathLength={100}
              d={ARC_D_TOP}
              fill="none"
              stroke="#d5dae0"
              strokeWidth={7}
              strokeLinecap="round"
              strokeDasharray="8 14"
              opacity={showEmptyArc ? 0.45 : 0.7}
            />
          ) : null}
        </svg>
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
          <span className="font-display text-xl font-semibold tabular-nums tracking-tight text-ink-900">
            {centerLabel}
          </span>
        </div>
      </div>
    </figure>
  );
}

/**
 * Horizontal gauge bar — shares the same pct semantics as RPC-backed summaries.
 */
export function LinearPercentGauge({
  pct,
  label,
  suffix,
  foot,
  tone,
}: {
  pct: GaugeFill;
  label: string;
  suffix?: string;
  foot?: string;
  tone: "emerald" | "gold" | "violet";
}) {
  const track = pct == null ? 0 : clampPct(pct);
  const bar =
    tone === "emerald"
      ? "from-emerald-500 to-teal-400"
      : tone === "violet"
        ? "from-violet-600 to-purple-400"
        : "from-accent-500 to-amber-500";

  return (
    <div className="w-full">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-1 text-xs font-medium text-ink-500">
        <span>{label}</span>
        <span className="tabular-nums text-ink-700">
          {pct == null ? "—" : roundDisplayPct(pct)}
          {suffix ? suffix : ""}
        </span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-ink-100">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${bar} transition-all duration-700 ease-out`}
          style={{ width: pct == null ? "0%" : `${track}%` }}
        />
        {track > 0 && track < 0.85 ? (
          <span className="sr-only">Progress bar width equals {track} percent.</span>
        ) : null}
      </div>
      {foot ? <p className="mt-1 text-[11px] leading-snug text-ink-400">{foot}</p> : null}
    </div>
  );
}

/**
 * Owner-type composition — percentages are parcel-grain (`llcs`, `individuals`, etc. over `totalParcels`).
 */
export function OwnerMixGauge({
  summary,
  derived,
}: {
  summary: IntelligenceDashboardSummary;
  derived: DashboardGaugeDerived;
}) {
  const { totalParcels } = summary;
  if (derived.isEmptyCohort || totalParcels <= 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-amber-200/80 bg-amber-50/40 px-4 py-10 text-center text-sm text-amber-950/80">
        <div className="mb-3 h-24 w-24 rounded-full border-2 border-dashed border-amber-300/70" aria-hidden />
        <p className="font-semibold text-amber-950">County cohort not loaded</p>
        <p className="mt-1 text-xs text-amber-950/75">Reconnect to Supabase to see owner-classification mix.</p>
      </div>
    );
  }

  const slices = [
    { n: summary.llcs, pct: derived.entityParcelPct, label: "Entity", tone: "#d97706", bg: "bg-amber-500" },
    {
      n: summary.individuals,
      pct: derived.individualParcelPct,
      label: "Individual",
      tone: "#2f3849",
      bg: "bg-ink-700",
    },
    {
      n: summary.institutions,
      pct: derived.institutionalParcelPct,
      label: "Institutional",
      tone: "#7c3aed",
      bg: "bg-violet-600",
    },
    {
      n: summary.parcels_other,
      pct: derived.otherParcelPct,
      label: "Other",
      tone: "#94a3b8",
      bg: "bg-slate-400",
    },
  ];

  let acc = 0;
  const segments: string[] = [];
  for (const s of slices) {
    if (s.n <= 0 || s.pct == null || s.pct <= 0) continue;
    const deg = (s.n / totalParcels) * 360;
    const start = acc;
    acc += deg;
    segments.push(`${s.tone} ${start}deg ${acc}deg`);
  }
  if (segments.length === 0) {
    segments.push(`#eceef1 0deg 360deg`);
  }

  const conic = `conic-gradient(${segments.join(", ")})`;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="relative mx-auto shrink-0" style={{ width: 124, height: 124 }}>
        <div
          className="h-full w-full rounded-full shadow-inner"
          style={{
            background: conic,
            mask: "radial-gradient(farthest-side, transparent 58%, black 59%)",
            WebkitMask: "radial-gradient(farthest-side, transparent 58%, black 59%)",
          }}
          role="img"
          aria-label={`Owner mix: entity ${summary.llcs}, individual ${summary.individuals}, institutional ${summary.institutions}, other ${summary.parcels_other} parcels`}
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="text-center leading-tight">
            <div className="text-[9px] font-bold uppercase tracking-wide text-ink-400">Owners</div>
            <div className="font-display text-lg font-semibold text-ink-900">{totalParcels.toLocaleString()}</div>
            <div className="text-[10px] text-ink-500">parcels</div>
          </div>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2 text-sm">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 truncate text-ink-700">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${s.bg}`} aria-hidden />
              {s.label}
            </span>
            <span className="font-mono text-xs tabular-nums text-ink-600">
              {s.n.toLocaleString()} · {roundDisplayPct(s.pct)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Four live arc gauges wired to corrected dashboard metrics (+ SOS resolution when queue exists). */
export function DashboardHeroGaugeStrip({
  summary,
}: {
  summary: IntelligenceDashboardSummary;
}) {
  const d = deriveDashboardGaugeMetrics(summary);
  const minScore =
    Number.isFinite(summary.topTargetMinScoreV2) ? summary.topTargetMinScoreV2 : 60;
  const empty = d.isEmptyCohort;

  const sosDenom = summary.sosResolved + summary.sosPending;

  return (
    <div className="rounded-3xl border border-white/75 bg-gradient-to-b from-white via-white to-ink-50/95 p-4 shadow-lift-sm ring-1 ring-ink-900/[0.04] backdrop-blur-sm sm:p-5">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight text-ink-900">Momentum gauges</h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-500">
            Wired to{" "}
            <code className="rounded bg-ink-100 px-1 py-0.5 font-mono text-[10px]">parcel_pilot_dashboard_metrics</code> —
            same roll-up as the cards below (no placeholders).
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SemiArcGauge
          fillPct={empty ? null : d.topTargetPct}
          label="Gold bar clearance"
          caption={`Parcels scoring v2 ≥ ${minScore} (${summary.topTargets.toLocaleString()} total).`}
          foot={empty ? undefined : `${summary.topTargets.toLocaleString()} of ${summary.totalParcels.toLocaleString()} parcels`}
          tone="gold"
          idSuffix="gold"
          emptyCohort={empty}
        />
        <SemiArcGauge
          fillPct={empty ? null : d.repeatOwnerParcelPct}
          label="Repeat-owner reach"
          caption="Parcels tied to owners with two or more properties."
          foot={
            empty
              ? undefined
              : `${summary.parcelsRepeatOwner.toLocaleString()} parcels · ${summary.portfolios.toLocaleString()} owner groups`
          }
          tone="emerald"
          idSuffix="repeat"
          emptyCohort={empty}
        />
        <SemiArcGauge
          fillPct={empty ? null : d.absenteePct}
          label="Absentee share"
          caption="Mailing municipality differs from asset municipality."
          foot={empty ? undefined : `${summary.absentee.toLocaleString()} parcels`}
          tone="violet"
          idSuffix="absentee"
          emptyCohort={empty}
        />
        <SemiArcGauge
          fillPct={empty ? null : sosDenom <= 0 ? null : d.sosResolutionPct}
          label="SOS resolution"
          caption={
            sosDenom <= 0
              ? "No SOS rows queued or resolved yet — queue LLC lookups to fuel this gauge."
              : "Share of SOS intel rows cleared from the pending queue."
          }
          foot={
            sosDenom <= 0 ? undefined : `${summary.sosResolved.toLocaleString()} resolved · ${summary.sosPending.toLocaleString()} queued`
          }
          tone="accent"
          idSuffix="sos"
          emptyCohort={empty}
          idle={!empty && sosDenom <= 0}
          idleLabel="···"
        />
      </div>
    </div>
  );
}
