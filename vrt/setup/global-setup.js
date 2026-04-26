import { execSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync, readFileSync, symlinkSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";

const repoRoot = resolve(process.cwd());
const vrtRoot = join(repoRoot, "vrt");
const fixturesDir = join(vrtRoot, "fixtures");
const worktreeDir = join(vrtRoot, ".baseline");
const siteDir = join(repoRoot, "_site");

// Inherited-stdio shell helper.
const run = (cmd, cwd = repoRoot) => {
  execSync(cmd, { cwd, stdio: "inherit", env: process.env });
};

// Static storybook build at _site/ — built once, reused across runs.
const ensureStorybook = () => {
  if (existsSync(join(siteDir, "stories.json"))) return;
  console.log("[vrt] Building storybook → _site/ (slow, ~1-2 min)");
  rmSync(siteDir, { recursive: true, force: true });
  run("npm run build:storybook");
};

// Build origin/develop's CSS via a detached worktree → fixtures/baseline.css.
const buildBaselineCss = () => {
  const baselineCssTarget = join(fixturesDir, "baseline.css");
  // Cached across runs — only rebuilds when explicitly forced.
  if (existsSync(baselineCssTarget) && process.env.VRT_FORCE_REBUILD !== "1") {
    console.log("[vrt] Reusing existing baseline.css (set VRT_FORCE_REBUILD=1 to regenerate)");
    return;
  }

  // Detached worktree of origin/develop — build its CSS without leaving HEAD.
  if (!existsSync(worktreeDir)) {
    console.log("[vrt] Creating git worktree of origin/develop → vrt/.baseline/");
    run("git fetch origin develop --depth=1");
    run(`git worktree add --detach ${worktreeDir} origin/develop`);
  }

  // Symlink avoids a duplicate `npm ci` inside the worktree.
  const worktreeNodeModules = join(worktreeDir, "node_modules");
  if (!existsSync(worktreeNodeModules)) {
    console.log("[vrt] Linking node_modules into worktree");
    symlinkSync(join(repoRoot, "node_modules"), worktreeNodeModules, "dir");
  }

  console.log("[vrt] Building baseline CSS from origin/develop");
  run("npx gulp compileSass", worktreeDir);

  mkdirSync(fixturesDir, { recursive: true });
  copyFileSync(join(worktreeDir, "dist/css/uswds.min.css"), baselineCssTarget);
  console.log(`[vrt] Wrote ${baselineCssTarget}`);
};

// Build HEAD's CSS in-place → fixtures/candidate.css.
const buildCandidateCss = () => {
  const candidateCssTarget = join(fixturesDir, "candidate.css");
  console.log("[vrt] Building candidate CSS from HEAD");
  run("npx gulp compileSass");
  mkdirSync(fixturesDir, { recursive: true });
  copyFileSync(join(repoRoot, "dist/css/uswds.min.css"), candidateCssTarget);
  console.log(`[vrt] Wrote ${candidateCssTarget}`);
};

// Vitest setup hook — builds fixtures, enumerates stories, exposes data to tests.
export const setup = async ({ provide }) => {
  mkdirSync(fixturesDir, { recursive: true });
  ensureStorybook();
  buildBaselineCss();
  buildCandidateCss();

  const baselineCss = readFileSync(join(fixturesDir, "baseline.css"), "utf8");
  const candidateCss = readFileSync(join(fixturesDir, "candidate.css"), "utf8");
  const storiesIndex = JSON.parse(readFileSync(join(siteDir, "stories.json"), "utf8"));

  // Storybook 6.5 emits `stories`; 7+ emits `entries`. Tolerate both.
  const storyMap = storiesIndex.entries || storiesIndex.stories || {};
  const storyIds = Object.values(storyMap)
    .filter((e) => !e.type || e.type === "story")
    .map((e) => e.id);

  provide("vrtBaselineCss", baselineCss);
  provide("vrtCandidateCss", candidateCss);
  provide("vrtStoryIds", storyIds);
  provide("vrtPhase", process.env.VRT_PHASE || "candidate");
};

// Vitest teardown hook — removes the baseline worktree.
export const teardown = async () => {
  // Set VRT_KEEP_WORKTREE=1 to inspect the baseline build between runs.
  if (process.env.VRT_KEEP_WORKTREE === "1") return;
  if (!existsSync(worktreeDir)) return;
  console.log("[vrt] Removing baseline worktree");
  try {
    run(`git worktree remove --force ${worktreeDir}`);
  } catch {
    rmSync(worktreeDir, { recursive: true, force: true });
  }
};
