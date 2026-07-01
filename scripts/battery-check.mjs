// Batch quality check: for each {sentence, ptb} in battery.json, lower -> layout -> collision
// sweep, and detect dropped content words. Run against the emitted TS in ./.eval.
// Usage: node scripts/battery-check.mjs <battery.json>
import { readFileSync } from "node:fs";
import { lowerSentence } from "../.eval/lower.js";
import { layout } from "../.eval/layout.js";
import { collisions } from "../.eval/collisions.js";
import { loadFontMetrics } from "../.eval/metrics-font.js";
import { defaultLayoutStyle as S } from "../.eval/theme.js";
import { isNode } from "../.eval/scene.js";

const m = loadFontMetrics("node_modules/@fontsource/tinos/files/tinos-latin-400-normal.woff");
const battery = JSON.parse(readFileSync(process.argv[2] ?? "parser-export/battery.json", "utf8"));

const STOP = new Set(["the", "a", "an", "to", "of", "and", "or", "in", "on", "at", "by", "for", "with", "that", "'s", "n't", "wo", "ca"]);
const norm = (w) => w.toLowerCase().replace(/[.,!?;:"()]/g, "");
let ok = 0, errs = 0, dropped = 0, collided = 0;
const problems = [];

for (const { sentence, ptb, error } of battery) {
  if (!ptb) { errs++; problems.push(`✗ PARSE  ${sentence}  (${error})`); continue; }
  let scene;
  try { scene = layout(lowerSentence(ptb), m, S); }
  catch (e) { errs++; problems.push(`✗ LOWER  ${sentence}  (${String(e.message).slice(0, 60)})`); continue; }

  const labels = [];
  (function w(n) { for (const c of n.children) { if (isNode(c)) w(c); else if (c.kind === "lbl") labels.push(c.text); } })(scene.root);
  const joined = labels.map(norm).join(" ");
  const words = sentence.replace(/([.,!?;:"()])/g, " $1 ").split(/\s+/).map(norm).filter(Boolean);
  const missing = words.filter((word) => !STOP.has(word) && word.length > 1 && !joined.includes(word));

  const cols = collisions(scene, m, S.em);
  const flags = [];
  if (missing.length) { dropped++; flags.push(`DROPPED[${missing.join(",")}]`); }
  if (cols.length) { collided++; flags.push(`COLLIDE[${cols.map((c) => `${c.a}×${c.b}`).join(",")}]`); }
  if (flags.length) problems.push(`⚠ ${flags.join(" ")}  ${sentence}`);
  else ok++;
}

console.log(problems.join("\n"));
console.log(`\n${battery.length} sentences: ${ok} clean · ${errs} parse/lower error · ${dropped} dropped-words · ${collided} collisions`);
