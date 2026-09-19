// End to end over a real transport: a client speaks JSON-RPC to the server, so the declarations,
// the dispatch and the result envelope are checked as a client actually sees them. tools.test.ts
// covers what the tools mean; this file covers that they are reachable and shaped right.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, callTool, isMainModule, usage, helpRequested } from "./server.js";
import { RULES } from "../lint/registry.js";
import { lintDocument } from "../lint/run.js";
import { LINT_FORMATS } from "./tools.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SLOP = "It's not a bug. It's a feature. Let's delve into the details of this robust framework.";

let client: Client;

beforeAll(async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test", version: "0" });
  await Promise.all([createServer().connect(serverTransport), client.connect(clientTransport)]);
});

afterAll(async () => {
  await client.close();
});

// callTool's declared result is a union (the current content shape plus the legacy `toolResult`
// one), so narrowing happens here once rather than at every call site.
const textOf = (result: unknown): string => {
  const content = (result as { content?: unknown }).content;
  expect(Array.isArray(content)).toBe(true);
  const [block] = content as { type: string; text: string }[];
  expect(block?.type).toBe("text");
  return block!.text;
};

describe("tools/list", () => {
  it("advertises every tool with a description and a schema", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["destink_lint", "destink_reduce", "destink_rules"]);
    for (const tool of tools) {
      expect(tool.description!.length).toBeGreaterThan(40);
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("declares the lint arguments parseLintArgs actually accepts", async () => {
    const { tools } = await client.listTools();
    const lint = tools.find((t) => t.name === "destink_lint")!;
    expect(Object.keys(lint.inputSchema.properties!).sort()).toEqual(["format", "markdown", "path", "strictness", "text"]);
    expect(lint.inputSchema.additionalProperties).toBe(false);
  });

  // The version a client reads in the initialize handshake is a literal in server.ts, so a release
  // that bumps package.json and forgets it ships a server misreporting itself. Same reason as the
  // rule count below: nothing else would catch it.
  it("reports the package's own version in the handshake", () => {
    const pkg = JSON.parse(
      readFileSync(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8"),
    ) as { version: string };
    expect(client.getServerVersion()?.version).toBe(pkg.version);
  });

  // The description tells the calling model how many rules stand behind a clean report; a stale
  // number there is a small lie that nothing else would catch.
  it("counts the rules honestly in the lint description", async () => {
    const { tools } = await client.listTools();
    const lint = tools.find((t) => t.name === "destink_lint")!;
    expect(lint.description).toContain(`${RULES.length} rules`);
  });
});

describe("tools/call destink_lint", () => {
  it("returns the summary for inline text", async () => {
    const result = await client.callTool({ name: "destink_lint", arguments: { text: SLOP } });
    expect(result.isError).toBeFalsy();
    const text = textOf(result);
    expect(text).toContain("destink: 3 findings");
    expect(text).toContain("lex-delve-family");
  });

  it("returns the report verbatim for format json", async () => {
    const result = await client.callTool({ name: "destink_lint", arguments: { text: SLOP, format: "json" } });
    expect(JSON.parse(textOf(result))).toEqual(JSON.parse(JSON.stringify(lintDocument(SLOP))));
  });

  it("reads a real file off disk", async () => {
    // package.json is prose-free, committed, and always present — the point is that `path` reaches
    // the filesystem at all, not what it finds there.
    const result = await client.callTool({ name: "destink_lint", arguments: { path: "package.json" } });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain("destink:");
  });

  // Bad input comes back as content the model can read and correct, not as a protocol error it
  // never sees.
  it("reports a bad argument as readable content, not a thrown error", async () => {
    const result = await client.callTool({ name: "destink_lint", arguments: { file: "README.md" } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("unknown argument(s): file");
  });

  it("reports an unreadable path the same way", async () => {
    const result = await client.callTool({ name: "destink_lint", arguments: { path: "no/such/file.md" } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("could not read no/such/file.md");
  });
});

describe("tools/call destink_rules", () => {
  it("lists every rule when given no arguments", async () => {
    const result = await client.callTool({ name: "destink_rules", arguments: {} });
    const text = textOf(result);
    expect(text).toContain(`${RULES.length} rule(s)`);
    for (const rule of RULES) expect(text).toContain(rule.id);
  });

  it("filters by tier", async () => {
    const result = await client.callTool({ name: "destink_rules", arguments: { tier: "formatting" } });
    const text = textOf(result);
    expect(text).not.toContain("syntactic");
    expect(text).toContain("formatting");
  });

  it("rejects an unknown tier with the list of real ones", async () => {
    const result = await client.callTool({ name: "destink_rules", arguments: { tier: "vibes" } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("lexical, syntactic, formatting, discourse");
  });
});

describe("callTool", () => {
  it("names the tools that exist when asked for one that doesn't", () => {
    const result = callTool("destink_fix", {});
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("destink_lint, destink_reduce, destink_rules");
  });
});

describe("usage", () => {
  it("says what the command is for and how to register it", () => {
    const text = usage();
    expect(text).toContain("not an interactive command");
    expect(text).toContain("destink-mcp");
    expect(text).toContain("mcpServers");
  });

  it("documents both tools and every lint format", () => {
    const text = usage();
    expect(text).toContain("destink_lint");
    expect(text).toContain("destink_rules");
    for (const format of LINT_FORMATS) expect(text).toContain(format);
  });

  it("counts the rules from the registry rather than a number typed once", () => {
    expect(usage()).toContain(`${RULES.length} rules`);
  });

  it("points at the scorer CLI for a one-off lint with no client", () => {
    expect(usage()).toContain("destink-score.mjs [--markdown] <file>");
  });
});

describe("helpRequested", () => {
  it("recognizes both spellings anywhere in the argv", () => {
    expect(helpRequested(["--help"])).toBe(true);
    expect(helpRequested(["-h"])).toBe(true);
    expect(helpRequested(["--verbose", "-h"])).toBe(true);
  });

  it("is false for no arguments, which is how a client launches it", () => {
    expect(helpRequested([])).toBe(false);
    expect(helpRequested(["--markdown"])).toBe(false);
  });
});

describe("isMainModule", () => {
  const MODULE = "file:///pkg/dist-lint/mcp/server.js";
  const real = (p: string) => (p === "/pkg/node_modules/.bin/destink-mcp" ? "/pkg/dist-lint/mcp/server.js" : p);

  it("is true when run directly from a checkout", () => {
    expect(isMainModule("/pkg/dist-lint/mcp/server.js", MODULE, real)).toBe(true);
  });

  // The regression this exists for: npm installs a bin as a symlink, so argv[1] and import.meta.url
  // disagree on the path and a naive comparison leaves the installed server doing nothing at all.
  it("is true through the symlink npm installs the bin as", () => {
    expect(isMainModule("/pkg/node_modules/.bin/destink-mcp", MODULE, real)).toBe(true);
  });

  it("is false when the module is merely imported", () => {
    expect(isMainModule("/pkg/node_modules/.bin/vitest", MODULE, real)).toBe(false);
    expect(isMainModule(undefined, MODULE, real)).toBe(false);
  });

  it("is false, not fatal, when argv[1] cannot be resolved", () => {
    expect(
      isMainModule("/gone", MODULE, () => {
        throw new Error("ENOENT");
      }),
    ).toBe(false);
  });
});

describe("tools/call destink_reduce", () => {
  const SENTENCE = "The tiny red dog barked loudly at the mailman in the yard.";

  it("reports candidates ranked deepest first", async () => {
    const result = await client.callTool({ name: "destink_reduce", arguments: { text: SENTENCE, level: 3 } });
    expect(result.isError).toBeFalsy();
    const text = textOf(result);
    expect(text).toContain("destink reduce:");
    expect(text).toContain("in the yard");
    expect(text.indexOf("depth 2")).toBeLessThan(text.indexOf("depth 1"));
  });

  it("counts overlapping candidates once", async () => {
    const text = textOf(await client.callTool({ name: "destink_reduce", arguments: { text: SENTENCE, level: 3 } }));
    expect(text).toContain("6 of 12 words");
  });

  it("offers nothing at level 1 on prose with no detached material", async () => {
    const text = textOf(await client.callTool({ name: "destink_reduce", arguments: { text: SENTENCE, level: 1 } }));
    expect(text).toContain("nothing structurally removable");
  });

  it("says when a word target cannot be reached without the baseline", async () => {
    const text = textOf(await client.callTool({
      name: "destink_reduce",
      arguments: { text: SENTENCE, level: 3, targetWords: 2 },
    }));
    expect(text).toContain("target not reachable");
  });

  it("refuses a level outside its own dial, naming the ones that exist", async () => {
    const result = await client.callTool({ name: "destink_reduce", arguments: { text: SENTENCE, level: 9 } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("`level` must be one of: 1, 2, 3");
  });

  it("rejects an unknown key rather than quietly ignoring it", async () => {
    const result = await client.callTool({ name: "destink_reduce", arguments: { text: SENTENCE, strictness: 3 } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("unknown argument(s): strictness");
  });
});
