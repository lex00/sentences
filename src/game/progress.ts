// Shared game progress — an APP-LAYER concern (localStorage, no engine dependency). Each mode
// records results here; the hub reads them. Kept deliberately out of the engine: the engine has no
// game state.

export type ModeKey = "identify" | "build" | "write";
export type Stat = { plays: number; correct: number; best: number };
export type Progress = Record<ModeKey, Stat>;

const KEY = "sentences.progress.v1";
const zero = (): Stat => ({ plays: 0, correct: 0, best: 0 });
const empty = (): Progress => ({ identify: zero(), build: zero(), write: zero() });

export function stats(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    return { ...empty(), ...(JSON.parse(raw) as Partial<Progress>) };
  } catch {
    return empty(); // private mode / disabled storage
  }
}

function write(p: Progress): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

// Record one result. `streak` (optional) updates the mode's best run.
export function record(mode: ModeKey, ok: boolean, streak = 0): void {
  const p = stats();
  const s = p[mode];
  s.plays += 1;
  if (ok) s.correct += 1;
  s.best = Math.max(s.best, streak);
  write(p);
}

export function reset(): void { write(empty()); }

export const totalCorrect = (p: Progress = stats()): number => p.identify.correct + p.build.correct + p.write.correct;
// A light level: one per 5 correct across all modes.
export const level = (p: Progress = stats()): number => Math.floor(totalCorrect(p) / 5) + 1;
