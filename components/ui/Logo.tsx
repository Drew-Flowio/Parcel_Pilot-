import React from "react";

export function ParcelPilotLogo({
  className = "",
  showWordmark = true,
  iconClassName = "h-11 w-11 sm:h-12 sm:w-12",
}: {
  className?: string;
  showWordmark?: boolean;
  iconClassName?: string;
}) {
  return (
    <div className={`flex items-center gap-3 sm:gap-4 ${className}`}>
      <svg
        viewBox="0 0 64 64"
        xmlns="http://www.w3.org/2000/svg"
        className={`shrink-0 ${iconClassName}`}
        aria-label="Parcel Pilot — Cessna over skyline"
        role="img"
      >
        {/* Sun / circle backdrop */}
        <circle cx="32" cy="32" r="30" fill="#fff8eb" stroke="#11151f" strokeWidth="2" />

        {/* Skyline silhouette */}
        <g fill="#11151f">
          <rect x="6" y="40" width="6" height="14" />
          <rect x="13" y="32" width="4" height="22" />
          <polygon points="13,32 15,28 17,32" />
          <rect x="18" y="36" width="7" height="18" />
          <rect x="26" y="22" width="6" height="32" />
          <rect x="28" y="18" width="2" height="6" />
          <rect x="33" y="30" width="5" height="24" />
          <rect x="34" y="26" width="3" height="6" />
          <rect x="39" y="34" width="6" height="20" />
          <rect x="46" y="28" width="5" height="26" />
          <polygon points="46,28 48.5,23 51,28" />
          <rect x="52" y="38" width="6" height="16" />
        </g>

        <g fill="#f57c00">
          <rect x="27" y="26" width="1" height="1" />
          <rect x="30" y="26" width="1" height="1" />
          <rect x="27" y="30" width="1" height="1" />
          <rect x="30" y="30" width="1" height="1" />
          <rect x="27" y="34" width="1" height="1" />
          <rect x="30" y="34" width="1" height="1" />
          <rect x="47" y="32" width="1" height="1" />
          <rect x="49" y="32" width="1" height="1" />
          <rect x="47" y="36" width="1" height="1" />
          <rect x="49" y="36" width="1" height="1" />
          <rect x="20" y="40" width="1" height="1" />
          <rect x="22" y="40" width="1" height="1" />
          <rect x="20" y="44" width="1" height="1" />
          <rect x="22" y="44" width="1" height="1" />
        </g>

        <line x1="2" y1="54" x2="62" y2="54" stroke="#11151f" strokeWidth="1.5" />

        {/* Cessna high-wing over the skyline */}
        <g transform="translate(38, 12) rotate(-8)">
          <ellipse cx="0" cy="0" rx="9" ry="2" fill="#f57c00" stroke="#11151f" strokeWidth="1" />
          <rect x="-7" y="-3.2" width="14" height="1.6" fill="#fff" stroke="#11151f" strokeWidth="1" />
          <line x1="-4" y1="-1.6" x2="-5" y2="0.5" stroke="#11151f" strokeWidth="0.7" />
          <line x1="4" y1="-1.6" x2="5" y2="0.5" stroke="#11151f" strokeWidth="0.7" />
          <polygon points="-9,0 -12,-3 -10,0 -12,2" fill="#fff" stroke="#11151f" strokeWidth="1" />
          <line x1="9" y1="-2" x2="9" y2="2" stroke="#11151f" strokeWidth="1" />
          <circle cx="2" cy="-0.5" r="0.9" fill="#11151f" />
        </g>

        <g stroke="#11151f" strokeWidth="0.8" strokeLinecap="round" opacity="0.45">
          <line x1="22" y1="14" x2="26" y2="13" />
          <line x1="20" y1="17" x2="24" y2="16.5" />
        </g>
      </svg>

      {showWordmark ? (
        <div className="leading-tight">
          <div className="font-display text-xl font-semibold tracking-tight text-ink-900 sm:text-2xl">
            Parcel Pilot
          </div>
          <div className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.2em] text-ink-500 sm:text-xs">
            Lead gen cockpit
          </div>
        </div>
      ) : null}
    </div>
  );
}
