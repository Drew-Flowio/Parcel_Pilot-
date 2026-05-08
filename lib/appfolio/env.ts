/**
 * AppFolio outbound env-var contract. Mirrors `lib/skywalk/env.ts`.
 *
 * AppFolio's public REST API is partner-only; many real deployments forward
 * notes through a webhook (Zapier / Make / a thin shim) instead of writing
 * directly to AppFolio. This file abstracts both: configure `baseUrl` +
 * `notePath` and the worker treats the destination as a JSON POST/PATCH
 * endpoint.
 *
 * Required:
 *   APPFOLIO_BASE_URL          e.g. https://api.appfolio.example.com
 *   APPFOLIO_API_KEY           bearer token (or webhook secret)
 *   APPFOLIO_PUSH_SECRET       shared secret on /api/appfolio/* routes
 *
 * Optional:
 *   APPFOLIO_AUTH_HEADER       default "Authorization"
 *   APPFOLIO_AUTH_SCHEME       default "Bearer "
 *   APPFOLIO_TIMEOUT_MS        default 15000
 *   APPFOLIO_MAX_RETRIES       default 4
 *   APPFOLIO_USER_AGENT        default "parcel-pilot-appfolio/1.0"
 *
 *   APPFOLIO_NOTE_PATH         default "/v1/notes"
 *   APPFOLIO_NOTE_BY_ID        default "/v1/notes/{id}"
 *   APPFOLIO_OWNER_PATH        default "/v1/owners"      (manual one-off pushes)
 *   APPFOLIO_OWNER_BY_ID       default "/v1/owners/{id}"
 *
 *   APPFOLIO_DRY_RUN           "1" → never actually call AppFolio. The engine
 *                              still walks the policy + writes the audit log
 *                              (with `status='skipped'`, reason='dry-run').
 *                              Useful in preview deploys.
 */

export interface AppFolioEnv {
  baseUrl: string;
  apiKey: string;
  pushSecret: string;
  authHeader: string;
  authScheme: string;
  timeoutMs: number;
  maxRetries: number;
  userAgent: string;
  dryRun: boolean;
  paths: {
    note: string;
    noteById: string;
    owner: string;
    ownerById: string;
  };
}

/**
 * Read the strict env contract at *call time* (so `next build` works without
 * AppFolio creds). Throws inside route handlers/workers if missing.
 */
export function readAppFolioEnv(): AppFolioEnv {
  const baseUrl = process.env.APPFOLIO_BASE_URL ?? "";
  const apiKey = process.env.APPFOLIO_API_KEY ?? "";
  const pushSecret = process.env.APPFOLIO_PUSH_SECRET ?? "";

  if (!baseUrl) throw new Error("APPFOLIO_BASE_URL is not set");
  if (!apiKey) throw new Error("APPFOLIO_API_KEY is not set");
  if (!pushSecret) throw new Error("APPFOLIO_PUSH_SECRET is not set");

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
    pushSecret,
    authHeader: process.env.APPFOLIO_AUTH_HEADER ?? "Authorization",
    authScheme: process.env.APPFOLIO_AUTH_SCHEME ?? "Bearer ",
    timeoutMs: numEnv("APPFOLIO_TIMEOUT_MS", 15_000),
    maxRetries: numEnv("APPFOLIO_MAX_RETRIES", 4),
    userAgent: process.env.APPFOLIO_USER_AGENT ?? "parcel-pilot-appfolio/1.0",
    dryRun: process.env.APPFOLIO_DRY_RUN === "1",
    paths: {
      note: process.env.APPFOLIO_NOTE_PATH ?? "/v1/notes",
      noteById: process.env.APPFOLIO_NOTE_BY_ID ?? "/v1/notes/{id}",
      owner: process.env.APPFOLIO_OWNER_PATH ?? "/v1/owners",
      ownerById: process.env.APPFOLIO_OWNER_BY_ID ?? "/v1/owners/{id}",
    },
  };
}

/**
 * Lighter contract for the auth middleware — only checks the secret, no
 * network creds required (so /api/appfolio/health can return without
 * APPFOLIO_API_KEY being set).
 */
export function readAppFolioPushSecret(): string {
  const v = process.env.APPFOLIO_PUSH_SECRET ?? "";
  if (!v) throw new Error("APPFOLIO_PUSH_SECRET is not set");
  return v;
}

function numEnv(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
