/**
 * Cockpit mode ↔ API `view` slice.
 *
 * **Roadmap**
 * - **Now:** PM-centric presets (top targets, high-value under-managed, small buildings, portfolio-style list).
 * - **Later:** `flipper_mode` — distinct filters, scoring, and possibly investor-specific columns;
 *   keep `CockpitMode["flipper_mode"]` and `cockpitModeToViewSlice` branches so we can wire UI + URL
 *   without a breaking type change.
 */
import type { CockpitMode, ViewSlice } from "./types";

/** Maps mode → API view slice (`flipper_mode` / `portfolio_view` still use `top` until custom queries exist). */
export function cockpitModeToViewSlice(mode: CockpitMode): ViewSlice {
  switch (mode) {
    case "top_targets":
    case "flipper_mode":
    case "portfolio_view":
      return "top";
    case "high_value_pm":
      return "high_value";
    case "small_buildings":
      return "honorable_mentions";
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

/** Best-effort inverse from URL/view (cannot distinguish flipper vs portfolio vs generic top). */
export function viewSliceToCockpitMode(view: ViewSlice): CockpitMode {
  switch (view) {
    case "high_value":
      return "high_value_pm";
    case "honorable_mentions":
      return "small_buildings";
    case "top":
      return "top_targets";
  }
}
