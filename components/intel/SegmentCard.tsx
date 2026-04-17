import React from "react";
import Link from "next/link";
import type { LeadSegment } from "@/lib/types";

const ICONS: Record<string, string> = {
  target: "🎯",
  layers: "🗂️",
  clock: "⏱️",
  sparkle: "✨",
  fire: "🔥",
};

export function SegmentCard({ segment }: { segment: LeadSegment }) {
  const icon = segment.icon ? (ICONS[segment.icon] ?? "•") : "•";
  return (
    <Link
      href={`/segments/${segment.slug}`}
      className="group flex flex-col justify-between rounded-xl border border-ink-200 bg-white p-4 shadow-soft transition hover:border-accent-300 hover:shadow-md"
    >
      <div>
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-xl leading-none">
            {icon}
          </span>
          <span className="font-display text-sm font-semibold text-ink-900 group-hover:text-accent-700">
            {segment.label}
          </span>
        </div>
        {segment.description ? (
          <p className="mt-2 text-xs leading-relaxed text-ink-500">
            {segment.description}
          </p>
        ) : null}
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] font-medium">
        <span className="text-ink-400">One-click pipeline</span>
        <span className="text-accent-700 group-hover:text-accent-800">Open →</span>
      </div>
    </Link>
  );
}
