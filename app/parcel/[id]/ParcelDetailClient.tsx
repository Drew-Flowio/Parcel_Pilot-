"use client";

import React, { useState } from "react";
import type { Parcel } from "@/lib/types";
import { ParcelDetailDrawer } from "@/components/parcel/ParcelDetailDrawer";
import { Button } from "@/components/ui/Primitives";

export function ParcelDetailClient({ initial }: { initial: Parcel }) {
  const [parcel, setParcel] = useState<Parcel | null>(initial);
  const [closed, setClosed] = useState(false);

  if (closed || !parcel) {
    return (
      <div className="rounded-xl border border-dashed border-ink-300 bg-white p-12 text-center">
        <div className="font-display text-lg text-ink-800">Detail panel closed.</div>
        <Button className="mt-4" onClick={() => setClosed(false)}>
          Reopen
        </Button>
      </div>
    );
  }

  return (
    <ParcelDetailDrawer
      parcel={parcel}
      onClose={() => setClosed(true)}
      onUpdated={(p) => setParcel(p)}
    />
  );
}
