/**
 * AppFolio outbound HTTP client.
 *
 * Mirrors the `SkywalkClient` design (per-request timeout, exponential
 * backoff with full jitter, 429 with Retry-After parsing, abort signal
 * threading) — but shaped for OUTBOUND writes (POST/PATCH) instead of
 * cursor-paginated reads.
 *
 * Behavior:
 *   - On HTTP 429 → throw `AppFolioRateLimitError` (engine checkpoints,
 *     leaves rollup unsynced, returns `rateLimited=true` so the caller
 *     can log + back off the cron).
 *   - On HTTP 5xx / network → exponential backoff, capped by `maxRetries`.
 *   - On HTTP 4xx (other) → `FatalAppFolioError` (no retry, marked
 *     `failure` in the audit log).
 *   - On success → returns parsed JSON (or `null` for 204).
 *
 * The note-id extraction layer (`upsertNote`) is intentionally generic —
 * configure `APPFOLIO_NOTE_PATH` to a real AppFolio endpoint, a Zapier
 * webhook, or anything else that accepts JSON; if the response includes
 * an `id`, `note_id`, or `external_id` field, we capture it.
 */

import {
  AppFolioRateLimitError,
  FatalAppFolioError,
} from "./types";
import { readAppFolioEnv, type AppFolioEnv } from "./env";
import type { AppFolioNotePayload, AppFolioOwnerPayload } from "./payload";

export interface AppFolioClientOptions {
  signal?: AbortSignal;
  /** If false, throw rate-limit errors immediately without auto-retry. */
  retryOn429?: boolean;
}

export interface AppFolioPushResult<T = Record<string, unknown>> {
  data: T | null;
  /** AppFolio-side id once captured (or null). */
  externalId: string | null;
  /** Raw status code for the audit log. */
  httpStatus: number;
}

export class AppFolioClient {
  private env: AppFolioEnv;
  private options: AppFolioClientOptions;

  constructor(options: AppFolioClientOptions = {}) {
    this.env = readAppFolioEnv();
    this.options = { retryOn429: false, ...options };
  }

  /**
   * Idempotent note upsert.
   *   - existingNoteId IS NULL → POST {notePath}
   *   - existingNoteId not null → PATCH {noteByIdPath}
   *
   * Returns the AppFolio note id (newly assigned for POST, echoed for PATCH).
   */
  async upsertNote(
    payload: AppFolioNotePayload,
    existingNoteId: string | null
  ): Promise<AppFolioPushResult> {
    if (existingNoteId) {
      const path = this.env.paths.noteById.replace("{id}", encodeURIComponent(existingNoteId));
      const r = await this.requestWithRetry<Record<string, unknown>>(
        this.buildUrl(path),
        { method: "PATCH", body: JSON.stringify(payload) }
      );
      return { ...r, externalId: pickId(r.data) ?? existingNoteId };
    }
    const r = await this.requestWithRetry<Record<string, unknown>>(
      this.buildUrl(this.env.paths.note),
      { method: "POST", body: JSON.stringify(payload) }
    );
    return { ...r, externalId: pickId(r.data) };
  }

  /** Owner / parcel record upsert (manual on-demand only). */
  async upsertOwner(
    payload: AppFolioOwnerPayload,
    existingOwnerId: string | null
  ): Promise<AppFolioPushResult> {
    if (existingOwnerId) {
      const path = this.env.paths.ownerById.replace("{id}", encodeURIComponent(existingOwnerId));
      const r = await this.requestWithRetry<Record<string, unknown>>(
        this.buildUrl(path),
        { method: "PATCH", body: JSON.stringify(payload) }
      );
      return { ...r, externalId: pickId(r.data) ?? existingOwnerId };
    }
    const r = await this.requestWithRetry<Record<string, unknown>>(
      this.buildUrl(this.env.paths.owner),
      { method: "POST", body: JSON.stringify(payload) }
    );
    return { ...r, externalId: pickId(r.data) };
  }

  // -------------------------------------------------------------------------

