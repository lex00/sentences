// Per-rule toggle persistence for destink.html. Kept out of src/lint (the shared wave-1 layer)
// because this is an app-layer concern, the same split as src/game/progress.ts.
//
// `StorageLike` is the two methods we actually use off `Storage`, taken as a parameter rather than
// reaching for the `localStorage` global directly — that's what lets a test hand in a stub instead
// of needing a browser. The app passes `window.localStorage`.

import type { RuleToggles } from "../lint/registry.js";

export type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void };

export const TOGGLES_KEY = "sentences.destink.toggles.v1";

// Absent or corrupt storage reads back as "everything on" (the empty toggle set) — the same
// fail-open default registry.ts's enabledRules() applies to a rule id it doesn't recognize.
export function loadToggles(storage: StorageLike): RuleToggles {
  try {
    const raw = storage.getItem(TOGGLES_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "boolean") out[k] = v;
    }
    return out;
  } catch {
    return {}; // private mode / disabled storage / corrupt JSON
  }
}

export function saveToggles(storage: StorageLike, toggles: RuleToggles): void {
  try {
    storage.setItem(TOGGLES_KEY, JSON.stringify(toggles));
  } catch {
    // ignore — the UI still works for this session, it just won't remember next time
  }
}
