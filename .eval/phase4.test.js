import { describe, it, expect } from "vitest";
import { layout } from "./layout.js";
import { irCompound, irSubclause } from "./fixtures.js";
import { defaultTheme, blueprintTheme } from "./theme.js";
import { isNode } from "./scene.js";
const metrics = {
    measure: (t, sz) => ({ width: t.length * sz * 0.55, ascent: sz * 0.8, descent: sz * 0.2 }),
};
const ids = (s) => {
    const out = [];
    (function w(n) {
        out.push(n.id);
        for (const c of n.children)
            if (isNode(c))
                w(c);
    })(s.root);
    return out;
};
const node = (s, id) => {
    let r;
    (function w(n) {
        if (n.id === id)
            r = n;
        for (const c of n.children)
            if (isNode(c))
                w(c);
    })(s.root);
    if (!r)
        throw new Error(`node ${id} not found`);
    return r;
};
const segs = (s, role) => {
    const out = [];
    (function w(n) {
        for (const c of n.children) {
            if (!isNode(c) && c.kind === "seg" && c.role === role)
                out.push(c);
            if (isNode(c))
                w(c);
        }
    })(s.root);
    return out;
};
const labels = (s) => {
    const out = [];
    (function w(n) {
        for (const c of n.children) {
            if (!isNode(c) && c.kind === "lbl")
                out.push(c.text);
            if (isNode(c))
                w(c);
        }
    })(s.root);
    return out;
};
describe("compound subject (fork)", () => {
    const s = layout(irCompound, metrics);
    it("wraps branches in a compound node with per-branch ids", () => {
        expect(node(s, "c/subj").role).toBe("compound");
        expect(ids(s)).toEqual(expect.arrayContaining(["c/subj", "c/subj/b0", "c/subj/b1", "c/obj"]));
    });
    it("draws one fork per branch, all meeting a single apex", () => {
        const f = segs(s, "fork");
        expect(f).toHaveLength(2);
        expect(f[0].b).toEqual(f[1].b); // shared apex point
    });
    it("labels the conjunction", () => {
        expect(labels(s)).toContain("and");
    });
    it("keeps the compound clear of the verb (no overlap)", () => {
        expect(node(s, "c/subj").bounds.right).toBeLessThanOrEqual(node(s, "c/verb").bounds.left);
    });
});
describe("subordinate clause (nesting)", () => {
    const s = layout(irSubclause, metrics);
    it("nests a full clause under the verb with derived ids", () => {
        expect(ids(s)).toEqual(expect.arrayContaining(["c/verb/m0", "c/verb/m0/c", "c/verb/m0/c/subj", "c/verb/m0/c/verb"]));
        expect(node(s, "c/verb/m0").role).toBe("subclause");
    });
    it("connects with a dotted connector and labels it", () => {
        expect(segs(s, "connector.dotted").length).toBeGreaterThanOrEqual(1);
        expect(labels(s)).toContain("because");
    });
});
describe("theme split (role -> appearance, geometry untouched)", () => {
    it("two themes differ in appearance for the same role", () => {
        expect(defaultTheme.stroke("baseline").color).not.toBe(blueprintTheme.stroke("baseline").color);
        expect(defaultTheme.font("word").family).not.toBe(blueprintTheme.font("word").family);
    });
    it("layout is independent of theme (it takes no theme)", () => {
        // Same IR + metrics -> identical geometry regardless of how it will be themed.
        const a = layout(irCompound, metrics);
        const b = layout(irCompound, metrics);
        expect(a.bounds).toEqual(b.bounds);
    });
});
