import { describe, it, expect } from "vitest";
import { describeAt, describeAll } from "./inspect.js";
import { layout } from "./layout.js";
import { lower } from "./lower.js";
import { isNode } from "./scene.js";
const metrics = { measure: (t, sz) => ({ width: t.length * sz * 0.55, ascent: sz * 0.8, descent: sz * 0.2 }) };
const SZ = 16;
// find the anchor of a given word label, and the midpoint of the first segment of a given role
// a point on the label's baseline, ~40% along its width — inside the box even when rotated
const labelAnchor = (s, text) => {
    const holder = { hit: null };
    (function w(n) {
        for (const c of n.children) {
            if (isNode(c))
                w(c);
            else if (c.kind === "lbl" && c.text === text && !holder.hit) {
                const wpx = metrics.measure(text, SZ).width * 0.4;
                holder.hit = { x: c.anchor.x + wpx * Math.cos(c.angle), y: c.anchor.y + wpx * Math.sin(c.angle) };
            }
        }
    })(s.root);
    return holder.hit;
};
const segMid = (s, role) => {
    let hit = null;
    (function w(n) {
        for (const c of n.children) {
            if (isNode(c))
                w(c);
            else if (c.kind === "seg" && c.role === role && !hit)
                hit = { x: (c.a.x + c.b.x) / 2, y: (c.a.y + c.b.y) / 2 };
        }
    })(s.root);
    return hit;
};
describe("describeAt", () => {
    const scene = layout(lower("(S (NP (DT The) (JJ small) (NN dog)) (VP (VBD chased) (NP (DT the) (NN ball))))"), metrics);
    it("names the subject head word", () => {
        const info = describeAt(scene, labelAnchor(scene, "dog"), metrics, SZ);
        expect(info?.kind).toBe("word");
        expect(info?.title).toContain("dog");
        expect(info?.title).toContain("Subject");
    });
    it("names the verb", () => {
        const info = describeAt(scene, labelAnchor(scene, "chased"), metrics, SZ);
        expect(info?.title).toContain("chased");
        expect(info?.title).toContain("Verb");
    });
    it("names the direct object", () => {
        const info = describeAt(scene, labelAnchor(scene, "ball"), metrics, SZ);
        expect(info?.title).toContain("Direct object");
    });
    it("labels a modifier word", () => {
        const info = describeAt(scene, labelAnchor(scene, "small"), metrics, SZ);
        expect(info?.title).toContain("Modifier");
    });
    it("identifies the full subject–predicate divider", () => {
        const info = describeAt(scene, segMid(scene, "divider.full"), metrics, SZ);
        expect(info?.kind).toBe("line");
        expect(info?.title).toContain("Subject | Predicate");
    });
    it("returns null in empty space", () => {
        expect(describeAt(scene, { x: -9999, y: -9999 }, metrics, SZ)).toBeNull();
    });
});
describe("describeAll", () => {
    const scene = layout(lower("(S (NP (DT The) (JJ small) (NN dog)) (VP (VBD chased) (NP (DT the) (NN ball))))"), metrics);
    const els = describeAll(scene, metrics, SZ);
    it("enumerates every word as a slot with role, text, anchor, and owning node id", () => {
        const words = els.filter((e) => e.kind === "word");
        const byText = new Map(words.map((w) => [w.text, w]));
        for (const t of ["dog", "chased", "ball", "small", "the"])
            expect(byText.has(t)).toBe(true);
        const dog = byText.get("dog");
        expect(dog.roleKey).toBe("subject");
        expect(dog.role).toBe("Subject");
        expect(dog.nodeId).toBeTruthy();
        expect(dog.bbox.right).toBeGreaterThan(dog.bbox.left);
        expect(byText.get("ball").roleKey).toBe("object");
        expect(byText.get("chased").roleKey).toBe("verb");
        expect(byText.get("small").roleKey).toBe("modifier");
    });
    it("the roles chain distinguishes a direct object from a preposition's object", () => {
        const isDO = (ptb, word) => {
            const els = describeAll(layout(lower(ptb), metrics), metrics, SZ);
            const w = els.find((e) => e.kind === "word" && e.text === word);
            return w?.roleKey === "object" && !w.roles.includes("pp");
        };
        // "ball" is a real direct object
        expect(isDO("(S (NP (DT The) (NN dog)) (VP (VBD chased) (NP (DT the) (NN ball))))", "ball")).toBe(true);
        // "house" is the object OF a preposition, not a direct object
        expect(isDO("(S (NP (DT The) (NN dog)) (VP (VBD slept) (PP (IN in) (NP (DT the) (NN house)))))", "house")).toBe(false);
    });
    it("enumerates lines including the full divider, with endpoints", () => {
        const lines = els.filter((e) => e.kind === "line");
        const full = lines.find((l) => l.roleKey === "divider.full");
        expect(full).toBeTruthy();
        expect(full.a).toBeTruthy();
        expect(full.b).toBeTruthy();
    });
    it("a fill-your-own-words mode can read one slot per input word", () => {
        // 5 content words in "The small dog chased the ball": the two articles + small + dog + chased + ball = 6 labels
        const words = els.filter((e) => e.kind === "word");
        expect(words.length).toBe(6);
        expect(words.every((w) => typeof w.text === "string" && w.role.length > 0)).toBe(true);
    });
});
