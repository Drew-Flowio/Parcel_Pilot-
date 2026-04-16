export type OwnerTypeKind = "individual" | "llc" | "institutional" | "other";

export interface OwnerTypeInfo {
  kind: OwnerTypeKind;
  emoji: string;
  label: string;
}

/** Government / institutional owners (checked first). */
const INSTITUTIONAL_RE =
  /\b(?:city|county|school|hra)\b/i;

/** LLC, LLP, Inc-style entities. */
const LLC_RE = /\b(?:llc|llp|inc\.?)\b/i;

/**
 * Classifies `owner_name` with simple regex heuristics (order: institutional → LLC → individual).
 * Individual = contains whitespace and does not match LLC/institutional patterns.
 */
export function classifyOwnerType(ownerName: string | null | undefined): OwnerTypeInfo {
  const n = (ownerName ?? "").trim();
  if (!n) {
    return { kind: "other", emoji: "⚪", label: "Unknown" };
  }

  if (INSTITUTIONAL_RE.test(n)) {
    return { kind: "institutional", emoji: "🔴", label: "Institutional" };
  }
  if (LLC_RE.test(n)) {
    return { kind: "llc", emoji: "🟡", label: "LLC" };
  }
  if (/\s/.test(n)) {
    return { kind: "individual", emoji: "🟢", label: "Individual" };
  }

  return { kind: "other", emoji: "⚪", label: "Other" };
}

export function ownerTypeBadgeClass(kind: OwnerTypeKind): string {
  switch (kind) {
    case "individual":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "llc":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "institutional":
      return "border-red-200 bg-red-50 text-red-900";
    default:
      return "border-ink-200 bg-ink-50 text-ink-700";
  }
}
