/**
 * Skywalk ingestion types — shared between the HTTP client, the cursor
 * state machine, the per-resource adapters, and the API routes.
 */

export type SkywalkResource = "messages" | "contacts" | "properties";

/** Cursor strategies a Skywalk endpoint might use. */
export type CursorMode = "token" | "timestamp" | "token_or_timestamp";

export interface FetchPageRequest {
  /** Opaque pagination token from the API (or null on first page). */
  cursor: string | null;
  /** Timestamp watermark (or null) — used when the API supports `?since=…`. */
  since: Date | null;
  /** Page size hint. The adapter is free to clamp. */
  limit: number;
  /** Abort signal — wall-clock budget propagates here. */
  signal?: AbortSignal;
}

export interface FetchPageResult<T = Record<string, unknown>> {
  records: T[];
  /** Token to use on the next fetch. Null → no more pages. */
  nextCursor: string | null;
  /**
   * Most recent record timestamp seen in this page. Used as a fallback
   * watermark when the API doesn't surface a cursor token.
   */
  watermark: Date | null;
  hasMore: boolean;
  /** Optional rate-limit hints surfaced from response headers. */
  rateLimit?: {
    remaining?: number;
    resetAt?: Date;
    retryAfterMs?: number;
  };
}

/** Row shape that fits one of the `public.skywalk_*` tables. */
export type SupabaseRow = Record<string, unknown>;

/**
 * Adapter contract for a single Skywalk resource. The engine owns retries,
 * cursor state, dedupe, and budget; the adapter only owns the API call
 * shape and the record-to-row mapping.
 */
export interface ResourceAdapter<T = Record<string, unknown>> {
  resource: SkywalkResource;
  /** Supabase table name. */
  tableName: string;
  /** Conflict column for ON CONFLICT (... ) DO UPDATE. */
  conflictColumn: string;
  /** Default page size when not overridden by the caller. */
  defaultPageSize: number;
  /** Max page size the API tolerates. */
  maxPageSize: number;
  /** Which cursor mode this adapter prefers. */
  cursorMode: CursorMode;
  /** Fetch one page of records. */
  fetchPage(req: FetchPageRequest): Promise<FetchPageResult<T>>;
  /** Fetch a single record by upstream id (used by the manual-fetch queue). */
  fetchOne(id: string, signal?: AbortSignal): Promise<T | null>;
  /** Map an API record to a Supabase row. Must include the conflict column + `raw`. */
  toRow(record: T): SupabaseRow;
}

export interface IngestRunOptions {
  /** Wall-clock budget for the run (ms). Default 30_000. */
  maxWallMs?: number;
  /** Hard cap on HTTP requests. Default 200. */
  maxRequests?: number;
  /** Hard cap on records ingested. Default 5_000. */
  maxRecords?: number;
  /** If true, ignore the existing cursor and re-pull from the start. */
  resetCursor?: boolean;
  /** Override starting cursor token. */
  startCursor?: string | null;
  /** Override starting `since` watermark. */
  startSince?: Date | null;
  /** Override page size. */
  pageSize?: number;
}

export interface IngestRunResult {
  resource: SkywalkResource;
  status: "success" | "error" | "skipped" | "partial";
  pages: number;
  recordsIngested: number;
  durationMs: number;
  finalCursor: string | null;
  finalWatermark: string | null;
  error?: string;
  /** True if we stopped early because of 429 / rate-limit headers. */
  rateLimited?: boolean;
  /** True if we stopped early because of the per-run budget. */
  budgetExhausted?: boolean;
  /** True if another worker held the lease and we backed off. */
  leaseHeld?: boolean;
}

/** Persisted cursor row shape. Mirrors public.skywalk_sync_cursors. */
export interface SkywalkCursorRow {
  id: string;
  source: string;
  resource: string;
  cursor_token: string | null;
  cursor_timestamp: string | null;
  last_run_started_at: string | null;
  last_run_finished_at: string | null;
  last_run_status: "running" | "success" | "error" | "skipped" | null;
  last_run_error: string | null;
  records_seen: number;
  inserted_at: string;
  updated_at: string;
}

/** Custom error class so the engine can distinguish quota events from bugs. */
export class RateLimitError extends Error {
  retryAfterMs: number;
  constructor(retryAfterMs: number, message = "Skywalk rate limited") {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export class FatalSkywalkError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "FatalSkywalkError";
    this.status = status;
  }
}
