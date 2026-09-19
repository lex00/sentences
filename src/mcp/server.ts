#!/usr/bin/env node
// The de-stink MCP server: the trope linter over stdio, so an agent writing prose can check it
// against the same rules and the same score the browser app and the CLI use.
//
// This file is wiring only — the protocol envelope, the tool declarations, and the dispatch. What
// the tools mean lives in tools.ts, which imports nothing from the SDK and is tested directly.
//
// Read-only by design. Both tools take text (or read one file) and return a report; nothing here
// writes, and nothing here reaches the network. That is a deliberate limit, not an oversight: the
// mechanical fixer (src/lint/fix/) edits an author's words, and whether a given edit ships is a
// decision for the agent holding the document and the human reading it, not for a linter.
//
// One operational trap worth stating: stdout IS the JSON-RPC stream. A stray console.log in this
// process corrupts the protocol and the client sees a parse error, not a message. Diagnostics go to
// stderr or nowhere.
//
// Run it:  npx -y --package=sentences destink-mcp
// From a checkout, after `npm run build:lint-dist`:  node dist-lint/mcp/server.js

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { LINT_FORMATS, runLint, runReduce, runRulesList } from "./tools.js";
import { REDUCTION_LEVELS } from "../lint/reduction.js";
import { STRICTNESS_LEVELS } from "../lint/strictness.js";
import { TIERS } from "../lint/score.js";
import { RULES } from "../lint/registry.js";

// Declared as raw JSON Schema rather than built from zod. The SDK accepts either; this way the
// schema the client reads is the literal object in this file, and the validation the server acts on
// is parseLintArgs (tools.ts) — one place to look for each, instead of a generated schema and an
// inferred type that drift apart.
const LINT_INPUT_SCHEMA = {
  type: "object",
  properties: {
    text: { type: "string", description: "The prose to lint. Use this for a draft you are holding." },
    path: {
      type: "string",
      description:
        "A file to read and lint instead of `text`, resolved against the server's working directory. " +
        "A .md/.markdown/.mdx path turns on markdown handling unless `markdown` says otherwise.",
    },
    markdown: {
      type: "boolean",
      description:
        "Blank code fences, tables, inline code, link targets, HTML blocks and admonitions to spaces " +
        "before linting, so markdown structure is not read as prose. Spans still index the original " +
        "text. Leaving this off on a markdown file is the single biggest source of false findings.",
    },
    strictness: {
      type: "integer",
      enum: [...STRICTNESS_LEVELS],
      description:
        "How hard to look. 2 (default) is the level every threshold in the rule set was calibrated " +
        "against, measured so it stays quiet on deliberate human prose. 3 drops every density floor " +
        "to zero — one instance of a shape reports the same as six — and raises each finding a " +
        "severity step; use it on text you already know a model wrote, when the question is whether " +
        "the shape is present at all rather than whether it is a tic. 1 doubles the floors and eases " +
        "severities, for prose with a voice you are trying not to flatten.",
    },
    format: {
      type: "string",
      enum: [...LINT_FORMATS],
      description:
        "summary (default): findings as line:col with the offending excerpt and why it reads as a tell. " +
        "score: the counts and the score only, for checking whether an edit helped. " +
        "json: the full versioned report, identical to the destink-score CLI's output.",
    },
  },
  additionalProperties: false,
} as const;

