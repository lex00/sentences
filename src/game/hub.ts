// The play hub — lists the modes and shows shared progress from localStorage. App layer only.

import { stats, level, totalCorrect, reset, type ModeKey } from "./progress.js";

const MODES: { key: ModeKey; href: string; name: string; desc: string }[] = [
  { key: "identify", href: "game.html", name: "Name that part", desc: "A part is highlighted — pick what it is. Easy, normal, or hard (part of speech)." },
  { key: "build", href: "drag.html", name: "Build the diagram", desc: "Drag the words onto the right slots to reconstruct the diagram." },
  { key: "write", href: "free.html", name: "Write to the challenge", desc: "Write a sentence that meets a goal — it's parsed and checked." },
];

function render(): void {
  const p = stats();
  (document.getElementById("level") as HTMLElement).textContent = String(level(p));
  (document.getElementById("total") as HTMLElement).textContent = String(totalCorrect(p));
  const wrap = document.getElementById("modes") as HTMLDivElement;
  wrap.textContent = "";
  for (const m of MODES) {
    const s = p[m.key];
    const stat = s.plays
      ? `${s.correct}/${s.plays} correct${s.best > 1 ? ` · best streak ${s.best}` : ""}`
      : "not played yet";
    const a = document.createElement("a");
    a.className = "mode";
    a.href = m.href;
    a.innerHTML = `<div class="name">${m.name}</div><div class="desc">${m.desc}</div><div class="stat">${stat}</div>`;
    wrap.append(a);
  }
}

(document.getElementById("reset") as HTMLButtonElement).addEventListener("click", () => { reset(); render(); });
render();
