import { describe, it, expect } from "vitest";
import { loadToggles, saveToggles, TOGGLES_KEY, type StorageLike } from "./toggles.js";

// A minimal in-memory stand-in for window.localStorage, so persistence is testable with no browser.
function stubStorage(seed: Record<string, string> = {}): StorageLike {
  const store = { ...seed };
  return {
    getItem: (k) => (k in store ? store[k]! : null),
    setItem: (k, v) => { store[k] = v; },
  };
}

describe("loadToggles", () => {
  it("is empty (everything on) when storage has never been written", () => {
    expect(loadToggles(stubStorage())).toEqual({});
  });

  it("round-trips through saveToggles", () => {
    const storage = stubStorage();
    saveToggles(storage, { "lex/delve-family": false, "syntactic/tricolon": true });
    expect(loadToggles(storage)).toEqual({ "lex/delve-family": false, "syntactic/tricolon": true });
  });

  it("ignores corrupt JSON and falls back to empty", () => {
    expect(loadToggles(stubStorage({ [TOGGLES_KEY]: "{not json" }))).toEqual({});
  });

  it("ignores a non-object value", () => {
    expect(loadToggles(stubStorage({ [TOGGLES_KEY]: "[1,2,3]" }))).toEqual({});
    expect(loadToggles(stubStorage({ [TOGGLES_KEY]: "42" }))).toEqual({});
  });

  it("drops non-boolean entries but keeps the boolean ones", () => {
    const storage = stubStorage({ [TOGGLES_KEY]: JSON.stringify({ a: false, b: "nope", c: 1, d: true }) });
    expect(loadToggles(storage)).toEqual({ a: false, d: true });
  });

  it("survives a storage that throws (private-mode style)", () => {
    const angry: StorageLike = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    };
    expect(loadToggles(angry)).toEqual({});
    expect(() => saveToggles(angry, { a: false })).not.toThrow();
  });

  it("saveToggles overwrites a previous save under the same key", () => {
    const storage = stubStorage();
    saveToggles(storage, { a: false });
    saveToggles(storage, { a: true, b: false });
    expect(loadToggles(storage)).toEqual({ a: true, b: false });
  });
});
