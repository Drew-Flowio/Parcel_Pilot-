import React from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/desirability";
import type { SosAgentPortfolio } from "@/lib/types";

/**
 * Cross-reference card: "Agent John Doe manages 47 LLCs = 128 parcels = $18M".
 * Powered by `public.sos_agent_portfolios` (SOS-resolved entities joined to
 * `portfolio_groups`). Renders an empty-state with a call-to-action when nothing
 * is resolved yet — so the dashboard never looks broken on day 1.
 */
export function AgentIntelligence({ rows }: { rows: SosAgentPortfolio[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-ink-200 bg-white/60 p-6 text-sm text-ink-600">
        <div className="font-display text-base font-semibold text-ink-900">
          Agent Intelligence
        </div>
        <p className="mt-1 max-w-xl text-sm text-ink-500">
          Resolve LLC agents from the cockpit drawer to unlock agent-level
          cross-references — e.g. &ldquo;Agent John Doe manages 47 LLCs = 128
          parcels = $18M&rdquo;. Each resolution also adds +5 contactability to
          the underlying entity.
        </p>
        <Link
          href="/cockpit?portfolio=1"
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:border-ink-300 hover:bg-ink-50"
        >
          Open cockpit to resolve entities →
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-ink-200 bg-white shadow-soft">
      <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
            LLC Intelligence Layer
          </div>
          <div className="font-display text-base font-semibold text-ink-900">
            Agents to call first
          </div>
        </div>
        <span className="text-[11px] text-ink-500">
          {rows.length.toLocaleString()} resolved
        </span>
      </div>
      <ol className="divide-y divide-ink-100">
        {rows.map((r, i) => (
          <li key={r.agent_key} className="flex items-center gap-3 px-4 py-3">
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-100 text-[11px] font-semibold tabular-nums text-ink-700">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-ink-900">
                {r.registered_agent_name}
              </div>
              <div className="truncate text-xs text-ink-500">
                {r.entity_count.toLocaleString()} entit
                {r.entity_count === 1 ? "y" : "ies"} · {r.parcel_count.toLocaleString()} parcels
                {r.total_units > 0 ? ` · ${r.total_units.toLocaleString()} units` : ""}
              </div>
              {r.registered_agent_address ? (
                <div className="truncate text-[11px] text-ink-400">
                  {r.registered_agent_address}
                </div>
              ) : null}
            </div>
            <div className="text-right text-sm tabular-nums font-semibold text-ink-900">
              {formatCurrency(r.total_market_value)}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
