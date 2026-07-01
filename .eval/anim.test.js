import { describe, it, expect } from "vitest";
import { layout } from "./layout.js";
import { irA, irB } from "./fixtures.js";
import { Animator } from "./anim.js";
import { isNode } from "./scene.js";
// Stub metrics — the TextMetrics port means these tests need no DOM/canvas.
const metrics = {
    measure: (t, sz) => ({ width: t.length * sz * 0.55, ascent: sz * 0.8, descent: sz * 0.2 }),
};
const A = () => layout(irA, metrics);
const B = () => layout(irB, metrics);
const lblX = (s, nodeId, text) => {
    let x = NaN;
    (function w(n) {
        if (n.id === nodeId)
            for (const c of n.children)
                if (!isNode(c) && c.kind === "lbl" && c.text === text)
                    x = c.anchor.x;
        for (const c of n.children)
            if (isNode(c))
                w(c);
    })(s.root);
    return x;
};
describe("Animator.diff", () => {
    it("classifies enter/update/exit by stable id", () => {
        const diff = new Animator(A()).diff(A(), B());
        expect(diff.filter((t) => t.kind === "exit").map((t) => t.node.id)).toEqual(["c/subj/m1"]);
        expect(diff.filter((t) => t.kind === "enter")).toEqual([]);
    });
});
describe("Animator tween", () => {
    it("first sample settles immediately with no baseline", () => {
        expect(new Animator(A()).sample().settled).toBe(true);
    });
    it("morphs update geometry A->B and fades the exit on the same clock", () => {
        let t = 0;
        const anim = new Animator(A(), { now: () => t }, 600);
        anim.sample(); // establish baseline A
        anim.setTarget(B());
        const xA = lblX(A(), "c/verb", "barked");
        const xB = lblX(B(), "c/verb", "barked");
        expect(xA).not.toBeCloseTo(xB, 0); // the rail actually reflows
        t = 0;
        const s0 = anim.sample();
        t = 300;
        const sMid = anim.sample();
        t = 600;
        const s1 = anim.sample();
        // geometry sweeps from A to B, midpoint strictly between
        expect(lblX(s0.frame.scene, "c/verb", "barked")).toBeCloseTo(xA, 1);
        expect(lblX(s1.frame.scene, "c/verb", "barked")).toBeCloseTo(xB, 1);
        const xm = lblX(sMid.frame.scene, "c/verb", "barked");
        expect(Math.min(xA, xB)).toBeLessThan(xm);
        expect(xm).toBeLessThan(Math.max(xA, xB));
        // exit node presence fades 1 -> 0.5 -> 0 (easeInOutCubic is 0.5 at the midpoint)
        expect(s0.frame.presence.get("c/subj/m1")).toBeCloseTo(1, 5);
        expect(sMid.frame.presence.get("c/subj/m1")).toBeCloseTo(0.5, 5);
        expect(s1.frame.presence.get("c/subj/m1")).toBeCloseTo(0, 5);
        expect(s1.settled).toBe(true);
    });
});
