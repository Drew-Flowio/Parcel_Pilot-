/**
 * Skywalk env-var contract. All optional at import-time so `next build` and
 * lints don't require Skywalk creds; the helpers below throw at *call* time
 * if a route actually tries to run a sync without them.
 *
 * Required:
 *   SKYWALK_BASE_URL         e.g. https://api.skywalk.example.com
 *   SKYWALK_API_KEY          bearer token
 *   SKYWALK_SYNC_SECRET      shared secret on the API routes
 *
 * Optional (sensible defaults):
 *   SKYWALK_AUTH_HEADER      default "Authorization"
 *   SKYWALK_AUTH_SCHEME      default "Bearer "
 *   SKYWALK_TIMEOUT_MS       default 15000 per request
 *   SKYWALK_MAX_RETRIES      default 4 (per request, not counting initial)
 *   SKYWALK_USER_AGENT       default "parcel-pilot-skywalk/1.0"
 *
 * Per-resource path overrides (defaults match a typical REST shape and
 * can be tuned without a redeploy by setting the env var):
 *   SKYWALK_MESSAGES_PATH    default "/v1/messages"
 *   SKYWALK_CONTACTS_PATH    default "/v1/contacts"
 *   SKYWALK_PROPERTIES_PATH  default "/v1/properties"
 *   SKYWALK_MESSAGE_BY_ID    default "/v1/messages/{id}"
 *   SKYWALK_CONTACT_BY_ID    default "/v1/contacts/{id}"
 *   SKYWALK_PROPERTY_BY_ID   default "/v1/properties/{id}"
 */

export interface SkywalkEnv {
  baseUrl: string;
  apiKey: string;
  syncSecret: string;
  authHeader: string;
  authScheme: string;
  timeoutMs: number;
  maxRetries: number;
  userAgent: string;
  paths: {
    messages: string;
    contacts: string;
    properties: string;
    messageById: string;
    contactById: string;
    propertyById: string;
  };
}

export function readSkywalkEnv(): SkywalkEnv {
  const baseUrl = process.env.SKYWALK_BASE_URL ?? "";
  const apiKey = process.env.SKYWALK_API_KEY ?? "";
  const syncSecret = process.env.SKYWALK_SYNC_SECRET ?? "";

  if (!baseUrl) throw new Error("SKYWALK_BASE_URL is not set");
  if (!apiKey) throw new Error("SKYWALK_API_KEY is not set");
  if (!syncSecret) throw new Error("SKYWALK_SYNC_SECRET is not set");

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
    syncSecret,
    authHeader: process.env.SKYWALK_AUTH_HEADER ?? "Authorization",
    authScheme: process.env.SKYWALK_AUTH_SCHEME ?? "Bearer ",
    timeoutMs: numEnv("SKYWALK_TIMEOUT_MS", 15_000),
    maxRetries: numEnv("SKYWALK_MAX_RETRIES", 4),
    userAgent: process.env.SKYWALK_USER_AGENT ?? "parcel-pilot-skywalk/1.0",
    paths: {
      messages: process.env.SKYWALK_MESSAGES_PATH ?? "/v1/messages",
      contacts: process.env.SKYWALK_CONTACTS_PATH ?? "/v1/contacts",
      properties: process.env.SKYWALK_PROPERTIES_PATH ?? "/v1/properties",
      messageById: process.env.SKYWALK_MESSAGE_BY_ID ?? "/v1/messages/{id}",
      contactById: process.env.SKYWALK_CONTACT_BY_ID ?? "/v1/contacts/{id}",
      propertyById: process.env.SKYWALK_PROPERTY_BY_ID ?? "/v1/properties/{id}",
    },
  };
}

function numEnv(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
