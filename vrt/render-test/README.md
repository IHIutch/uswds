# Computed-style comparison: develop vs use-lightningcss

Supplements the static CSS diff in `lightningcss-migration-artifacts/` by
rendering every USWDS component in chromium and comparing what
`getComputedStyle()` returns for every element in the DOM under each
build's `uswds.min.css`. This is an authoritative rendering-equivalence
check.

## Bottom line

Headline numbers from `report/_summary.md` (255 Storybook stories × 3
viewports = 765 harness files):

- **197 / 255** stories: byte-identical computed styles across every
  element and property.
- **58 / 255** stories: mismatches, all classified into one of three
  categories.

**One real regression**: `monospace-hack-collapse`. Every `<code>`,
`<pre>`, `<kbd>`, `<samp>` element renders at 13px / 14.95px line-height
on this branch vs 16px / 18.4px on develop. Root cause:
`packages/uswds-elements/lib/_normalize.scss` writes
`font-family: monospace, monospace` as a deliberate Chromium quirk
workaround, and lightningcss collapses that to a single `monospace`.
The single form triggers the CSS2-era "smaller monospace" quirk; the
duplicated form defeats it. See `report/_summary.md` for the fix
options.

Everything else in the mismatches bucket is either `getComputedStyle`
formatting quirks (`0px 0px` vs `0% 0%`) or sub-pixel layout ripples
from fractional-percent precision truncation — both invisible to end
users.

## What's committed vs derived

Committed (under `lightningcss-render-test/`):

- `extract-dom.mjs` — Playwright script that enumerates Storybook
  stories and captures the rendered `#storybook-root` DOM
- `build-harness.mjs` — wraps each snapshot in a standalone HTML file
- `collect-styles.mjs` — Playwright driver that opens each harness
  against one of the two CSS variants and dumps computed styles to JSON
- `diff-styles.mjs` — pairwise diff + classification + report generation
- `property-whitelist.mjs` — helper that extracts the set of CSS
  properties USWDS actually uses from a min file
- `whitelist.txt` — the property whitelist output (144 properties)
- `report/` — 1 markdown file per story with mismatches, plus
  `_summary.md`

Derived / gitignored (regenerate with steps below):

- `_site/` — Storybook static build
- `snapshots/` — raw DOM extracts
- `harness/` — wrapped HTML files
- `serve-develop/`, `serve-lightningcss/` — symlinked web roots per
  variant
- `results/develop/`, `results/lightningcss/` — per-harness JSON dumps
  of computed styles

## How to reproduce

Prerequisites: the static CSS artifacts at
`lightningcss-migration-artifacts/{develop,lightningcss}/uswds.min.css`
must exist. If they don't, rebuild them first per
`lightningcss-migration-notes.md`.

```bash
# 1. Install tooling (one-time)
npm install -D playwright
npx playwright install chromium

# 2. Build Storybook as the DOM corpus
npm run build:storybook   # outputs to _site/

# 3. Extract rendered DOM for every story × 3 viewports
node lightningcss-render-test/extract-dom.mjs
# → lightningcss-render-test/snapshots/<storyId>-<viewport>.html

# 4. Wrap each snapshot in a minimal HTML harness
node lightningcss-render-test/build-harness.mjs
# → lightningcss-render-test/harness/<storyId>-<viewport>.html

# 5. Generate the property whitelist from one of the min files
node lightningcss-render-test/property-whitelist.mjs \
  lightningcss-migration-artifacts/develop/uswds.min.css \
  > lightningcss-render-test/whitelist.txt

# 6. Set up the serve overlays (symlinks, ~0 bytes)
ART=lightningcss-migration-artifacts
BASE=lightningcss-render-test
for variant in develop lightningcss; do
  root="$BASE/serve-$variant"
  rm -rf "$root"
  mkdir -p "$root/css"
  ln -s "$PWD/$ART/$variant/uswds.min.css" "$root/css/uswds.min.css"
  ln -s "$PWD/dist/img"  "$root/img"
  ln -s "$PWD/dist/fonts" "$root/fonts"
  ln -s "$PWD/$BASE/harness" "$root/harness"
done

# 7. Collect computed styles for each variant
node lightningcss-render-test/collect-styles.mjs develop
node lightningcss-render-test/collect-styles.mjs lightningcss
# → lightningcss-render-test/results/{develop,lightningcss}/*.json

# 8. Diff and generate report
node lightningcss-render-test/diff-styles.mjs
# → lightningcss-render-test/report/_summary.md + per-story files
```

Total runtime: ~5 minutes on a laptop (Storybook build ~60s, DOM
extraction ~90s, collection ~90s per variant, diff <5s).

## How the classifier works

`diff-styles.mjs` classifies every mismatch into one of:

- `monospace-hack-collapse` — `font-family: monospace, monospace` vs
  `monospace`, plus the downstream `font-size: 16px` vs `13px` and
  `line-height: 18.4px` vs `14.95px` direct consequences. **Real
  regression.**
- `text-reflow-ripple` — `<html>`/`<body>`/block-element height
  differences ≤ 5px caused by monospace children rendering smaller.
  **Consequence of the monospace regression, not independent.**
- `bg-position-formatting` — `background` or `background-position`
  values that differ only by `0px 0px` vs `0% 0%`. **Cosmetic**:
  `getComputedStyle` serializes these differently but the GPU renders
  them identically.
- `sub-pixel-layout-ripple` — dimension or position properties
  differing by < 0.5px, below Chromium's rendering threshold. **Cosmetic**:
  caused by lightningcss truncating fractional percentages (e.g.
  `33.3333333333%` → `33.3333%`).

If a future comparison surfaces an `unclassified` mismatch, it's either
a new regression or a new category worth adding to the classifier. The
count-by-category table in `_summary.md` makes this visible in the first
few lines of the report.

## Gotchas

- **Storybook builds its own CSS.** `.storybook/main.js` compiles SCSS
  via sass-loader + postcss-csso with `forceMediaMerge: false,
  comments: false`. It does *not* load `dist/css/uswds.min.css`. That's
  why this pipeline extracts DOM only and rebuilds a test harness with
  a fresh `<link>` tag.
- **Font-loading is non-deterministic** without an explicit wait. The
  collector calls `document.fonts.load(...)` for every `@font-face`
  before measuring so that `ex`-unit-based widths (like
  `.usa-prose > li { max-width: 68ex }`) resolve against the web font,
  not the system fallback. Without this, repeated runs of the same
  harness produce different widths depending on whether the font
  fetched in time.
- **SVG sprite 404s are expected.** The extracted DOM references
  `img/sprite.svg` with a relative path that doesn't resolve through
  the harness's root. This only affects SVG content, not computed
  styles, so the collector ignores these errors.
- **`components-card--default` shows 47 sub-pixel mismatches** — these
  are all from `.tablet\:grid-col-4 { width: 33.3333% }` computing to
  `431.984px` instead of develop's `432px`. Invisible.
