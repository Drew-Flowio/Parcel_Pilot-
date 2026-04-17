/** Max length for URL `q` param — keeps query strings and Postgres patterns bounded. */
export const MAX_PARCEL_SEARCH_LENGTH = 200;

const SEARCH_COLUMNS = [
  "owner_name",
  "property_address",
  "mailing_address",
  "management_company_name",
  "contact_notes",
] as const;

/** Escape LIKE wildcards in user input (Postgres `ilike`). */
export function escapeIlikePattern(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Normalize free-text search: trim, collapse whitespace, strip commas (would break PostgREST `or`),
 * cap length.
 */
export function normalizeParcelSearch(raw: string | undefined): string | undefined {
  if (raw == null) return undefined;
  const t = raw.trim().replace(/\s+/g, " ").replace(/,/g, " ").slice(0, MAX_PARCEL_SEARCH_LENGTH);
  return t.length ? t : undefined;
}

/**
 * PostgREST `or` param for Supabase `.or()` — matches any column with `ilike` (case-insensitive).
 * Values are double-quoted so dots, colons, etc. in addresses do not break parsing.
 */
export function buildParcelSearchOrClause(search: string): string | null {
  const normalized = normalizeParcelSearch(search);
  if (!normalized) return null;
  const pattern = `%${escapeIlikePattern(normalized)}%`;
  const quoted = `"${pattern.replace(/"/g, '""')}"`;
  return SEARCH_COLUMNS.map((col) => `${col}.ilike.${quoted}`).join(",");
}
