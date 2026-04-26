# vrt — visual & rendering tests

Three subdirectories validating the lightningcss migration at three levels of fidelity: CSS text, resolved cascade, and rendered pixels. Each is self-contained with its own README and scripts; they don't share code.

```
vrt/
  pixel-regression/    Vitest screenshot suite, develop's CSS vs this branch's
  static-diff/         per-component diff of the compiled CSS file
  computed-style/      getComputedStyle A/B across 255 Storybook stories
```

Quick orientation for each below.

## pixel-regression/

A Vitest browser-mode screenshot suite that runs in two phases:

1. Phase A: render every Storybook story against `origin/develop`'s compiled CSS, save baseline PNGs.
2. Phase B: render the same stories against `HEAD`'s compiled CSS, fail on any pixel diff vs Phase A.

Run with `npm run test:visual`. Outputs go to `pixel-regression/__screenshots__/` and `pixel-regression/fixtures/` (both gitignored). See `pixel-regression/README.md` for viewport configuration, baseline-rebuild flags, and how to interpret failures.

## static-diff/ (lightningcss migration)

Component-by-component comparison of the `uswds.min.css` *file* on
develop (csso pipeline) vs this branch (lightningcss pipeline). Answers:

- Which components changed?
- What kind of changes (color normalization, vendor prefix regen,
  selector reorder)?
- Did any selector reordering produce a cascade inversion?

Result: 7 of 93 components byte-identical, 86 with classified-cosmetic
diffs, 0 cascade inversions. See `static-diff/README.md` for the
full write-up; `static-diff/pr-comment.md` for the reviewer summary;
`static-diff/by-component.md` for per-component change-type counts.

## computed-style/ (lightningcss migration)

Renders every Storybook story in chromium against each build's CSS and diffs `getComputedStyle()` for every element. Catches differences that survive the cascade but show up in resolved values, which a CSS text diff can't see.

Result: 197/255 stories byte-identical at runtime, 58/255 with only classified-benign mismatches, 0 unclassified, except for one real regression the static diff missed. lightningcss collapses the `font-family: monospace, monospace` hack from Normalize.css into a single `monospace`, which makes `<code>`/`<pre>`/`<kbd>`/`<samp>` render at 13px instead of 16px in Chromium. See `computed-style/README.md` and `computed-style/report/_summary.md`.
