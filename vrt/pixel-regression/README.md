# pixel-regression

Vitest browser-mode screenshot suite. Renders every Storybook story
against two CSS builds — `origin/develop` (baseline) and `HEAD`
(candidate) — and fails on pixel diffs.

## Run

```bash
npm run test:visual
```

The first run is slow (~1–2 min for the Storybook build, plus a
detached `git worktree` of `origin/develop` to compile its CSS). Both
are cached; subsequent runs reuse the artifacts.

To force a fresh baseline build (e.g. `develop` moved):

```bash
VRT_FORCE_REBUILD=1 npm run test:visual
```

## How it works

`setup/run.js` orchestrates two passes of `vitest run`:

1. **Phase A** — `VRT_PHASE=baseline vitest run --update`. Every story
   is rendered with `fixtures/baseline.css` (origin/develop's compiled
   `dist/css/uswds.min.css`), and the resulting PNGs are written to
   `__screenshots__/` as the source of truth.
2. **Phase B** — `VRT_PHASE=candidate vitest run` (no `--update`).
   Same stories, this time with `fixtures/candidate.css` (HEAD's
   compiled CSS). Any pixel diff vs Phase A's PNG fails the test.

The two-phase structure means the suite is self-baselining: a reviewer
doesn't need to commit baseline PNGs from `develop` because they're
regenerated on every run from the actual `develop` tip.

## What's tested

`stories.test.js` enumerates every story in the static Storybook build
(`_site/stories.json`) and asserts a screenshot match for each at two
viewports:

- `chromium-mobile` (320 × 2400, tall to avoid cropping long stories)
- `chromium-desktop` (1024 × 800)

Each story is loaded into a hidden iframe (so Storybook chrome doesn't
contaminate the screenshot), the rendered DOM is extracted into the
test document, and the phase's CSS is injected via a `<style>` tag.
Animations and transitions are killed. 2x DPR captures Retina-resolution
PNGs. Tolerance is `allowedMismatchedPixelRatio: 0.005` to absorb
sub-pixel antialiasing noise.

## Layout

```
pixel-regression/
  vitest.config.js        Vitest config: browsers, viewports, comparator
  stories.test.js         the test spec (one test per story × viewport)
  setup/
    global-setup.js       builds baseline.css + candidate.css, enumerates stories
    run.js                two-phase entrypoint (the npm script target)
  __screenshots__/        gitignored — Phase A output, Phase B input
  fixtures/               gitignored — baseline.css + candidate.css
  .baseline/              gitignored — detached git worktree of origin/develop
  .vitest-attachments/    gitignored — Vitest's diff PNG attachments on failure
```

## When a test fails

Vitest writes the candidate render and the diff PNG to
`.vitest-attachments/`. Open both alongside the baseline in
`__screenshots__/` to see what changed. If the change is intentional,
delete the affected baseline PNG(s) and re-run — Phase A will
regenerate them.

## Environment variables

- `VRT_FORCE_REBUILD=1` — rebuild `fixtures/baseline.css` and
  `fixtures/candidate.css` even if cached
- `VRT_KEEP_WORKTREE=1` — preserve `.baseline/` after the run for
  manual inspection
- `VRT_PHASE=baseline|candidate` — set automatically by `run.js`;
  manual override only useful for debugging a single phase
