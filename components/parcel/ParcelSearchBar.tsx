"use client";

import React from "react";
import { Input } from "@/components/ui/Primitives";
import { MAX_PARCEL_SEARCH_LENGTH } from "@/lib/parcelSearch";

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path strokeLinecap="round" d="M20 20l-3-3" />
    </svg>
  );
}

export function ParcelSearchBar({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="relative">
        <span
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
          aria-hidden
        >
          <SearchIcon />
        </span>
        <Input
          className="pl-10"
          type="search"
          name="parcel-search"
          autoComplete="off"
          enterKeyHint="search"
          maxLength={MAX_PARCEL_SEARCH_LENGTH}
          placeholder="Search address, owner, LLC, business name…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-label="Search parcels by address, owner, or business"
        />
      </div>
      <p className="text-[11px] leading-snug text-ink-500">
        Matches property or mailing address, owner name, management company, and contact notes.
      </p>
    </div>
  );
}