const REDUCE_INPUT_SCHEMA = {
  type: "object",
  properties: {
    text: { type: "string", description: "The prose to examine. Use this for a draft you are holding." },
    path: { type: "string", description: "A file to read instead of `text`, resolved against the server's working directory." },
    markdown: {
      type: "boolean",
      description:
        "Blank markdown structure to spaces before reading, so it is not mistaken for prose. On by " +
        "default for a .md/.markdown/.mdx path.",
    },
    level: {
      type: "integer",
      enum: [...REDUCTION_LEVELS],
      description:
        "How deep to cut. This is reduction's own dial and has nothing to do with destink_lint's " +
        "`strictness`: that one decides how readily a shape is called a tell, this one decides how " +
        "far from the baseline a phrase has to sit before it is offered. 1 offers only what the " +
        "diagram draws detached or parenthesised. 2 (default) adds modifiers of modifiers. 3 adds " +
        "any adjunct hanging off the baseline.",
    },
    targetWords: {
      type: "integer",
      minimum: 0,
      description:
        "Stop once the document would reach this many words, taking the deepest cuts first. The " +
        "result says when the target cannot be reached without cutting into the baseline.",
    },
  },
  additionalProperties: false,
} as const;

const RULES_INPUT_SCHEMA = {
  type: "object",
  properties: {
    tier: {
      type: "string",
      enum: [...TIERS],
      description: "Only list rules in this tier.",
    },
  },
  additionalProperties: false,
} as const;

const TOOLS = [
  {
    name: "destink_lint",
    title: "Lint prose for AI-writing tropes",
    description:
      "Check prose for the patterns that make writing read as AI-generated: negative parallelism " +
      '("it\'s not X, it\'s Y"), self-posed rhetorical questions, tricolon and anaphora runs, punchy ' +
      "one-line fragments, filler transitions, ornate nouns, em-dash density, bold-first bullets, " +
      "and cross-sentence repetition. Returns located findings plus a stink score (weighted findings " +
      "per 1000 words) you can compare between drafts. Deterministic and offline — a rule engine over " +
      "a constituency parse, not a model judging taste, so the same text always scores the same. " +
      "Density is the point: it can tell one tricolon (style) from three in a row (a tic), and " +
      "`strictness` turns that dial: 3 reports a shape on its first appearance instead of waiting " +
      "for a rate. " +
      `${RULES.length} rules across four tiers; call destink_rules to see them.`,
    inputSchema: LINT_INPUT_SCHEMA,
  },
  {
    name: "destink_reduce",
    title: "Find what a sentence could lose",
    description:
      "Report the material a document could lose without its sentences changing shape. A different " +
      "question from destink_lint: that asks whether prose reads as machine-written, this asks " +
      "whether a sentence is carrying its weight, which is where most overwriting lives. Ranked by " +
      "depth below the diagram's baseline — a Reed-Kellogg diagram draws obligatory material on the " +
      "line and everything optional hanging beneath it, so the notation itself supplies the " +
      "ordering. Every candidate is verified by cutting it and re-parsing: if the subject, verb or " +
      "complement moves, it is withdrawn, which is a guarantee no rewrite can offer. Read-only, and " +
      "it edits nothing. Candidates are suggestions about STRUCTURE — what is grammatically " +
      "optional — and say nothing about what is worth keeping. That judgement is yours.",
    inputSchema: REDUCE_INPUT_SCHEMA,
  },
  {
    name: "destink_rules",
    title: "List the de-stink rule set",
    description:
      "List every trope rule destink_lint runs — id, tier and name — in the order findings are " +
      "attributed when two rules tie. Use it to interpret a finding's ruleId, or to see what is and " +
      "is not checked before trusting a clean report.",
    inputSchema: RULES_INPUT_SCHEMA,
  },
] as const;

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const ok = (text: string): ToolResult => ({ content: [{ type: "text", text }] });
const fail = (text: string): ToolResult => ({ content: [{ type: "text", text }], isError: true });

// A tool that throws and a tool that reports a problem are different things to a client: the first
// is a protocol-level error the model never gets to read, the second comes back as content it can
// act on. Bad arguments and unreadable files are the model's problem to fix, so they come back as
// `isError` content with a message that says what to do differently.
export function callTool(name: string, args: unknown): ToolResult {
  switch (name) {
    case "destink_lint": {
      const result = runLint(args);
      return result.ok ? ok(result.rendered) : fail(result.error);
    }
    case "destink_reduce": {
      const result = runReduce(args);
      return result.ok ? ok(result.rendered) : fail(result.error);
    }
    case "destink_rules": {
      const result = runRulesList(args);
      return result.ok ? ok(result.rendered) : fail(result.error);
    }
    default:
      return fail(`unknown tool: ${name}. Available: ${TOOLS.map((t) => t.name).join(", ")}`);
  }
}

