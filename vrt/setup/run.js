#!/usr/bin/env node
/**
 * Orchestrates the two-phase visual regression run:
 *   1. Phase A (baseline): run vitest with VRT_PHASE=baseline --update
 *      to populate __screenshots__/ with PNGs rendered against
 *      fixtures/baseline.css (origin/develop's compiled CSS).
 *   2. Phase B (candidate): run vitest with VRT_PHASE=candidate (no --update)
 *      to render each story against fixtures/candidate.css (HEAD's compiled
 *      CSS) and fail on any pixel diff versus the Phase A baselines.
 *
 * The global setup runs in each phase — the second invocation reuses the
 * cached baseline/candidate CSS fixtures, so it's effectively free.
 */
import { spawn } from "node:child_process";

// Spawn vitest as a child process, piping stdio and setting VRT_PHASE.
const runVitest = (phase, extraArgs = []) =>
  new Promise((resolve) => {
    const args = ["vitest", "run", "--config", "vrt/vitest.config.js", ...extraArgs];
    const child = spawn("npx", args, {
      stdio: "inherit",
      env: { ...process.env, VRT_PHASE: phase },
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });

// Two-phase entrypoint: write baselines, then compare candidate.
(async () => {
  console.log("\n=== [vrt] Phase A — generating baseline screenshots from develop ===\n");
  const a = await runVitest("baseline", ["--update"]);
  // Phase A flakes don't abort — Phase B will surface the same stories as failures.
  if (a !== 0) {
    console.warn("[vrt] Phase A had failures (some stories may not screenshot cleanly).");
    console.warn("[vrt] Proceeding to Phase B — those stories will also fail there.\n");
  }

  console.log("\n=== [vrt] Phase B — comparing HEAD against baselines ===\n");
  const b = await runVitest("candidate");
  process.exit(b);
})();
