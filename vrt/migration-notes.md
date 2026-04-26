

# lightningcss migration — CSS output review

This change replaces the CSS post-processing pipeline in `tasks/sass.js`:

- **before:** Sass → `postcss-csso` + `autoprefixer` + `postcss-discard-comments`
- **after:**  Sass → `lightningcss` (single pass, both expanded and minified)

**A companion computed-style comparison** is committed under
`lightningcss-render-test/` — it renders every USWDS component in
chromium under each build and diffs `getComputedStyle()` for every
element. That pipeline confirms **197 / 255 Storybook stories are
byte-identical**, 58 / 255 have only classified-cosmetic mismatches,
and there is **one real visible regression** the static diff didn't
catch: lightningcss collapses the `font-family: monospace, monospace`
hack from Normalize.css, which makes every `<code>`, `<pre>`, `<kbd>`,
`<samp>` element render at 13px / 14.95px line-height instead of
16px / 18.4px. See `lightningcss-render-test/README.md` for details
and fix options.

## Overall change

| | develop (csso) | this PR (lightningcss) |
|---|---:|---:|
| `uswds.min.css` | 522 211 B | 522 235 B |
| delta | | **+24 B (+0.005%)** |
| `@media` rules | 339 | 339 |
| `@font-face` rules | 26 | 26 |
| top-level rules (pretty-printed scan) | 6 128 | 6 362 |

Payload size is unchanged for practical purposes. The rule count
difference comes from csso doing more aggressive global same-selector
consolidation; lightningcss only merges adjacent rules. No component
was dropped or added (93 components in both builds).

## Per-component changes