export function createServer(): Server {
  const server = new Server(
    // Kept in step with package.json by server.test.ts — a client reads this in the initialize
    // handshake, and a stale version is the same small lie the rule count would be.
    { name: "destink", version: "0.2.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    callTool(request.params.name, request.params.arguments),
  );

  return server;
}

export async function main(): Promise<void> {
  await createServer().connect(new StdioServerTransport());
}

// What a human gets for running this by hand. Built at call time so the rule count can't go stale,
// and printed to STDERR always — stdout belongs to the JSON-RPC stream and nothing else.
export function usage(): string {
  return `destink-mcp - the de-stink trope linter, as an MCP server over stdio.

This is not an interactive command. It speaks JSON-RPC on stdin/stdout and is meant to be launched
by an MCP client, not run by hand. Register it:

  {
    "mcpServers": {
      "destink": { "command": "npx", "args": ["-y", "--package=sentences", "destink-mcp"] }
    }
  }

Tools:
  destink_lint   Lint prose for AI-writing tropes. Takes 'text' or 'path', an optional 'markdown'
                 (on by default for a .md/.markdown/.mdx path), and a 'format': summary (each
                 finding as line:col with the offending excerpt and why it reads as a tell), score
                 (the counts alone, for checking whether an edit helped), or json (the full
                 versioned report).
  destink_reduce Report what a document could LOSE without its sentences changing shape, ranked by
                 depth below the diagram's baseline and verified by re-parsing each cut. Its
                 'level' (1-3) is a separate dial from destink_lint's 'strictness'.
  destink_rules  List the ${RULES.length} rules destink_lint runs - id, tier, name.

Both are read-only: nothing is written, and nothing leaves the machine.

To lint one file without an MCP client, use the scorer from a checkout of this repo:
  node scripts/destink-score.mjs [--markdown] <file>`;
}

export const helpRequested = (argv: readonly string[]): boolean =>
  argv.includes("--help") || argv.includes("-h");

// Whether this module is the process entry point — the guard that keeps importing it (a test, or a
// host embedding the server on some other transport) from seizing stdio.
//
// The obvious check, `import.meta.url === pathToFileURL(process.argv[1]).href`, is wrong here, and
// wrong in precisely the case that matters. npm installs a bin as a SYMLINK in node_modules/.bin;
// Node resolves the main module to its realpath for `import.meta.url` but hands back `argv[1]`
// exactly as it was invoked. The two then never match, so the server starts, connects nothing, and
// exits silently — while working fine from a checkout, where no symlink is involved. Comparing
// realpaths is what makes the packaged bin and the source file behave the same.
export function isMainModule(
  argvPath: string | undefined,
  moduleUrl: string,
  realpath: (p: string) => string = (p) => realpathSync(p),
): boolean {
  if (!argvPath) return false;
  try {
    return moduleUrl === pathToFileURL(realpath(argvPath)).href;
  } catch {
    return false; // argv[1] unreadable or gone; not a reason to take the process down
  }
}

if (isMainModule(process.argv[1], import.meta.url)) {
  // A TTY on stdin means a person typed this, not a client that spawned it — a client always gets a
  // pipe. Without this branch the server sits there looking hung while it waits for JSON-RPC that is
  // never coming, which is the worst possible answer to "did the thing I just installed work?".
  if (helpRequested(process.argv.slice(2)) || process.stdin.isTTY) {
    console.error(usage());
    process.exit(0);
  }
  main().catch((err: unknown) => {
    console.error("destink-mcp:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