  private buildUrl(path: string): string {
    return new URL(path.startsWith("/") ? path : `/${path}`, this.env.baseUrl).toString();
  }

  private async requestWithRetry<T>(
    url: string,
    init: RequestInit
  ): Promise<{ data: T | null; httpStatus: number }> {
    const maxAttempts = this.env.maxRetries + 1;
    let attempt = 0;
    let lastError: unknown;

    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        return await this.requestOnce<T>(url, init);
      } catch (err) {
        lastError = err;
        if (err instanceof FatalAppFolioError) throw err;
        if (this.options.signal?.aborted) throw err;

        if (err instanceof AppFolioRateLimitError) {
          if (!this.options.retryOn429) throw err;
          await this.delay(Math.min(err.retryAfterMs, 30_000));
          continue;
        }

        // 5xx / network → exponential backoff with full jitter.
        if (attempt >= maxAttempts) break;
        const baseMs = 250 * Math.pow(2, attempt - 1);
        const jitter = Math.random() * baseMs;
        await this.delay(Math.min(15_000, Math.floor(baseMs + jitter)));
      }
    }

    if (lastError instanceof Error) throw lastError;
    throw new Error(`AppFolio request failed after ${maxAttempts} attempts: ${String(lastError)}`);
  }

  private async requestOnce<T>(
    url: string,
    init: RequestInit
  ): Promise<{ data: T | null; httpStatus: number }> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.env.timeoutMs);
    const upstream = this.options.signal;
    const onUpstreamAbort = () => ac.abort();
    upstream?.addEventListener("abort", onUpstreamAbort, { once: true });

    try {
      const headers = new Headers(init.headers);
      headers.set(this.env.authHeader, `${this.env.authScheme}${this.env.apiKey}`);
      headers.set("Content-Type", "application/json");
      headers.set("Accept", "application/json");
      headers.set("User-Agent", this.env.userAgent);

      const res = await fetch(url, { ...init, headers, signal: ac.signal });

      if (res.status === 429) {
        const retryAfterMs = parseRetryAfterMs(res.headers) ?? 5_000;
        await res.text().catch(() => undefined);
        throw new AppFolioRateLimitError(retryAfterMs);
      }

      if (res.status >= 500) {
        const body = await res.text().catch(() => "");
        throw new Error(`AppFolio ${res.status}: ${truncate(body, 256)}`);
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new FatalAppFolioError(
          `AppFolio ${res.status}: ${truncate(body, 256)}`,
          res.status
        );
      }

      if (res.status === 204) return { data: null, httpStatus: 204 };

      const data = (await res.json().catch(() => null)) as T | null;
      return { data, httpStatus: res.status };
    } finally {
      clearTimeout(timer);
      upstream?.removeEventListener("abort", onUpstreamAbort);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      const onAbort = () => {
        clearTimeout(t);
        reject(new Error("Aborted during AppFolio backoff"));
      };
      this.options.signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
}

// ---------------------------------------------------------------------------

function parseRetryAfterMs(headers: Headers): number | null {
  const raw = headers.get("retry-after");
  if (!raw) return null;
  const asNum = Number(raw);
  if (Number.isFinite(asNum)) return Math.max(0, Math.floor(asNum * 1000));
  const asDate = Date.parse(raw);
  if (Number.isFinite(asDate)) return Math.max(0, asDate - Date.now());
  return null;
}

/**
 * Defensively pull out an id-ish field from any response shape.
 * Real AppFolio: `id`. Zapier: `id` or `data.id`. Custom shim: `note_id`.
 */
function pickId(body: Record<string, unknown> | null): string | null {
  if (!body) return null;
  for (const key of ["id", "note_id", "external_id"]) {
    const v = body[key];
    if (typeof v === "string" && v.length > 0) return v;
    if (typeof v === "number") return String(v);
  }
  const data = body["data"];
  if (data && typeof data === "object") {
    return pickId(data as Record<string, unknown>);
  }
  return null;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + "…";
}
