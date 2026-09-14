# Task runner for this repo. `just` with no target lists what there is.
#
# Everything here is a thin wrapper over npm scripts and the scripts/ directory, on purpose: CI runs
# the same commands (see .github/workflows/ci.yml), so a green `just check` locally means the same
# thing it means on a pull request. If the two ever drift, the workflow is the one that is right.

set shell := ["bash", "-uc"]

_default:
    @just --list --unsorted

# --- everyday ---------------------------------------------------------------------------------

# Install dependencies exactly as the lockfile pins them.
install:
    npm ci

# The dev server for the diagram app.
dev:
    npm run dev

test:
    npm test

test-watch:
    npm run test:watch

typecheck:
    npm run typecheck

# Compile the publishable lint subtree to dist-lint/.
build-lint:
    npm run build:lint-dist

# Everything CI runs on a pull request. Run this before you push.
check: typecheck test build-lint
    @echo "check: typecheck, tests and the lint-dist build are green"

# --- the linter -------------------------------------------------------------------------------

# Lint one file. `just lint README.md`, or `just lint README.md 3` to turn the dial up.
lint file strictness="2":
    node scripts/destink-score.mjs --markdown --strictness={{strictness}} {{file}}

# Score every markdown doc in the repo, one line each. `just lint-docs 3` for strict.
lint-docs strictness="2":
    #!/usr/bin/env bash
    set -uo pipefail
    for f in README.md docs/*.md; do
      printf '%-30s' "$f"
      node scripts/destink-score.mjs --markdown --strictness={{strictness}} "$f" \
        | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);console.log(`score ${r.score.total.toFixed(1).padStart(6)}  findings ${String(r.counts.findings).padStart(3)}  words ${r.wordCount}`)})'
    done

# Run the MCP server over stdio. Not interactive — for an MCP client to spawn.
mcp: build-lint
    node dist-lint/mcp/server.js

# --- release ----------------------------------------------------------------------------------

# Drive the PUBLISHED package: pack it, install it clean, talk JSON-RPC to the installed bin.
smoke: build-lint
    node scripts/smoke-package.mjs

# Everything that must be true before a version tag exists. Safe to run any time.
release-check: check smoke
    #!/usr/bin/env bash
    set -euo pipefail
    v=$(node -p "require('./package.json').version")
    echo
    if git rev-parse "v$v" >/dev/null 2>&1; then
      echo "note: tag v$v already exists — bump the version before cutting a new release"
    else
      echo "release-check: clean. package.json is at $v, and no tag v$v exists yet."
    fi

# Cut a release (verify, bump, commit, tag; pushes nothing). Usage: just release 0.3.0
release version: release-check
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -n "$(git status --porcelain)" ]; then
      echo "working tree is not clean; commit or stash first" >&2
      exit 1
    fi
    if git rev-parse "v{{version}}" >/dev/null 2>&1; then
      echo "tag v{{version}} already exists" >&2
      exit 1
    fi
    npm version {{version}} --no-git-tag-version
    # The MCP server declares its own version to clients; server.test.ts pins it to package.json,
    # so a bump that forgets it fails the suite rather than shipping a server that misreports itself.
    sed -i.bak -E 's/(\{ name: "destink", version: ")[^"]+(" \},)/\1{{version}}\2/' src/mcp/server.ts
    rm -f src/mcp/server.ts.bak
    npm test
    git add package.json package-lock.json src/mcp/server.ts
    git commit -m "release: {{version}}"
    git tag -a "v{{version}}" -m "sentences {{version}}"
    echo ""
    echo "tagged v{{version}}. Nothing has been pushed."
    echo "Publishing to npm happens when the tag reaches origin: just release-push"

# Push the release. THIS PUBLISHES TO npm — .github/workflows/publish.yml fires on the tag.
release-push:
    #!/usr/bin/env bash
    set -euo pipefail
    v=$(node -p "require('./package.json').version")
    git rev-parse "v$v" >/dev/null 2>&1 || { echo "no tag v$v — run 'just release $v' first" >&2; exit 1; }
    echo "About to push main and v$v to origin."
    echo "That triggers npm publish of sentences@$v, which cannot be undone."
    read -r -p "Type the version to confirm: " answer
    [ "$answer" = "$v" ] || { echo "aborted" >&2; exit 1; }
    git push origin main "v$v"
