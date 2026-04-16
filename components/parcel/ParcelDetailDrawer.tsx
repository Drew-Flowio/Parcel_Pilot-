"use client";

import React, { useEffect, useState } from "react";
import type { ContactStatus, Parcel } from "@/lib/types";
import {
  computeDesirabilityBreakdown,
  formatContactStatus,
  formatCurrency,
  formatVacancy,
  scoreColor,
} from "@/lib/desirability";
import { Badge, Button, Input, Label, Select } from "@/components/ui/Primitives";

export function ParcelDetailDrawer({
  parcel,
  onClose,
  onUpdated,
}: {
  parcel: Parcel | null;
  onClose: () => void;
  onUpdated: (p: Parcel) => void;
}) {
  const [draft, setDraft] = useState<Parcel | null>(parcel);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  useEffect(() => setDraft(parcel), [parcel]);

  if (!parcel || !draft) return null;

  const breakdown = computeDesirabilityBreakdown(draft);

  const patch = async (body: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/parcels/${parcel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.parcel) {
        setDraft(json.parcel);
        onUpdated(json.parcel);
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
      if (json.parcel) {
        setDraft(json.parcel);
        onUpdated(json.parcel);
      }
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <>
      {/* Backdrop — above filter drawer (z-50), below nothing */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-[60] bg-ink-950/35 backdrop-blur-[3px]"
      />
      {/* Record panel */}
      <aside className="drawer-enter fixed right-0 top-0 z-[70] flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-ink-200 bg-white shadow-[0_0_0_1px_rgba(17,21,31,0.06),-12px_0_40px_rgba(17,21,31,0.12)]">
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 bg-gradient-to-b from-ink-50/80 to-white px-6 py-5">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
              Record
            </div>
            <h2 className="font-display text-2xl font-semibold leading-tight text-ink-900">
              {draft.owner_name}
            </h2>
            <div className="mt-1 text-sm text-ink-500">{draft.property_address}</div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge className={`${scoreColor(breakdown.total)} px-3 py-1 text-base`}>
              <span className="font-mono">{breakdown.total.toFixed(0)}</span>
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

        {/* Property facts */}
        <section className="grid grid-cols-2 gap-4 border-b border-ink-100 p-6 text-sm">
          <Fact label="Mailing address" value={draft.mailing_address ?? "—"} />
          <Fact label="City / State / Zip" value={[draft.city, draft.state, draft.zip].filter(Boolean).join(", ") || "—"} />
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
        </section>

        {/* Score breakdown */}
        <section className="border-b border-ink-100 p-6">
          <h3 className="font-display text-lg font-semibold text-ink-900">
            Why this score
          </h3>
          <p className="mt-1 text-xs text-ink-500">
            Each factor contributes points toward the 0–100 desirability score.
          </p>
          <ul className="mt-4 space-y-2">
            {breakdown.factors.map((f, i) => (
              <li
                key={i}
                className="flex items-start justify-between gap-3 rounded-lg border border-ink-100 bg-ink-50/50 px-3 py-2"
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
        </section>

        {/* Contact info (editable) */}
        <section className="border-b border-ink-100 p-6">
          <h3 className="font-display text-lg font-semibold text-ink-900">
            Owner contact
          </h3>
          <div className="mt-4 grid grid-cols-1 gap-4">
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
            <div>
              <Label>Status</Label>
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
            <div>
              <Label>Notes</Label>
              <textarea
                className="min-h-[80px] w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-200"
                value={draft.contact_notes ?? ""}
                onChange={(e) => setDraft({ ...draft, contact_notes: e.target.value })}
                onBlur={() => patch({ contact_notes: draft.contact_notes })}
                placeholder="Add a note about your outreach…"
              />
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 text-xs text-ink-500">
            <span className="font-medium text-ink-700">
              Last contacted:
            </span>{" "}
            {draft.last_contacted_at
              ? `${new Date(draft.last_contacted_at).toLocaleString()} via ${draft.contacted_via ?? "—"}`
              : "Never"}
            {saving ? <span className="ml-auto italic">Saving…</span> : null}
          </div>
        </section>

        {/* Contact actions */}
        <section className="p-6">
          <h3 className="font-display text-lg font-semibold text-ink-900">Outreach</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={!draft.owner_phone || busyAction !== null}
              onClick={() => contactAction("sms")}
            >
              {busyAction === "sms" ? "Sending…" : "Send SMS"}
            </Button>
            <Button
              variant="primary"
              disabled={!draft.owner_email || busyAction !== null}
              onClick={() => contactAction("email")}
            >
              {busyAction === "email" ? "Sending…" : "Send Email"}
            </Button>
            <Button
              variant="secondary"
              disabled={busyAction !== null}
              onClick={() => contactAction("call")}
            >
              {busyAction === "call" ? "Logging…" : "Log Call"}
            </Button>
          </div>
          <p className="mt-3 text-[11px] text-ink-400">
            SMS and email are stubbed in V1 — they update contact status but do not yet hit a
            provider. Wire Twilio / Resend in <code>/api/parcels/contact</code> to enable real sends.
          </p>
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
