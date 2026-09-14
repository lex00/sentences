#!/usr/bin/env node
// Does the PUBLISHED package work?
//
// Everything else in this repo is checked from a checkout, and a checkout is not what anybody
// installs. The gap between the two is where this project's nastiest bug lived: npm installs a bin
// as a SYMLINK in node_modules/.bin, Node resolves the main module to its realpath for
// `import.meta.url` but hands back `process.argv[1]` exactly as invoked, so the obvious
// is-this-the-entry-point check never matches, the server starts, connects nothing, and exits
// silently — while working perfectly from the source tree. No unit test can see that. Installing
// the tarball and running the bin THROUGH THE SYMLINK can.
//
// So: pack, install into a scratch directory, and drive the installed binary the way a client does.
//   1. the bin exists at node_modules/.bin/destink-mcp and is executable
//   2. it speaks JSON-RPC over stdio: initialize, tools/list, tools/call
//   3. it reports the version package.json claims
//   4. every subpath in "exports" actually imports
//
// Run it from a checkout after `npm run build:lint-dist`:  node scripts/smoke-package.mjs

import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(execFileSync("node", ["-p", "JSON.stringify(require('./package.json'))"], { cwd: root, encoding: "utf8" }));

const sh = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

let failures = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL ${name}\n       ${err instanceof Error ? err.message : err}`);
  }
};

const dir = mkdtempSync(join(tmpdir(), "destink-smoke-"));
try {
  console.log(`packing ${pkg.name}@${pkg.version}`);
  const tarball = sh("npm", ["pack", "--silent"], root).trim().split("\n").pop();

  console.log(`installing into ${dir}`);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "smoke", private: true, type: "module" }));
  sh("npm", ["install", "--no-audit", "--no-fund", join(root, tarball)], dir);
  rmSync(join(root, tarball), { force: true });

  const bin = join(dir, "node_modules", ".bin", "destink-mcp");

  check("the bin is installed (as the symlink npm creates)", () => {
    if (!existsSync(bin)) throw new Error(`${bin} does not exist`);
  });

  check("every exports subpath imports", () => {
    const lines = Object.keys(pkg.exports).map(
      (sub) => `await import(${JSON.stringify(pkg.name + sub.slice(1))});`,
    );
    writeFileSync(join(dir, "imports.mjs"), lines.join("\n"));
    sh("node", ["imports.mjs"], dir);
  });

  check("--help prints usage to stderr and exits 0", () => {
    const out = execFileSync(bin, ["--help"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (out !== "") throw new Error("usage went to stdout; stdout belongs to the JSON-RPC stream");
  });

  await check2("speaks JSON-RPC over stdio through the installed bin", async () => {
    const res = await rpc(bin);
    if (res.server?.version !== pkg.version) {
      throw new Error(`initialize reported version ${res.server?.version}, package.json says ${pkg.version}`);
    }
    for (const want of ["destink_lint", "destink_rules"]) {
      if (!res.tools.includes(want)) throw new Error(`tools/list is missing ${want} (got: ${res.tools.join(", ")})`);
    }
    if (!res.lint.includes("destink:")) throw new Error(`destink_lint returned no report: ${res.lint.slice(0, 120)}`);
    if (!res.lint.includes("reframe")) throw new Error(`destink_lint missed the reframe in the sample: ${res.lint.slice(0, 200)}`);
  });
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(failures === 0 ? "\npackage smoke test passed" : `\npackage smoke test FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);

// --- helpers ---------------------------------------------------------------------------------

async function check2(name, fn) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL ${name}\n       ${err instanceof Error ? err.message : err}`);
  }
}

// Drive the server the way an MCP client does: newline-delimited JSON-RPC on stdin/stdout.
function rpc(bin) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(bin, [], { stdio: ["pipe", "pipe", "pipe"] });
    const pending = new Map();
    let buf = "";
    let id = 0;
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("the server never answered — the classic symptom of a bin that started and connected nothing"));
    }, 30_000);

    child.stdout.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        const msg = JSON.parse(line);
        if (msg.id !== undefined && pending.has(msg.id)) pending.get(msg.id)(msg);
      }
    });
    child.on("error", reject);

    const send = (method, params) =>
      new Promise((res) => {
        const myId = ++id;
        pending.set(myId, res);
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: myId, method, params })}\n`);
      });

    (async () => {
      const init = await send("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "smoke", version: "0" },
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`);
      const list = await send("tools/list", {});
      const lint = await send("tools/call", {
        name: "destink_lint",
        arguments: { text: "It is not bold. It is backwards.", format: "score" },
      });
      clearTimeout(timer);
      child.kill();
      resolvePromise({
        server: init.result?.serverInfo,
        tools: (list.result?.tools ?? []).map((t) => t.name),
        lint: lint.result?.content?.[0]?.text ?? "",
      });
    })().catch((err) => {
      clearTimeout(timer);
      child.kill();
      reject(err);
    });
  });
}
