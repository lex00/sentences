import { defineConfig, configDefaults } from "vitest/config";

// Base is "/" for the dev server and root deploys. GitHub Pages project sites serve under
// "/<repo>/", so the deploy sets VITE_BASE (e.g. "/sentences/") and everything — assets and the
// lazy-loaded model — resolves against import.meta.env.BASE_URL.
export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  build: {
    rollupOptions: {
      // thin apps on one engine: the diagram tool (index) and the game modes
      input: { main: "index.html", play: "play.html", game: "game.html", drag: "drag.html", free: "free.html" },
    },
  },
  // agent worktrees nest under .claude/worktrees; without the exclude, vitest in the main
  // checkout scans and runs their in-progress test files too
  test: { exclude: [...configDefaults.exclude, "**/.claude/**"] },
});
