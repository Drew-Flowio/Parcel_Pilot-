"use client";

import React, { useState } from "react";
import type { Parcel, ScoringMode } from "@/lib/types";
import type { ScoringWeightsBundle } from "@/lib/scoringWeights";
import { ParcelDetailDrawer } from "@/components/parcel/ParcelDetailDrawer";
import { Button } from "@/components/ui/Primitives";

export function ParcelDetailClient({
  initial,
  scoringWeights,
  scoringMode = "pm",
}: {
  initial: Parcel;
  scoringWeights: ScoringWeightsBundle;
  scoringMode?: ScoringMode;
}) {
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
      scoringMode={scoringMode}
      scoringWeights={scoringWeights}
    />
  );
}
