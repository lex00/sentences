import { describe, it, expect } from "vitest";
import { spawnParticles, updateParticles, particleAlpha } from "./particles.js";
const E = { count: 20, lifetime: 1000, speed: 100, spread: 1, gravity: 300 };
const anchor = { x: 50, y: 60 };
describe("shared particle sim", () => {
    it("spawns count particles at the anchor", () => {
        const ps = spawnParticles(E, anchor, "fx1");
        expect(ps).toHaveLength(20);
        expect(ps.every((p) => p.x === 50 && p.y === 60 && p.age === 0)).toBe(true);
    });
    it("is deterministic for a given seed key (seeded RNG, not Math.random)", () => {
        const a = spawnParticles(E, anchor, "same");
        const b = spawnParticles(E, anchor, "same");
        const c = spawnParticles(E, anchor, "different");
        expect(a).toEqual(b);
        expect(a).not.toEqual(c);
    });
    it("advances position and applies gravity", () => {
        const ps = spawnParticles(E, anchor, "fx2");
        const vy0 = ps.map((p) => p.vy);
        updateParticles(ps, 16, E.gravity);
        expect(ps.every((p, i) => p.vy > vy0[i])).toBe(true); // gravity pulls vy down (screen +y)
        expect(ps.some((p) => p.x !== 50 || p.y !== 60)).toBe(true); // moved
    });
    it("reports death only once every particle has expired", () => {
        const ps = spawnParticles(E, anchor, "fx3");
        expect(updateParticles(ps, 500, 0)).toBe(false); // half life
        expect(updateParticles(ps, 600, 0)).toBe(true); // past lifetime
    });
    it("alpha fades from 1 to 0 across the lifetime", () => {
        const ps = spawnParticles({ ...E, count: 1 }, anchor, "fx4");
        const p = ps[0];
        expect(particleAlpha(p)).toBeCloseTo(1, 5);
        updateParticles(ps, 500, 0);
        expect(particleAlpha(p)).toBeCloseTo(0.5, 5);
        updateParticles(ps, 500, 0);
        expect(particleAlpha(p)).toBeCloseTo(0, 5);
    });
});
