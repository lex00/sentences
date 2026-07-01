// Shared particle SIMULATION — CPU-side, used by BOTH the Canvas and WebGPU executors.
//
// Why shared and CPU-side: the Phase 5 bench (npm run bench) showed the sim is effectively
// free (1M particles updated in ~2.24ms). The Canvas2D wall is rasterization, not the math.
// So the WebGPU executor keeps this exact sim and only moves *rasterization* to the GPU —
// a finding-driven refinement of "swappable executors" (the sim turned out portable for free).
// Seeded RNG (deterministic-ready): vary by instance id, not Math.random.
const hashStr = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++)
        h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
};
const mulberry32 = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
export function spawnParticles(e, anchor, seedKey) {
    const rng = mulberry32(hashStr(seedKey));
    return Array.from({ length: e.count }, () => {
        const ang = -Math.PI / 2 + (rng() * 2 - 1) * e.spread;
        const sp = e.speed * (0.5 + rng());
        return { x: anchor.x, y: anchor.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: e.lifetime, age: 0, r: 1 + rng() * 2.5 };
    });
}
// Advance one step. Returns true once every particle has expired (so the caller can free state).
export function updateParticles(ps, dtMs, gravity) {
    const dts = dtMs / 1000;
    for (const p of ps) {
        p.age += dtMs;
        p.vy += gravity * dts;
        p.x += p.vx * dts;
        p.y += p.vy * dts;
    }
    return ps.every((p) => p.age >= p.life);
}
export const particleAlpha = (p) => Math.max(0, 1 - p.age / p.life);
