import { describe, it, expect } from "vitest";
import { layout, type TextMetrics } from "./layout.js";
import { irA } from "./fixtures.js";
import { isNode, type Scene, type SceneNode } from "./scene.js";
import type { Clause, Word, Modifier } from "./ir.js";
import { defaultLayoutStyle } from "./theme.js";

const metrics: TextMetrics = {
  measure: (t, sz) => ({ width: t.length * sz * 0.55, ascent: sz * 0.8, descent: sz * 0.2 }),
};
const L = (ir: Clause): Scene => layout(ir, metrics);
const W = (text: string): Word => ({ text });

const ids = (s: Scene): string[] => {
  const out: string[] = [];
  (function w(n: SceneNode): void {
    out.push(n.id);
    for (const c of n.children) if (isNode(c)) w(c);
  })(s.root);
  return out;
};
const node = (s: Scene, id: string): SceneNode => {
  let r: SceneNode | undefined;
  (function w(n: SceneNode): void {
    if (n.id === id) r = n;
    for (const c of n.children) if (isNode(c)) w(c);
  })(s.root);
  if (!r) throw new Error(`node ${id} not found`);
  return r;
};
const railEdge = (s: Scene, id: string, side: "a" | "b"): number => {
  for (const c of node(s, id).children)
    if (!isNode(c) && c.kind === "seg" && c.role === "baseline") return c[side].x;
  throw new Error(`no baseline rail in ${id}`);
};
const railGap = (s: Scene): number => railEdge(s, "c/verb", "a") - railEdge(s, "c/subj", "b");
const hasRole = (s: Scene, role: string): boolean => {
  let found = false;
  (function w(n: SceneNode): void {
    for (const c of n.children) {
      if (!isNode(c) && c.kind === "seg" && c.role === role) found = true;
      if (isNode(c)) w(c);
    }
  })(s.root);
  return found;
};

const intransitive = (subjMods: Modifier[], verb: string): Clause => ({
  subject: { head: W("dog"), modifiers: subjMods },
  verb: { head: W(verb), modifiers: [] },
  complement: null,
});

describe("layout ids", () => {
  it("regenerates the stable structural id set (morph-compatible)", () => {
    expect(ids(L(irA))).toEqual(["c", "c/subj", "c/subj/m0", "c/subj/m1", "c/verb", "c/verb/m0"]);
  });
});

describe("non-overlap rule", () => {
  it("keeps at least the divider gap", () => {
    expect(railGap(L(irA))).toBeGreaterThanOrEqual(defaultLayoutStyle.dividerGap);
  });

  it("pushes the neighbor when a below-cluster is heavy (PP under subject)", () => {
    const plain = intransitive([{ kind: "word", value: W("the") }], "slept");
    const heavy = intransitive(
      [
        { kind: "word", value: W("the") },
        { kind: "prep", prep: W("in"), object: { head: W("house"), modifiers: [{ kind: "word", value: W("the") }] } },
      ],
      "slept",
    );
    expect(railGap(L(heavy))).toBeGreaterThan(railGap(L(plain)) + 10);
  });

  it("produces no subject/verb cluster bbox overlap", () => {
    const heavy = intransitive(
      [{ kind: "prep", prep: W("in"), object: { head: W("house"), modifiers: [{ kind: "word", value: W("the") }] } }],
      "slept",
    );
    const s = L(heavy);
    expect(node(s, "c/subj").bounds.right).toBeLessThanOrEqual(node(s, "c/verb").bounds.left);
  });
});

describe("complements", () => {
  it("transitive yields a half-divider + object node", () => {
    const trans: Clause = {
      subject: { head: W("dogs"), modifiers: [] },
      verb: { head: W("chase"), modifiers: [] },
      complement: { kind: "directObject", value: { head: W("cats"), modifiers: [] } },
    };
    const s = L(trans);
    expect(hasRole(s, "divider.half")).toBe(true);
    expect(ids(s)).toContain("c/obj");
  });

  it("predicate adjective yields a lean divider", () => {
    const pa: Clause = {
      subject: { head: W("sky"), modifiers: [] },
      verb: { head: W("is"), modifiers: [] },
      complement: { kind: "predicateAdj", value: W("blue") },
    };
    expect(hasRole(L(pa), "divider.lean")).toBe(true);
    expect(ids(L(pa))).toContain("c/pa");
  });

  it("compound predicate adjective forks (tiny and loud)", () => {
    const c: Clause = {
      subject: { head: W("dog"), modifiers: [] },
      verb: { head: W("is"), modifiers: [] },
      complement: { kind: "predicateAdj", value: { items: [W("tiny"), W("loud")], conjunction: W("and") } },
    };
    expect(ids(L(c))).toEqual(expect.arrayContaining(["c/pa", "c/pa/b0", "c/pa/b1"]));
  });
});

describe("compound fork direction", () => {
  const forkSegsIn = (s: Scene, id: string) => {
    const out: Array<{ a: { x: number }; b: { x: number } }> = [];
    (function w(n: SceneNode): void {
      for (const c of n.children) {
        if (!isNode(c) && c.kind === "seg" && c.role === "fork") out.push(c);
        if (isNode(c)) w(c);
      }
    })(node(s, id));
    return out;
  };

  it("subject forks toward the divider (apex on the right)", () => {
    const c: Clause = {
      subject: { items: [{ head: W("dogs"), modifiers: [] }, { head: W("cats"), modifiers: [] }], conjunction: W("and") },
      verb: { head: W("run"), modifiers: [] },
      complement: null,
    };
    const f = forkSegsIn(L(c), "c/subj");
    expect(f).toHaveLength(2);
    expect(f.every((seg) => seg.a.x < seg.b.x)).toBe(true); // connect-left -> apex-right
    expect(f[0]!.b).toEqual(f[1]!.b); // shared apex
  });

  it("object forks toward the verb (apex on the left)", () => {
    const c: Clause = {
      subject: { head: W("dog"), modifiers: [] },
      verb: { head: W("chased"), modifiers: [] },
      complement: { kind: "directObject", value: { items: [{ head: W("cats"), modifiers: [] }, { head: W("mice"), modifiers: [] }], conjunction: W("and") } },
    };
    const f = forkSegsIn(L(c), "c/obj");
    expect(f).toHaveLength(2);
    expect(f.every((seg) => seg.a.x > seg.b.x)).toBe(true); // connect-right -> apex-left
    expect(f[0]!.b).toEqual(f[1]!.b); // shared apex
  });
});
