import type { Parcel, PortfolioGroupBy } from "./types";

export interface PortfolioGroup {
  key: string;
  label: string;
  parcels: Parcel[];
}

const NONE_KEY = "__none__";

function collapseWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Stable key for grouping (owner or mailing). */
export function normalizeGroupKey(
  raw: string | null | undefined,
  groupBy: PortfolioGroupBy
): string {
  if (raw == null || collapseWs(raw) === "") return NONE_KEY;
  return collapseWs(raw).toUpperCase();
}

export function labelForGroupKey(
  key: string,
  groupBy: PortfolioGroupBy
): string {
  if (key === NONE_KEY) {
    return groupBy === "mailing" ? "(No mailing address)" : "(Unknown owner)";
  }
  return key;
}

/** Prefer a readable label from the first parcel in the group. */
function pickDisplayLabel(
  key: string,
  groupBy: PortfolioGroupBy,
  sample: Parcel
): string {
  if (key === NONE_KEY) return labelForGroupKey(key, groupBy);
  const raw =
    groupBy === "mailing" ? sample.mailing_address : sample.owner_name;
  const s = raw != null ? collapseWs(raw) : "";
  return s || labelForGroupKey(key, groupBy);
}

export function groupParcels(
  rows: Parcel[],
  groupBy: PortfolioGroupBy
): PortfolioGroup[] {
  const buckets = new Map<
    string,
    { parcels: Parcel[]; label: string }
  >();

  for (const p of rows) {
    const raw =
      groupBy === "mailing" ? p.mailing_address : p.owner_name;
    const key = normalizeGroupKey(raw, groupBy);
    let b = buckets.get(key);
    if (!b) {
      b = {
        parcels: [],
        label: pickDisplayLabel(key, groupBy, p),
      };
      buckets.set(key, b);
    }
    b.parcels.push(p);
  }

  for (const [key, b] of buckets) {
    b.parcels.sort(
      (a, z) =>
        (z.desirability_score ?? 0) - (a.desirability_score ?? 0)
    );
  }

  const groups: PortfolioGroup[] = Array.from(buckets.entries()).map(
    ([key, b]) => ({
      key,
      label: b.label,
      parcels: b.parcels,
    })
  );

  groups.sort((a, z) => {
    const dc = z.parcels.length - a.parcels.length;
    if (dc !== 0) return dc;
    return a.label.localeCompare(z.label, undefined, {
      sensitivity: "base",
    });
  });

  return groups;
}

export function flattenWithPortfolioColumn(
  groups: PortfolioGroup[]
): Array<{ parcel: Parcel; portfolio_group: string }> {
  const out: Array<{ parcel: Parcel; portfolio_group: string }> = [];
  for (const g of groups) {
    for (const p of g.parcels) {
      out.push({ parcel: p, portfolio_group: g.label });
    }
  }
  return out;
}
