/** Default rows per page (server-side range). */
export const DEFAULT_PAGE_SIZE = 50;

export const MIN_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 200;

/** Debounced filter → fetch delay (matches Cockpit). */
export const FILTER_DEBOUNCE_MS = 300;

export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export function clampPageSize(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, Math.floor(n)));
}

/** Allowed page sizes only (25 / 50 / 100); unknown URL values fall back to default. */
export function resolvePageSize(raw: number | undefined): number {
  if (raw == null || !Number.isFinite(raw)) return DEFAULT_PAGE_SIZE;
  const c = clampPageSize(raw);
  if ((PAGE_SIZE_OPTIONS as readonly number[]).includes(c)) return c;
  return DEFAULT_PAGE_SIZE;
}
