/**
 * AppFolio push policy.
 *
 * Single function: given a thread-day rollup row, decide whether to
 *   PUSH:  send to AppFolio now,
 *   SKIP:  nothing useful to send — close the row out (set
 *          `synced_to_appfolio_at = now()`); only re-evaluated when
 *          content changes (which clears `synced_to_appfolio_at` again),
 *   QUEUE: hold for the next tick (e.g. day still actively settling) —
 *          do NOT close the row; next worker tick will re-evaluate.
 *
 * Retry-after-network-error decisions are made by the engine, not here.
 *
 * Order matters — earlier rules win. Each rule is intentionally simple
 * so the audit trail (`appfolio_push_log.error_message`) reads like a
 * one-line explanation.
 */

import type {
  ThreadDayRollupRow,
  PushDecision,
  PushPolicyOptions,
} from "./types";

const DEFAULTS = {
  /** Minutes since `last_message_at` before we consider the day "settled". */
  minSettleMinutes: 10,
  /** Single-message rollups must clear an action-worthy gate to be pushed. */
  minMessages: 2,
};

/**
 * Decide what to do with a single rollup. Pure function — no I/O.
 */
export function decidePush(
  rollup: ThreadDayRollupRow,
  opts: PushPolicyOptions = {}
): PushDecision {
  // --- Manual override -----------------------------------------------------
  if (opts.force) {
    return { kind: "push", reason: "forced" };
  }

  // --- 1. Already handled --------------------------------------------------
  if (rollup.synced_to_appfolio_at) {
    return { kind: "skip", reason: "already-synced" };
  }

  // --- 2. Defensive: empty rollup -----------------------------------------
  if (rollup.message_count === 0) {
    return { kind: "skip", reason: "empty-rollup" };
  }

  // --- 3. Must link to a contact OR property in Skywalk -------------------
  // If we can't link the note to any record on the AppFolio side, the
  // receiving system has no anchor to attach it to. Operators can re-fetch
  // the conversation via the manual-fetch queue, but auto-pushing into a
  // void is worse than waiting.
  if (!rollup.skywalk_contact_id && !rollup.skywalk_property_id) {
    return { kind: "skip", reason: "orphan-no-contact-or-property" };
  }

  // --- 4. Day still actively settling — debounce --------------------------
  // Don't push 6 times for a thread that's actively being typed in.
  const settleMin = opts.minSettleMinutes ?? DEFAULTS.minSettleMinutes;
  const lastMs = rollup.last_message_at
    ? new Date(rollup.last_message_at).getTime()
    : null;
  const nowMs = (opts.now ?? new Date()).getTime();
  if (lastMs != null && Number.isFinite(lastMs)) {
    const minutesIdle = (nowMs - lastMs) / 60_000;
    if (minutesIdle < settleMin) {
      return {
        kind: "queue",
        reason: `day-still-active:${minutesIdle.toFixed(1)}m<${settleMin}m`,
        delayMs: Math.max(0, (settleMin - minutesIdle) * 60_000),
      };
    }
  }

  // --- 5. Single-message rollups must be action-worthy --------------------
  // A single inbound "got it" with no actions/key-points isn't worth a note.
  // But a single inbound `needs_response` from a brand-new lead IS.
  const minMsgs = opts.minMessages ?? DEFAULTS.minMessages;
  if (rollup.message_count < minMsgs) {
    const hasActions = (rollup.actions ?? []).length > 0;
    const hasKeyPoints = (rollup.key_points ?? []).length > 0;
    const urgent = rollup.status === "needs_response";
    if (!hasActions && !hasKeyPoints && !urgent) {
      return { kind: "skip", reason: "low-signal-single-message" };
    }
  }

  // --- 6. Dormant / resolved with no AF history → no point pushing --------
  // If we never created a note for this conversation and the day's status
  // is dormant or resolved, there's nothing actionable to send. Skip cleanly.
  if (rollup.status === "dormant" || rollup.status === "resolved") {
    if (!rollup.appfolio_note_id) {
      return { kind: "skip", reason: `${rollup.status}-no-prior-note` };
    }
  }

  // --- 7. PUSH -------------------------------------------------------------
  return { kind: "push", reason: "action-worthy" };
}

/**
 * Diagnostic helper: explain a decision in human words for the dashboard.
 */
export function describeDecision(d: PushDecision): string {
  switch (d.kind) {
    case "push":
      return `Push (${d.reason})`;
    case "skip":
      return `Skip (${d.reason})`;
    case "queue":
      return `Queue (${d.reason})`;
  }
}
