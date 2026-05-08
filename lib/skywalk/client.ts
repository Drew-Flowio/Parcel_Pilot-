import { FatalSkywalkError, RateLimitError } from "./types";
import { readSkywalkEnv } from "./env";

/**
 * Skywalk HTTP client.
 *
 * Behavior:
 *   - Auth header injected from env (default `Authorization: Bearer …`).
 *   - JSON in / JSON out.
 *   - Per-request timeout via AbortController.
 *   - On HTTP 429 → reads `Retry-After` (seconds OR HTTP-date) and either
 *     (a) sleeps & retries while we still have budget, or (b) throws
 *     `RateLimitError` so the engine can checkpoint the cursor and bail
 *     gracefully.
 *   - On HTTP 5xx / network errors → exponential backoff with full jitter,
 *     capped by `SKYWALK_MAX_RETRIES`. Retries are budget-aware.
 *   - On HTTP 4xx (other than 429) → `FatalSkywalkError` (no retry).
 *
 * The client also surfaces rate-limit headers (`X-RateLimit-Remaining`,
 * `X-RateLimit-Reset`) on every successful response so the engine can
 * pre-emptively back off before hitting a hard 429.
 */
export interface SkywalkResponse<T> {
  data: T;
  rateLimit: {
    remaining?: number;
    resetAt?: Date;
  };
}

export interface SkywalkClientOptions {
  /** AbortSignal to thread through every request (the engine's wall-clock budget). */
  signal?: AbortSignal;
  /** If false, do not auto-retry on 429 — throw `RateLimitError` immediately. */
  retryOn429?: boolean;
}

export class SkywalkClient {
  private env = readSkywalkEnv();
  private options: SkywalkClientOptions;

  constructor(options: SkywalkClientOptions = {}) {
    this.options = { retryOn429: true, ...options };
  }

  async get<T>(
    path: string,
    query: Record<string, string | number | undefined> = {}
  ): Promise<SkywalkResponse<T>> {
    const url = this.buildUrl(path, query);
    return this.requestWithRetry<T>(url, { method: "GET" });
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private buildUrl(path: string, query: Record<string, string | number | undefined>): string {
    const url = new URL(path.startsWith("/") ? path : `/${path}`, this.env.baseUrl);
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
    return url.toString();
  }

  private async requestWithRetry<T>(url: string, init: RequestInit): Promise<SkywalkResponse<T>> {
    const maxAttempts = this.env.maxRetries + 1;
    let attempt = 0;
    let lastError: unknown;

    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        return await this.requestOnce<T>(url, init);
      } catch (err) {
        lastError = err;

        if (err instanceof FatalSkywalkError) throw err;

        // The engine's wall-clock budget aborted us — propagate immediately.
        if (this.options.signal?.aborted) throw err;

        if (err instanceof RateLimitError) {
          if (!this.options.retryOn429) throw err;
          const sleep = Math.min(err.retryAfterMs, 30_000);
          await this.delay(sleep);
          continue;
        }

        // Network / 5xx → exponential backoff with full jitter.
        if (attempt >= maxAttempts) break;
        const baseMs = 250 * Math.pow(2, attempt - 1);   // 250, 500, 1000, 2000…
        const jitter = Math.random() * baseMs;
        const sleep = Math.min(15_000, Math.floor(baseMs + jitter));
        await this.delay(sleep);
      }
    }

    if (lastError instanceof Error) throw lastError;
    throw new Error(`Skywalk request failed after ${maxAttempts} attempts: ${String(lastError)}`);
  }

  private async requestOnce<T>(url: string, init: RequestInit): Promise<SkywalkResponse<T>> {
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), this.env.timeoutMs);

    // Compose with the caller's wall-clock signal (if any).
    const upstream = this.options.signal;
    const onUpstreamAbort = () => ac.abort();
    upstream?.addEventListener("abort", onUpstreamAbort, { once: true });

    try {
      const headers = new Headers(init.headers);
      headers.set(this.env.authHeader, `${this.env.authScheme}${this.env.apiKey}`);
      headers.set("Accept", "application/json");
      headers.set("User-Agent", this.env.userAgent);

      const res = await fetch(url, { ...init, headers, signal: ac.signal });

      const rateLimit = parseRateLimit(res.headers);

      if (res.status === 429) {
        const retryAfterMs = parseRetryAfterMs(res.headers) ?? rateLimit.retryAfterMs ?? 5_000;
        // drain body so the connection can be reused
        await res.text().catch(() => undefined);
        throw new RateLimitError(retryAfterMs);
      }

      if (res.status >= 500) {
        const body = await res.text().catch(() => "");
        throw new Error(`Skywalk ${res.status}: ${truncate(body, 256)}`);
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new FatalSkywalkError(
          `Skywalk ${res.status}: ${truncate(body, 256)}`,
          res.status
        );
      }

      const data = (await res.json()) as T;
      return { data, rateLimit: { remaining: rateLimit.remaining, resetAt: rateLimit.resetAt } };
    } finally {
      clearTimeout(timeout);
      upstream?.removeEventListener("abort", onUpstreamAbort);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      const onAbort = () => {
        clearTimeout(t);
        reject(new Error("Aborted during backoff sleep"));
      };
      this.options.signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
}

// ----------------------------------------------------------------------------
// Header parsing
// ----------------------------------------------------------------------------

function parseRetryAfterMs(headers: Headers): number | null {
  const raw = headers.get("retry-after");
  if (!raw) return null;
  const asNum = Number(raw);
  if (Number.isFinite(asNum)) return Math.max(0, Math.floor(asNum * 1000));
  const asDate = Date.parse(raw);
  if (Number.isFinite(asDate)) return Math.max(0, asDate - Date.now());
  return null;
}

function parseRateLimit(headers: Headers): {
  remaining?: number;
  resetAt?: Date;
  retryAfterMs?: number;
} {
  const remaining =
    intHeader(headers, "x-ratelimit-remaining") ??
    intHeader(headers, "ratelimit-remaining");
  const resetEpoch =
    intHeader(headers, "x-ratelimit-reset") ?? intHeader(headers, "ratelimit-reset");
  // `*-reset` is sometimes seconds-since-epoch, sometimes seconds-from-now.
  // We treat values < 10^10 (anything before year 2286) as epoch; tiny values
  // (< 86400) as a relative duration.
  let resetAt: Date | undefined;
  if (resetEpoch != null) {
    if (resetEpoch < 86_400) {
      resetAt = new Date(Date.now() + resetEpoch * 1000);
    } else {
      resetAt = new Date(resetEpoch * 1000);
    }
  }
  const retryAfterMs = parseRetryAfterMs(headers) ?? undefined;
  return { remaining, resetAt, retryAfterMs };
}

function intHeader(headers: Headers, name: string): number | undefined {
  const v = headers.get(name);
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + "…";
}
