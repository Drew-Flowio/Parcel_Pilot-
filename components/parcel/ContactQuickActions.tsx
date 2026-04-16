"use client";

import React, { useState } from "react";
import type { ContactStatus, Parcel } from "@/lib/types";
import { formatContactStatus } from "@/lib/desirability";
import { Badge, Button } from "@/components/ui/Primitives";

function nowIso(): string {
  return new Date().toISOString();
}

export function ContactQuickActions({
  parcel,
  onUpdated,
}: {
  parcel: Parcel;
  onUpdated: (p: Parcel) => void;
}) {
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const patch = async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/parcels/${parcel.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error((json as { error?: string }).error ?? "PATCH failed");
    onUpdated(json.parcel as Parcel);
  };

  const postContact = async (
    action: "sms" | "email" | "call",
    newStatus: ContactStatus = "contacted"
  ) => {
    const res = await fetch("/api/parcels/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: parcel.id, action, newStatus }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error((json as { error?: string }).error ?? "Contact failed");
    onUpdated(json.parcel as Parcel);
  };

  const status = parcel.contact_status;

  const miniBtn = (
    label: string,
    onClick: () => void,
    opts?: { title?: string; disabled?: boolean }
  ) => (
    <Button
      type="button"
      variant="secondary"
      title={opts?.title}
      disabled={busy || opts?.disabled}
      className="px-2 py-1 text-[11px] font-semibold"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {busy ? "…" : label}
    </Button>
  );

  return (
    <div
      className="flex min-w-[12rem] max-w-[20rem] flex-col gap-2"
      onClick={(e) => e.stopPropagation()}
    >
      <Badge className="w-fit border-ink-200/80 bg-white text-ink-800">
        {formatContactStatus(status)}
        {status === "contacted" ? (
          <span className="ml-1 text-emerald-600" aria-hidden>
            ✓
          </span>
        ) : null}
      </Badge>

      <div className="flex flex-wrap gap-1">
        {status === "not_contacted" ? (
          <>
            {miniBtn("SMS", () => run(() => postContact("sms")), {
              title: "Log SMS outreach",
              disabled: !parcel.owner_phone,
            })}
            {miniBtn("Email", () => run(() => postContact("email")), {
              title: "Log email outreach",
              disabled: !parcel.owner_email,
            })}
            {miniBtn("Call", () => run(() => postContact("call")), {
              title: "Log call",
            })}
            {miniBtn(
              "Skip",
              () =>
                run(() =>
                  patch({
                    contact_status: "follow_up",
                    last_contacted_at: nowIso(),
                  })
                ),
              { title: "Defer to follow-up (no message sent)" }
            )}
          </>
        ) : null}

        {status === "contacted" ? (
          <>
            {miniBtn(
              "Follow-Up",
              () =>
                run(() =>
                  patch({
                    contact_status: "follow_up",
                    last_contacted_at: nowIso(),
                  })
                )
            )}
            {miniBtn(
              "Do Not Contact",
              () =>
                run(() =>
                  patch({
                    contact_status: "do_not_contact",
                    last_contacted_at: nowIso(),
                  })
                )
            )}
          </>
        ) : null}

        {status === "follow_up" ? (
          <>
            {miniBtn("SMS", () => run(() => postContact("sms", "contacted")), {
              disabled: !parcel.owner_phone,
            })}
            {miniBtn("Email", () => run(() => postContact("email", "contacted")), {
              disabled: !parcel.owner_email,
            })}
            {miniBtn("Call", () => run(() => postContact("call", "contacted")))}
          </>
        ) : null}

        {status === "do_not_contact" ? (
          <span className="text-[11px] text-ink-500">No actions</span>
        ) : null}
      </div>
    </div>
  );
}
