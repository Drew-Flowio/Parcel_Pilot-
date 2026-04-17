"use client";

import React, { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button, Input, Label } from "@/components/ui/Primitives";

export function SkipTraceSettings({
  initialConfigured,
}: {
  initialConfigured: boolean;
}) {
  const [configured, setConfigured] = useState(initialConfigured);
  const [key, setKey] = useState("");
  const [pending, startTransition] = useTransition();

  const save = () => {
    startTransition(async () => {
      const res = await fetch("/api/settings/skip-trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchdata_api_key: key }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(json.error ?? "Failed to save key");
        return;
      }
      toast.success("Skip-trace key saved.");
      setConfigured(true);
      setKey("");
    });
  };

  const clear = () => {
    startTransition(async () => {
      const res = await fetch("/api/settings/skip-trace", { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(json.error ?? "Failed to clear key");
        return;
      }
      toast.success("Skip-trace key cleared.");
      setConfigured(false);
    });
  };

  return (
    <section className="rounded-xl border border-ink-200 bg-white p-5 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
            Future: Skip Trace Framework
          </div>
          <h2 className="font-display text-lg font-semibold text-ink-900">
            BatchData / provider key (optional)
          </h2>
          <p className="mt-1 max-w-xl text-xs text-ink-500">
            Parcel Pilot is a lead-intelligence map first. When you want phone numbers for a
            bulk selection, plug a provider key here and we&apos;ll queue lookups from the
            cockpit&apos;s bulk toolbar. 85% of value comes from the map — this is optional.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
            configured
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-ink-200 bg-ink-50 text-ink-500"
          }`}
        >
          {configured ? "Configured" : "Not configured"}
        </span>
      </div>

      <div className="mt-4 space-y-2">
        <Label htmlFor="batchdata-key">BatchData API key</Label>
        <div className="flex gap-2">
          <Input
            id="batchdata-key"
            type="password"
            autoComplete="off"
            placeholder={configured ? "•••••• (stored)" : "sk_..."}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            disabled={pending}
          />
          <Button type="button" onClick={save} disabled={pending || !key.trim()}>
            Save
          </Button>
          {configured ? (
            <Button type="button" variant="danger" onClick={clear} disabled={pending}>
              Clear
            </Button>
          ) : null}
        </div>
        <p className="text-[11px] text-ink-500">
          Stored server-side in <code>app_settings.skip_trace_keys</code>. Never sent to the
          browser after save.
        </p>
      </div>
    </section>
  );
}
