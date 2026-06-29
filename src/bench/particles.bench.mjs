// Particle-sim ceiling benchmark (node-runnable: `npm run bench`).
//
// Measures the CPU cost of the particle UPDATE step that CanvasExecutor.runParticles uses,
// independent of any renderer. This is a LOWER BOUND on the Canvas2D wall: the per-frame
// raster cost (arc + fill, additive compositing) is dominant and only measurable in a browser.
// The number here answers "how many particles can we even *simulate* within a frame budget" —
// the GPU-justification floor for Phase 7.

const FRAME_60 = 1000 / 60; // 16.67 ms
const FRAME_30 = 1000 / 30; // 33.33 ms

function makeParticles(n) {
  const ps = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ps[i] = { x: 0, y: 0, vx: Math.cos(a) * 100, vy: Math.sin(a) * 100, life: 1000, age: 0, r: 2 };
  }
  return ps;
}

// Mirrors the inner loop of CanvasExecutor.runParticles (sim only, no draw).
function update(ps, dt, grav) {
  const dts = dt / 1000;
  for (const p of ps) {
    p.age += dt;
    p.vy += grav * dts;
    p.x += p.vx * dts;
    p.y += p.vy * dts;
  }
}

function msPerFrame(n, iters = 400) {
  const ps = makeParticles(n);
  for (let i = 0; i < 50; i++) update(ps, 16, 300); // warm up
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) update(ps, 16, 300);
  return (performance.now() - t0) / iters;
}

const sizes = [1_000, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];
console.log("particles   ms/update   vs 60fps budget (16.67ms)");
let ceil60 = 0;
let ceil30 = 0;
for (const n of sizes) {
  const ms = msPerFrame(n);
  if (ms <= FRAME_60) ceil60 = n;
  if (ms <= FRAME_30) ceil30 = n;
  const pct = ((ms / FRAME_60) * 100).toFixed(0);
  console.log(`${String(n).padStart(9)}   ${ms.toFixed(3).padStart(8)}   ${pct.padStart(4)}%`);
}
console.log(`\nsim ceiling @60fps: ~${ceil60.toLocaleString()} particles/frame (update only)`);
console.log(`sim ceiling @30fps: ~${ceil30.toLocaleString()} particles/frame (update only)`);
console.log("NOTE: lower bound — Canvas2D raster (arc+fill, 'lighter' compositing) is the");
console.log("dominant real cost and caps far lower; measure it in-browser. This is the GPU floor.");
