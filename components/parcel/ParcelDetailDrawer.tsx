"use client";

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import type { ContactStatus, Parcel, ScoringMode } from "@/lib/types";
import type { ScoringWeightsBundle } from "@/lib/scoringWeights";
import { weightsForMode } from "@/lib/scoringWeights";
import {
  computeDesirabilityBreakdown,
  formatContactStatus,
  formatCurrency,
  formatScoreSummaryLine,
  formatVacancy,
  parseDesirabilityScore,
  scoreColor,
} from "@/lib/desirability";
import { Badge, Button, Input, Label, Select } from "@/components/ui/Primitives";

const notesClass =
  "min-h-[88px] w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-200";

export function ParcelDetailDrawer({
  parcel,
  onClose,
  onUpdated,
  scoringMode = "pm",
  scoringWeights,
}: {
  parcel: Parcel | null;
  onClose: () => void;
  onUpdated: (p: Parcel) => void;
  scoringMode?: ScoringMode;
  scoringWeights?: ScoringWeightsBundle;
}) {
  const [draft, setDraft] = useState<Parcel | null>(parcel);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  useEffect(() => setDraft(parcel), [parcel]);

  if (!parcel || !draft) return null;

  const modeWeights = scoringWeights
    ? weightsForMode(scoringWeights, scoringMode)
    : null;
  const breakdown = modeWeights
    ? computeDesirabilityBreakdown(draft, {
        mode: scoringMode,
        weights: modeWeights,
      })
    : computeDesirabilityBreakdown(draft);
  const storedScore = parseDesirabilityScore(draft.desirability_score);
  const displayScore = breakdown.computedTotal;
  const scoreMismatch =
    storedScore != null &&
    Math.abs(storedScore - breakdown.computedTotal) > 0.15;

  const summaryLine = formatScoreSummaryLine(breakdown.factors);

  const patch = async (body: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/parcels/${parcel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error((json as { error?: string }).error ?? "Could not save changes");
        return;
      }
      if (json.parcel) {
        setDraft(json.parcel);
        onUpdated(json.parcel);
        toast.success("Saved", { id: "parcel-drawer-patch", duration: 2000 });
      } else {
        toast.error("Unexpected response");
      }
    } finally {
      setSaving(false);
    }
  };

  const contactAction = async (action: "sms" | "email" | "call") => {
    setBusyAction(action);
    try {
      const res = await fetch(`/api/parcels/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: parcel.id, action }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error((json as { error?: string }).error ?? "Contact action failed");
        return;
      }
      if (json.parcel) {
        setDraft(json.parcel);
        onUpdated(json.parcel);
        const label =
          action === "sms" ? "SMS logged" : action === "email" ? "Email logged" : "Call logged";
        toast.success(label);
      } else {
        toast.error("Unexpected response");
      }
    } finally {
      setBusyAction(null);
    }
  };

  const cityLine = [draft.city, draft.state, draft.zip].filter(Boolean).join(", ");

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[60] bg-ink-950/35 backdrop-blur-[3px]"
      />
      <aside className="drawer-enter fixed right-0 top-0 z-[70] flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-ink-200 bg-white shadow-[0_0_0_1px_rgba(17,21,31,0.06),-12px_0_40px_rgba(17,21,31,0.12)]">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-ink-100 bg-gradient-to-b from-ink-50/80 to-white px-6 py-5">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
              Property
              {modeWeights ? (
                <span className="ml-2 rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold normal-case text-ink-600">
                  {scoringMode === "flipper" ? "Flipper scoring" : "PM scoring"}
                </span>
              ) : null}
            </div>
            <h2 className="font-display text-xl font-semibold leading-snug text-ink-900 sm:text-2xl">
              {draft.property_address}
            </h2>
            {cityLine ? (
              <p className="mt-1 text-sm text-ink-500">{cityLine}</p>
            ) : null}
            {draft.neighborhood ? (
              <p className="mt-0.5 text-xs text-ink-400">{draft.neighborhood}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <Badge className={`${scoreColor(displayScore)} px-3 py-1 text-base`}>
              <span className="font-mono">{displayScore.toFixed(1)}</span>
              <span className="text-[10px] uppercase tracking-wider">/100</span>
            </Badge>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-ink-500 hover:bg-ink-100 hover:text-ink-900"
            >
              Close
            </button>
          </div>
        </div>

        {/* Top — Property facts + score */}
        <section className="border-b border-ink-100 px-6 py-6">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
            Details
          </h3>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <Fact label="Market value" value={formatCurrency(draft.market_value)} />
            <Fact label="Units" value={draft.unit_count?.toString() ?? "—"} />
            <Fact label="Vacancy" value={formatVacancy(draft.vacancy_status)} />
            <Fact label="Days vacant" value={draft.days_vacant?.toString() ?? "—"} />
            <Fact label="Absentee" value={draft.is_absentee_owner ? "Yes" : "No"} />
            <Fact
              label="Pro managed"
              value={
                draft.is_professionally_managed === true
                  ? "Yes"
                  : draft.is_professionally_managed === false
                    ? "No"
                    : "Unknown"
              }
            />
          </div>

          <div className="mt-6">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
              Score breakdown
            </h4>
            <p className="mt-2 text-sm leading-relaxed text-ink-800">
              <span className="font-mono text-[13px] leading-relaxed">{summaryLine}</span>
            </p>
            <details className="mt-3 rounded-lg border border-ink-100 bg-ink-50/60">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-ink-600">
                Full factor list &amp; formula
              </summary>
              <div className="border-t border-ink-100 px-3 py-2 text-xs text-ink-600">
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <span>
                    Stored:{" "}
                    <span className="font-mono font-semibold text-ink-800">
                      {storedScore != null ? storedScore.toFixed(1) : "—"}
                    </span>
                  </span>
                  <span>
                    Raw sum:{" "}
                    <span className="font-mono font-semibold text-ink-800">
                      {breakdown.rawSum.toFixed(1)}
                    </span>
                    {modeWeights ? (
                      <>
                        /{modeWeights.rawMax.toFixed(0)} → 0–100
                      </>
                    ) : (
                      "/70"
                    )}
                  </span>
                  <span>
                    Mode score:{" "}
                    <span className="font-mono font-semibold text-ink-800">
                      {breakdown.computedTotal.toFixed(1)}
                    </span>
                  </span>
                </div>
                {scoreMismatch ? (
                  <p className="mt-2 text-amber-800">
                    Stored score (Postgres PM baseline) differs from the score shown for this
                    mode.
                  </p>
                ) : null}
              </div>
              <ul className="mt-4 space-y-2 border-t border-ink-100 px-3 py-3">
                {breakdown.factors.map((f, i) => (
                  <li
                    key={i}
                    className="flex items-start justify-between gap-3 rounded-lg border border-ink-100 bg-white/80 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-ink-800">{f.label}</div>
                      <div className="text-xs text-ink-500">{f.detail}</div>
                    </div>
                    <div
                      className={`shrink-0 rounded-md px-2 py-0.5 font-mono text-xs ${
                        f.points > 0
                          ? "bg-emerald-100 text-emerald-700"
                          : f.points < 0
                            ? "bg-red-100 text-red-700"
                            : "bg-ink-100 text-ink-500"
                      }`}
                    >
                      {f.points > 0 ? "+" : ""}
                      {f.points}
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </section>

        {/* Middle — Owner */}
        <section className="border-b border-ink-100 bg-ink-50/50 px-6 py-6">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
            Owner
          </h3>
          <div className="mt-4 grid grid-cols-1 gap-4">
            <div>
              <Label>Owner name</Label>
              <Input
                value={draft.owner_name}
                onChange={(e) => setDraft({ ...draft, owner_name: e.target.value })}
                onBlur={() => patch({ owner_name: draft.owner_name })}
                placeholder="Owner or entity name"
              />
            </div>
            <div>
              <Label>Mailing address</Label>
              <textarea
                className={notesClass + " min-h-[72px]"}
                value={draft.mailing_address ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, mailing_address: e.target.value || null })
                }
                onBlur={() => patch({ mailing_address: draft.mailing_address })}
                placeholder="Street, city, state, ZIP"
                rows={3}
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={draft.owner_phone ?? ""}
                onChange={(e) => setDraft({ ...draft, owner_phone: e.target.value })}
                onBlur={() => patch({ owner_phone: draft.owner_phone })}
                placeholder="555-555-5555"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={draft.owner_email ?? ""}
                onChange={(e) => setDraft({ ...draft, owner_email: e.target.value })}
                onBlur={() => patch({ owner_email: draft.owner_email })}
                placeholder="owner@example.com"
              />
            </div>
          </div>
        </section>

        {/* Bottom — Contact history + actions */}
        <section className="flex flex-1 flex-col px-6 py-6">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
            Contact &amp; activity
          </h3>

          <div className="mt-4 rounded-xl border border-ink-200 bg-ink-50/40 p-4">
            <div className="font-display text-sm font-semibold text-ink-900">History</div>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-ink-500">Status</dt>
                <dd className="font-medium text-ink-900">
                  {formatContactStatus(draft.contact_status)}
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-ink-500">Last contact</dt>
                <dd className="text-right font-medium text-ink-900">
                  {draft.last_contacted_at
                    ? new Date(draft.last_contacted_at).toLocaleString()
                    : "—"}
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-ink-500">Channel</dt>
                <dd className="font-medium capitalize text-ink-900">
                  {draft.contacted_via ?? "—"}
                </dd>
              </div>
            </dl>
            <div className="mt-4">
              <Label>Update status</Label>
              <Select
                value={draft.contact_status}
                onChange={(e) => {
                  const v = e.target.value as ContactStatus;
                  setDraft({ ...draft, contact_status: v });
                  patch({ contact_status: v });
                }}
              >
                <option value="not_contacted">Not contacted</option>
                <option value="contacted">Contacted</option>
                <option value="follow_up">Follow up</option>
                <option value="do_not_contact">Do not contact</option>
              </Select>
            </div>
          </div>

          <div className="mt-5">
            <Label>Notes</Label>
            <textarea
              className={notesClass}
              value={draft.contact_notes ?? ""}
              onChange={(e) => setDraft({ ...draft, contact_notes: e.target.value })}
              onBlur={() => patch({ contact_notes: draft.contact_notes })}
              placeholder="Outreach notes, follow-ups, skip-trace flags…"
            />
            {saving ? (
              <p className="mt-1 text-xs italic text-ink-400">Saving…</p>
            ) : null}
          </div>

          <div className="mt-6">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
              Quick actions
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="primary"
                disabled={!draft.owner_phone || busyAction !== null}
                onClick={() => contactAction("sms")}
              >
                {busyAction === "sms" ? "Sending…" : "SMS"}
              </Button>
              <Button
                variant="primary"
                disabled={!draft.owner_email || busyAction !== null}
                onClick={() => contactAction("email")}
              >
                {busyAction === "email" ? "Sending…" : "Email"}
              </Button>
              <Button
                variant="secondary"
                disabled={busyAction !== null}
                onClick={() => contactAction("call")}
              >
                {busyAction === "call" ? "Logging…" : "Call"}
              </Button>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-400">
              SMS and email are stubbed in V1 — they log activity and update status. Wire
              Twilio / Resend in <code className="font-mono text-ink-500">/api/parcels/contact</code>{" "}
              for real sends.
            </p>
          </div>
        </section>

        <div className="mt-auto border-t border-ink-100 p-4 text-center text-[11px] text-ink-400">
          Parcel ID <span className="font-mono">{draft.id}</span>
        </div>
      </aside>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
        {label}
      </div>
      <div className="mt-0.5 text-sm text-ink-800">{value}</div>
    </div>
  );
}
