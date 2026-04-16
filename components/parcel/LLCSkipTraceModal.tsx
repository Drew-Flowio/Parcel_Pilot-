"use client";

import React, { useEffect, useId, useState } from "react";
import type { Parcel } from "@/lib/types";
import {
  appendNeedsSkipTraceNote,
  BATCH_SKIP_TRACING_URL,
  minnesotaSecretaryOfStateSearchUrl,
  PROPSTREAM_URL,
} from "@/lib/skipTrace";
import { Button } from "@/components/ui/Primitives";

export function LLCSkipTraceModal({
  parcel,
  open,
  onClose,
  onMarked,
}: {
  parcel: Parcel | null;
  open: boolean;
  onClose: () => void;
  onMarked: (updated: Parcel) => void;
}) {
  const titleId = useId();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !parcel) return null;

  const name = parcel.owner_name.trim();
  const mnSosUrl = minnesotaSecretaryOfStateSearchUrl(name);

  const markYes = async () => {
    setBusy(true);
    try {
      const notes = appendNeedsSkipTraceNote(parcel.contact_notes);
      const res = await fetch(`/api/parcels/${parcel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_notes: notes }),
      });
      const json = await res.json();
      if (!res.ok) {
        window.alert((json as { error?: string }).error ?? "Could not save note.");
        return;
      }
      if (json.parcel) {
        onMarked(json.parcel as Parcel);
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[80] bg-ink-950/40 backdrop-blur-[2px]"
        aria-hidden
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed left-1/2 top-1/2 z-[90] w-[min(100%,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-ink-200 bg-white p-6 shadow-pop"
      >
        <h2 id={titleId} className="font-display text-lg font-semibold text-ink-900">
          LLC Owner Detected
        </h2>
        <p className="mt-1 text-sm text-ink-500">Next steps:</p>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-ink-800">
          <li>
            <a
              href={mnSosUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accent-700 underline decoration-accent-300 underline-offset-2 hover:text-accent-800"
            >
              MN Secretary of State Lookup
            </a>
            <span className="block text-xs text-ink-500">
              Search pre-filled with owner name (verify on the SOS site).
            </span>
          </li>
          <li>Cross-reference agent address (mailing vs property).</li>
          <li className="flex flex-wrap gap-x-3 gap-y-1">
            <a
              href={PROPSTREAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accent-700 underline decoration-accent-300 underline-offset-2 hover:text-accent-800"
            >
              PropStream
            </a>
            <a
              href={BATCH_SKIP_TRACING_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accent-700 underline decoration-accent-300 underline-offset-2 hover:text-accent-800"
            >
              BatchSkipTracing
            </a>
            <span className="text-xs text-ink-500">(open in new tabs)</span>
          </li>
        </ol>

        <p className="mt-6 text-sm font-medium text-ink-800">
          Want to mark as &apos;needs skip trace&apos;?
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="primary" disabled={busy} onClick={markYes}>
            {busy ? "Saving…" : "Yes"}
          </Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            Later
          </Button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-900"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
    </>
  );
}
