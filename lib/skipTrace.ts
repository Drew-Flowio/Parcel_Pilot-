/** Marker appended to `contact_notes` when user marks a parcel as needing skip trace. */
export const NEEDS_SKIP_TRACE_MARKER = "[Needs skip trace]";

export function hasNeedsSkipTraceNote(notes: string | null | undefined): boolean {
  return /\[needs skip trace\]/i.test(notes ?? "");
}

export function appendNeedsSkipTraceNote(existing: string | null | undefined): string {
  const base = (existing ?? "").trim();
  if (hasNeedsSkipTraceNote(base)) return base;
  return base ? `${base}\n${NEEDS_SKIP_TRACE_MARKER}` : NEEDS_SKIP_TRACE_MARKER;
}

/**
 * Minnesota SOS business filings — search term in query (helps pre-fill where supported).
 * @see https://www.sos.state.mn.us/business-liens/business-help/how-to-search-business-filings/
 */
export function minnesotaSecretaryOfStateSearchUrl(businessName: string): string {
  const q = encodeURIComponent(businessName.trim());
  return `https://www.sos.state.mn.us/business-liens/business-help/how-to-search-business-filings/?searchTerm=${q}`;
}

export const PROPSTREAM_URL = "https://www.propstream.com/";

export const BATCH_SKIP_TRACING_URL = "https://batchskiptracing.com/";
