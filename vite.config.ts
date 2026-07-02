import { defineConfig } from "vite";

// Base is "/" for the dev server and root deploys. GitHub Pages project sites serve under
// "/<repo>/", so the deploy sets VITE_BASE (e.g. "/sentences/") and everything — assets and the
// lazy-loaded model — resolves against import.meta.env.BASE_URL.
export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
});
