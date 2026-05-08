import { SkywalkClient } from "../client";
import type {
  CursorMode,
  FetchPageRequest,
  FetchPageResult,
  ResourceAdapter,
  SkywalkResource,
  SupabaseRow,
} from "../types";

/**
 * Shared REST adapter factory. Most modern conversation/CRM APIs follow the
 * same shape: `GET /collection?cursor=…&since=…&limit=…` returning
 * `{ data: [...], next_cursor: "…", has_more: true }`.
 *
 * Each Skywalk resource configures:
 *   - `path` / `byIdPath`           (URL templates)
 *   - `cursorParam` / `sinceParam`  (query-string keys the API expects)
 *   - `dataField` / `nextCursorField` / `hasMoreField`
 *                                   (response body shape; defaults match
 *                                    `data[]` / `next_cursor` / `has_more`)
 *   - `recordTimestamp(record)`     (extracts the watermark for fallback)
 *   - `toRow(record)`               (Skywalk → public.skywalk_* row)
 *
 * All retry, backoff, dedupe, and budget concerns are owned by the engine.
 */
export interface RestAdapterConfig<T> {
  resource: SkywalkResource;
  tableName: string;
  conflictColumn: string;

  path: string;
  byIdPath: string;

  defaultPageSize: number;
  maxPageSize: number;
  cursorMode: CursorMode;

  cursorParam?: string;
  sinceParam?: string;
  limitParam?: string;

  dataField?: string;
  nextCursorField?: string;
  hasMoreField?: string;
  byIdRecordField?: string;

  recordTimestamp(record: T): Date | null;
  toRow(record: T): SupabaseRow;
}

export function createRestAdapter<T extends Record<string, unknown>>(
  cfg: RestAdapterConfig<T>
): ResourceAdapter<T> {
  const cursorParam = cfg.cursorParam ?? "cursor";
  const sinceParam = cfg.sinceParam ?? "since";
  const limitParam = cfg.limitParam ?? "limit";
  const dataField = cfg.dataField ?? "data";
  const nextCursorField = cfg.nextCursorField ?? "next_cursor";
  const hasMoreField = cfg.hasMoreField ?? "has_more";
  const byIdRecordField = cfg.byIdRecordField ?? "data";

  return {
    resource: cfg.resource,
    tableName: cfg.tableName,
    conflictColumn: cfg.conflictColumn,
    defaultPageSize: cfg.defaultPageSize,
    maxPageSize: cfg.maxPageSize,
    cursorMode: cfg.cursorMode,

    async fetchPage(req: FetchPageRequest): Promise<FetchPageResult<T>> {
      const client = new SkywalkClient({ signal: req.signal });
      const limit = Math.min(req.limit, cfg.maxPageSize);

      const query: Record<string, string | number | undefined> = {
        [limitParam]: limit,
      };
      if (req.cursor) query[cursorParam] = req.cursor;
      if (req.since && cfg.cursorMode !== "token") {
        query[sinceParam] = req.since.toISOString();
      }

      const { data: body } = await client.get<Record<string, unknown>>(cfg.path, query);

      const records = pickArray<T>(body, dataField);
      const nextCursor = pickString(body, nextCursorField);
      const hasMore =
        pickBool(body, hasMoreField) ??
        (records.length >= limit ? Boolean(nextCursor) : false);

      let watermark: Date | null = null;
      for (const r of records) {
        const ts = cfg.recordTimestamp(r);
        if (ts && (!watermark || ts > watermark)) watermark = ts;
      }

      return { records, nextCursor, watermark, hasMore };
    },

    async fetchOne(id: string, signal?: AbortSignal): Promise<T | null> {
      const client = new SkywalkClient({ signal });
      const path = cfg.byIdPath.replace("{id}", encodeURIComponent(id));
      const { data: body } = await client.get<Record<string, unknown>>(path);
      const record = (body[byIdRecordField] ?? body) as T | null;
      return record && typeof record === "object" ? record : null;
    },

    toRow(record: T): SupabaseRow {
      return cfg.toRow(record);
    },
  };
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function pickArray<T>(body: Record<string, unknown>, field: string): T[] {
  const v = body[field];
  return Array.isArray(v) ? (v as T[]) : [];
}

function pickString(body: Record<string, unknown>, field: string): string | null {
  const v = body[field];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function pickBool(body: Record<string, unknown>, field: string): boolean | undefined {
  const v = body[field];
  return typeof v === "boolean" ? v : undefined;
}

// ---------- Common record helpers exposed to per-resource adapters ----------

export function pickStr(rec: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

export function pickNum(rec: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

export function pickDate(rec: Record<string, unknown>, ...keys: string[]): Date | null {
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string") {
      const ms = Date.parse(v);
      if (Number.isFinite(ms)) return new Date(ms);
    }
    if (typeof v === "number" && Number.isFinite(v)) {
      return new Date(v < 1e12 ? v * 1000 : v);
    }
  }
  return null;
}

export function normalizeEmail(s: string | null): string | null {
  return s ? s.trim().toLowerCase() : null;
}

export function normalizePhone(s: string | null): string | null {
  if (!s) return null;
  const digits = s.replace(/\D+/g, "");
  return digits.length >= 7 ? digits : null;
}

export function normalizeAddress(parts: Array<string | null | undefined>): string | null {
  const joined = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return joined ? joined.toUpperCase() : null;
}
