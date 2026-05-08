/**
 * Tiny structured logger.
 *
 * Vercel Logs are line-oriented; JSON lines are query-friendly via the
 * Logs UI's filter bar. This helper makes events look like:
 *
 *   { "ts": "2026-05-07T23:30:01.123Z", "level": "info",
 *     "evt": "appfolio.push", "claimed": 12, "pushed": 9, ... }
 *
 * Used sparingly inside cron handlers / engines. Existing console.log()
 * calls keep working; this just gives us a queryable shape for the bits
 * we care about most (ingest ticks, push results, webhook acks).
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogFields {
  /** Short event identifier, e.g. "skywalk.ingest" or "appfolio.push". */
  evt: string;
  [key: string]: unknown;
}

function emit(level: LogLevel, fields: LogFields): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    ...fields,
  };
  // Use the appropriate stream so Vercel level filters Just Work.
  const out =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.log;
  try {
    out(JSON.stringify(line));
  } catch {
    out(`{"ts":"${new Date().toISOString()}","level":"${level}","evt":"${fields.evt}","note":"serialize-failed"}`);
  }
}

export const log = {
  debug: (fields: LogFields) => emit("debug", fields),
  info: (fields: LogFields) => emit("info", fields),
  warn: (fields: LogFields) => emit("warn", fields),
  error: (fields: LogFields) => emit("error", fields),
};

/**
 * Convenience: stamp a `started_ms` and return a finalizer that emits
 * the event with `duration_ms` on completion. Useful inside route handlers.
 *
 *   const done = startTimer("appfolio.push.tick", { source: "cron" });
 *   ...do work...
 *   done({ pushed, skipped, queued });
 */
export function startTimer(evt: string, init: Record<string, unknown> = {}) {
  const t0 = Date.now();
  return function done(extra: Record<string, unknown> = {}, level: LogLevel = "info"): void {
    emit(level, { evt, duration_ms: Date.now() - t0, ...init, ...extra });
  };
}