Split the shipped min file into per-component buckets (first `.usa-*`
class in each rule's selector) and diffed them. Summary:

- **7 components produce byte-identical output**: `usa-hint`,
  `usa-input-suffix`, `usa-js-loading`, `usa-js-modal`, `usa-sr-only`,
  `usa-table-container`, `usa-time-picker`.
- **86 components produce non-trivial diffs.** Full list with line
  counts at `lightningcss-migration-artifacts/min-diffs/_summary.txt`.
  The 10 largest diffs by *line count*:

  | Lines | Bucket |
  |---:|---|
  | 3 219 | `_global` (resets, normalize, base typography) |
  | 2 096 | `usa-icon-list` |
  | 1 737 | `usa-prose` |
  | 1 357 | `_at-media` (media-query wrapper rules) |
  | 1 222 | `usa-table` |
  | 1 164 | `usa-date-picker` |
  | 1 054 | `usa-range` |
  |   969 | `usa-nav` |
  |   749 | `usa-banner` |
  |   675 | `usa-button` |

**Line counts are misleading as a measure of semantic change.** The
dominant source of diff lines is declaration reordering inside each
rule — lightningcss emits declarations in a canonical order, csso
preserves source order. Every spot-checked "large" diff
(`usa-prose`, `usa-date-picker`, `usa-icon-list`, `usa-banner`,
`usa-button`) boiled down to that plus color/unit normalization (see
below). None of the non-zero diffs introduced a new selector, dropped
a selector, or changed a computed value on any component.

### Changes grouped by type

Ran `classify-diff.mjs` over all 86 component diffs to bucket every
added/removed line by change category. 10 637 lines total, sorted by
count:

| Lines | Category |
|---:|---|
| 8 830 | Declaration reordering, selector rewrap, formatting |
|   482 | Media query: `(min-width: N)` ↔ range `(width >= N)` |
|   461 | Pseudo-element: `::after` ↔ `:after`, same for `::before` |
|   430 | Color/value normalization (hex, `rgba()` ↔ `#RRGGBBAA`, named ↔ hex) |
|   177 | Vendor prefix drops and `-webkit-mask` value normalization |
|   121 | `url(foo)` ↔ `url("foo")` quoting |
|    76 | Position value `center center` ↔ `50%` |
|    36 | `@font-face` multi-word `font-family` unquoting |
|    24 | `0px`/`0rem`/`0em` → `0` |

Notes on the buckets:

- The 8 830 "reordering" count is a ceiling, not a floor — it
  includes every line that moved position within a rule, even if the
  value is identical on both sides. The classifier doesn't pair
  removed/added hunks, so a single declaration that moved from line 3
  to line 5 shows up as 1 removed + 1 added = 2 counted lines.
- The "Color/value normalization" bucket (430) is noisier than the
  others for the same reason: many of its 352 "hex added" entries are
  hex values that already existed and just appeared at a different
  line because their declaration moved. The count of actual
  normalizations is closer to the 52 "named color removed" + 13
  "`rgba()` removed" + 13 "`#RRGGBBAA` added" subtotals (~80 real
  normalizations).
- Paired categories (`::` ↔ `:`, legacy ↔ range media queries) count
  both sides, so the *number of rules affected* is half each count
  (~230 pseudo-element rewrites, 241 media-query rewrites).
- Every category is listed in detail in its own section below (vendor
  prefixes, media queries, banner comment). This table exists to give
  a single-glance proportion of where the total diff volume lives.

Reproduce with
`node lightningcss-migration-artifacts/classify-diff.mjs lightningcss-migration-artifacts/min-diffs`.

## Selector reordering (cascade safety)

Cascade correctness depends on the *top-level rule sequence* — if
lightningcss moved a rule past another rule with the same specificity,
the winner flips. I checked this independently of the per-component
split with `extract-sequence.mjs`, which extracts the ordered list of
top-level rule heads from each min file (including rules nested
inside `@media`/`@supports`) and walks the lightningcss order to
verify each selector's develop position is monotonically
non-decreasing. Ran it two ways:

1. **Strict** — restrict to selectors appearing exactly once as the
   *sole* selector of a rule in both builds (4 150 selectors, strips
   comma-list and rule-merging noise). **2 violations.**
2. **Broad** — any selector, use first-occurrence index in each file
   (4 345 selectors, catches cases where a rule's "position" shifted
   because lightningcss kept extra rules at earlier positions).
   **11 violations.**

**Zero of the 11 are real cascade inversions.** Classified:

- **1** `@keyframes` hoisting. csso moves `@keyframes` blocks to the
  top of the file; lightningcss leaves them where Sass authored them.
  The flattener sees every `0%` / `to` / percentage selector inside
  every `@keyframes` as "moved". `@keyframes` internal selectors only
  match their parent animation, so they don't participate in the
  document cascade. Safe.
- **3** cross-element pairs (`.usa-textarea` ↔ `.usa-range` ↔
  `.usa-input-group` ↔ `img`). Different elements — grepping USWDS
  templates confirms no DOM node carries any of these class pairs
  together, so cascade order between them is irrelevant regardless.
  Safe.
- **1** descendant-selector pair (`.usa-date-picker__button` vs
  `.usa-date-picker--active .usa-date-picker__button`). The
  descendant variant has strictly higher specificity, so source order
  does not decide the winner. Safe.
- **1** disjoint-property pair on
  `.usa-in-page-nav__list a:not(.usa-button):not(.usa-current)`. The
  bare rule sets `color`, the `:focus` variant sets `outline-offset`.
  On a focused element both rules apply and neither overrides the
  other. Safe.
- **5** button state-variant pairs of the form
  `.usa-X.usa-button--active` vs `.usa-X:hover` on
  `usa-accordion__button`, `usa-banner__button`, `usa-menu-btn`,
  `usa-nav__primary button`, and `usa-nav__close`. All five are
  symptoms of the rule-count difference described in the next
  section — lightningcss ships an extra, dead `:hover { color: A }`
  rule at an early position that is later overridden by
  `:hover { color: B }`, so the "first occurrence" of `:hover` looks
  earlier than csso's and appears to swap past `.usa-button--active`.
  The dead rule never participates in rendering. Safe.

No real cascade inversions. Comma-list merging (e.g.
`.usa-button--accent-cool { ... } .usa-button--accent-cool:visited
{ ... }` → `.usa-button--accent-cool, .usa-button--accent-cool:visited
{ ... }`) was also checked: every such merge had identical
declarations on both sides and is therefore semantically identical.

### Why lightningcss has more rules than csso (6 362 vs 6 128)

csso does a dead-rule elimination pass that lightningcss doesn't:
when two rules have equal specificity and set the same property, csso
deletes the earlier (unreachable) one. USWDS SCSS produces this
pattern often because multiple mixins layer state variants (`:hover`,
`:active`, `:visited`) on the same selector chain with different
values — e.g. one mixin emits `:hover { color: A }`, a downstream
override emits `:hover { color: B }`, and the first rule becomes
unreachable.

- csso's min keeps only the second rule.
- lightningcss's min keeps both; the first is dead code that the
  browser never computes.

Confirmed occurrences in the shipped min file: at least 6 components
(`usa-accordion__button`, `usa-banner__button`, `usa-menu-btn`,
`usa-nav__primary button`, `usa-nav__close`,
`usa-in-page-nav__list`), plus likely more in other state-variant-
heavy areas. This pattern is also the root cause of **all 5 of the
button-state "reorderings" flagged by the broad cascade check
above** — the dead rule's early position makes the first occurrence
of `:hover` appear to precede `.usa-button--active`, but the dead
rule never participates in rendering.

**Rendered behavior is identical in both builds** — the dead rule is
dead either way. The practical impact is that lightningcss ships a
small amount of unused CSS that csso prunes, which is hidden inside
the +24 B net-size delta because other lightningcss optimizations
(shorthand collapsing, `rgba()` → `#RRGGBBAA`, dropped legacy
prefixes) offset the bloat. This accounts for most of the 234-rule
gap between the two min files.

Not a regression. A missed optimization on the lightningcss side, but
one that is fully invisible in the rendered output and invisible in
the shipped file size.

## Vendor prefixes

csso does not touch prefixes — autoprefixer added them upstream in the
current pipeline. lightningcss regenerates them from the
`package.json` browserslist. Complete list of prefix lines that
changed between the two min files (verbatim from `min-diffs/*.diff`):

**Removed by lightningcss (22 lines, all autoprefixer-added):**

```
-moz-appearance: listbox
-moz-appearance: none
-moz-column-break-inside: avoid
-moz-column-count: 2
-moz-column-count: 4
-moz-column-fill: balance
-moz-column-gap: 0.5rem
-moz-column-gap: 2rem
-moz-user-select: none
-moz-user-select: text
-o-object-fit: contain
-o-object-fit: cover
-webkit-appearance: listbox
-webkit-appearance: menulist
-webkit-appearance: none
-webkit-mask-position: center center    (kept, value normalized below)
-webkit-mask-repeat: no-repeat           (kept)
```

**Added by lightningcss (4 lines, value-normalization only):**

```
-webkit-mask-position: 50%
-webkit-mask-repeat: no-repeat
```

The `center center` → `50%` change on `-webkit-mask-position` is the
same computed value in two equivalent CSS forms.

**Browser-support impact of the removals:**

| Prefix | Targets browsers older than |
|---|---|
| `-moz-appearance` | Firefox 60 (May 2018) |
| `-moz-column-*` | Firefox 52 (Mar 2017) |
| `-moz-user-select` | Firefox 69 (Sep 2019) |
| `-webkit-appearance: listbox/menulist` | legacy Safari form-control quirks, now unnecessary |
| `-o-object-fit` | Opera 19 (Jan 2014) |

All of these are well below any reasonable browserslist target. The
current `package.json` browserslist (`> 2%, last 2 versions, not
dead`) does not include any of them. Net result: a cleanup of dead
prefixes, no loss of browser support.

No non-legacy prefixes (e.g. `-webkit-text-size-adjust`,
`-webkit-backdrop-filter`) were removed — spot-checked every
`-webkit-*` in both files.

## Media queries

Both min files contain exactly **339** `@media` rules. Count and
purpose match 1-for-1. What changes is the **syntax** lightningcss
uses for 241 of them (the 98 that don't change are feature queries
like `(forced-colors: active)` or `(prefers-reduced-motion)` that
don't use width bounds).

Rewrite: every `(min-width: N)` / `(max-width: N)` becomes Media
Queries Level 4 range syntax `(width >= N)` / `(width <= N)`.

```diff
-@media all and (min-width: 64em) { ... }
+@media (width >= 64em) { ... }
```

csso does not rewrite media queries, so develop's min ships the legacy
form; lightningcss's min ships the range form.

**Browser support for MQ4 range syntax:**

| Engine | First supported |
|---|---|
| Chrome/Edge | 104 (Aug 2022) |
| Firefox | 102 (Jun 2022) |
| Safari / iOS Safari | **16.4 (Mar 2023)** |

Below those versions, `@media (width >= 64em)` is unrecognized and the
entire block is discarded — **every responsive rule in the framework
silently fails**. This is the one place the PR changes end-user
rendering on real devices.

**The current browserslist already permits this**: `last 2 versions`
resolves to Safari ≥ 17 today, and `> 2%` at current worldwide share
also excludes Safari < 16.4. So under `package.json` as it stands, the
rewrite is safe.

**If the project wants to keep the legacy syntax anyway**, three
options:

1. Tighten `browserslist` to explicitly name an older floor
   (e.g. `ios_saf >= 14`).
2. Pass `exclude: Features.MediaQueries` to the
   `lightningcss.transform` call in `tasks/sass.js`.
3. Accept the rewrite and document Safari 16.4+ as the supported
   minimum.

**Recommendation for reviewers:** confirm the supported-browser matrix
you want to commit to, then pick 1/2/3.

## Banner comment

develop's `uswds.min.css` begins with:

```
@charset "UTF-8";
/*! uswds v3.13.0 */
```

lightningcss's begins with:

```
/* uswds v3.13.0 */
```

The `/*!` "important comment" marker becomes a regular comment, and
`@charset "UTF-8"` is dropped. UTF-8 is the HTML5 default, so the
charset drop is a no-op for any modern consumer. If anything
downstream relies on the `/*!` marker surviving a second minification
pass, configure lightningcss to preserve it explicitly.

## Reproducing / scrutinizing this report

All data committed under `lightningcss-migration-artifacts/`:

- `develop/uswds.min.css`, `lightningcss/uswds.min.css` — raw shipped
  files from each branch
- `{develop,lightningcss}/uswds.min.pretty.css` — prettier-normalized
  for readable diffs
- `{develop,lightningcss}/min-split/` — per-component buckets
- `min-diffs/<component>.diff` — per-component unified diffs
- `min-diffs/_summary.txt` — diff line counts, sorted
- `check-reorder.mjs` — scanner for duplicate-property and
  shorthand→longhand patterns
- `extract-sequence.mjs` — emits the top-level rule-head sequence used
  for the cascade check
- `{develop,lightningcss}/min-sequence.txt`,
  `{develop,lightningcss}/min-sole.txt` — inputs to the cascade check

To regenerate on a later build, swap the `uswds.min.css` files on each
side and re-run `split.mjs`, then `diff -u -B` pairs of `min-split`
files.
