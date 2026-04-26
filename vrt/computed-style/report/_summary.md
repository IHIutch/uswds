# Computed-style diff summary

Compared `develop` (csso) vs `use-lightningcss` (lightningcss) using 765 harness files across 255 stories × 3 viewports. Computed styles collected via Playwright chromium.

## Overview

- Stories checked: 255
- Stories with **zero** computed-style mismatches (identical in both builds): **197**
- Stories with only classified-benign mismatches (see "Mismatch categories" below): **58**
- Stories with unclassified mismatches that need review: **0**

## Mismatch categories

| Count | Category | Interpretation |
|---:|---|---|
| 279 | `monospace-hack-collapse` | **REAL REGRESSION.** lightningcss collapses `font-family: monospace, monospace` (an intentional CSS hack from Normalize.css) to `font-family: monospace`. Chromium applies a smaller default size to a single `monospace` generic than to a duplicated one, so `<pre>`, `<code>`, `<kbd>`, `<samp>` render at ~13px instead of the expected 16px. |
| 600 | `bg-position-formatting` | **COSMETIC.** `getComputedStyle` serializes `0px 0px` and `0% 0%` as different strings, but they compute to the same background-position and render identically. The two builds emit the same canonical form via different normalization paths. |
| 197 | `sub-pixel-layout-ripple` | **COSMETIC.** Dimension or position differs by less than 0.5px, below Chromium's sub-pixel rendering threshold. Caused by lightningcss truncating fractional percentages (e.g. `33.3333333333%` → `33.3333%`) which produces computed widths like `431.984px` instead of `432px`. Invisible to end users. |
| 4 | `text-reflow-ripple` | **CONSEQUENCE of monospace regression (not independent).** Page/block height differs by up to 5px because a monospace child element rendered at 13px (lightningcss) instead of 16px (develop), so the surrounding text takes less vertical space. Fixes itself once the `monospace-hack-collapse` root cause is addressed. |
| 0 | `unclassified` | Needs review — not matched by any known-benign classifier. These are either real regressions or new classification rules worth adding. |

## Stories with mismatches

Sorted by `unclassified` first (most likely to contain real regressions), then by total mismatches.

| Unclass. | Mono | Bg-fmt | Sub-px | Reflow | Total | Story |
|---:|---:|---:|---:|---:|---:|---|
| 0 | 189 | 0 | 0 | 0 | 63 | [`design-tokens-icons-icon-sizes--icon-sizes`](./design-tokens-icons-icon-sizes--icon-sizes.md) |
| 0 | 0 | 106 | 0 | 0 | 53 | [`components-alert--test-alert-site-alert-comparison`](./components-alert--test-alert-site-alert-comparison.md) |
| 0 | 0 | 0 | 54 | 0 | 50 | [`components-card--test`](./components-card--test.md) |
| 0 | 0 | 0 | 47 | 0 | 47 | [`components-card--default`](./components-card--default.md) |
| 0 | 0 | 0 | 40 | 0 | 40 | [`components-card--media`](./components-card--media.md) |
| 0 | 0 | 64 | 0 | 0 | 32 | [`components-alert--test-alerts-in-template`](./components-alert--test-alerts-in-template.md) |
| 0 | 27 | 0 | 14 | 4 | 21 | [`components-add-aspect--add-aspect`](./components-add-aspect--add-aspect.md) |
| 0 | 0 | 0 | 22 | 0 | 21 | [`components-add-aspect--test`](./components-add-aspect--test.md) |
| 0 | 0 | 0 | 12 | 0 | 12 | [`components-embed-container--embed-container`](./components-embed-container--embed-container.md) |
| 0 | 0 | 22 | 0 | 0 | 11 | [`components-accordion--test-icons`](./components-accordion--test-icons.md) |
| 0 | 27 | 0 | 0 | 0 | 9 | [`components-in-page-navigation--test-custom-content-selector`](./components-in-page-navigation--test-custom-content-selector.md) |
| 0 | 27 | 0 | 0 | 0 | 9 | [`components-in-page-navigation--test-hidden-headers`](./components-in-page-navigation--test-hidden-headers.md) |
| 0 | 0 | 18 | 0 | 0 | 9 | [`components-link--link`](./components-link--link.md) |
| 0 | 0 | 0 | 8 | 0 | 8 | [`components-footer--slim-footer`](./components-footer--slim-footer.md) |
| 0 | 0 | 16 | 0 | 0 | 8 | [`pages-documentation-page--documentation-page`](./pages-documentation-page--documentation-page.md) |
| 0 | 0 | 16 | 0 | 0 | 8 | [`pages-documentation-page--test-documentation-reorder`](./pages-documentation-page--test-documentation-reorder.md) |
| 0 | 0 | 14 | 0 | 0 | 7 | [`components-breadcrumb--default`](./components-breadcrumb--default.md) |
| 0 | 0 | 14 | 0 | 0 | 7 | [`components-breadcrumb--wrap`](./components-breadcrumb--wrap.md) |
| 0 | 0 | 12 | 0 | 0 | 6 | [`components-header--default`](./components-header--default.md) |
| 0 | 0 | 12 | 0 | 0 | 6 | [`components-header--extended`](./components-header--extended.md) |
| 0 | 0 | 12 | 0 | 0 | 6 | [`components-header--extended-megamenu`](./components-header--extended-megamenu.md) |
| 0 | 0 | 12 | 0 | 0 | 6 | [`components-header--megamenu`](./components-header--megamenu.md) |
| 0 | 0 | 12 | 0 | 0 | 6 | [`components-header-partials-primary--default`](./components-header-partials-primary--default.md) |
| 0 | 0 | 12 | 0 | 0 | 6 | [`components-header-partials-primary--megamenu`](./components-header-partials-primary--megamenu.md) |
| 0 | 0 | 12 | 0 | 0 | 6 | [`components-language-selector--in-header-example`](./components-language-selector--in-header-example.md) |
| 0 | 0 | 10 | 0 | 0 | 5 | [`components-banner--default`](./components-banner--default.md) |
| 0 | 0 | 10 | 0 | 0 | 5 | [`components-banner--default-spanish`](./components-banner--default-spanish.md) |
| 0 | 0 | 10 | 0 | 0 | 5 | [`components-banner--mil`](./components-banner--mil.md) |
| 0 | 0 | 10 | 0 | 0 | 5 | [`components-banner--mil-spanish`](./components-banner--mil-spanish.md) |
| 0 | 0 | 10 | 0 | 0 | 5 | [`pages-create-account--create-account-page`](./pages-create-account--create-account-page.md) |
| 0 | 0 | 10 | 0 | 0 | 5 | [`pages-create-account--create-account-page-spanish`](./pages-create-account--create-account-page-spanish.md) |
| 0 | 0 | 10 | 0 | 0 | 5 | [`pages-error--page-not-found`](./pages-error--page-not-found.md) |
| 0 | 0 | 10 | 0 | 0 | 5 | [`pages-error--page-not-found-spanish`](./pages-error--page-not-found-spanish.md) |
| 0 | 0 | 10 | 0 | 0 | 5 | [`pages-landing-page--landing-page`](./pages-landing-page--landing-page.md) |
| 0 | 0 | 10 | 0 | 0 | 5 | [`pages-sign-in--multiple-sign-in-page`](./pages-sign-in--multiple-sign-in-page.md) |
| 0 | 0 | 10 | 0 | 0 | 5 | [`pages-sign-in--multiple-sign-in-page-spanish`](./pages-sign-in--multiple-sign-in-page-spanish.md) |
| 0 | 0 | 10 | 0 | 0 | 5 | [`pages-sign-in--sign-in-page`](./pages-sign-in--sign-in-page.md) |
| 0 | 0 | 10 | 0 | 0 | 5 | [`pages-sign-in--sign-in-page-spanish`](./pages-sign-in--sign-in-page-spanish.md) |
| 0 | 0 | 8 | 0 | 0 | 4 | [`components-footer--big-footer`](./components-footer--big-footer.md) |
| 0 | 0 | 6 | 0 | 0 | 3 | [`components-alert--emergency`](./components-alert--emergency.md) |
| 0 | 0 | 6 | 0 | 0 | 3 | [`components-alert--error`](./components-alert--error.md) |
| 0 | 0 | 6 | 0 | 0 | 3 | [`components-alert--info`](./components-alert--info.md) |
| 0 | 0 | 6 | 0 | 0 | 3 | [`components-alert--no-header`](./components-alert--no-header.md) |
| 0 | 0 | 6 | 0 | 0 | 3 | [`components-alert--no-icon`](./components-alert--no-icon.md) |
| 0 | 0 | 6 | 0 | 0 | 3 | [`components-alert--slim`](./components-alert--slim.md) |
| 0 | 0 | 6 | 0 | 0 | 3 | [`components-alert--success`](./components-alert--success.md) |
| 0 | 0 | 6 | 0 | 0 | 3 | [`components-alert--warning`](./components-alert--warning.md) |
| 0 | 9 | 0 | 0 | 0 | 3 | [`components-form-inputs-checklist--checklist`](./components-form-inputs-checklist--checklist.md) |
| 0 | 0 | 6 | 0 | 0 | 3 | [`components-site-alert--emergency`](./components-site-alert--emergency.md) |
| 0 | 0 | 6 | 0 | 0 | 3 | [`components-site-alert--emergency-list`](./components-site-alert--emergency-list.md) |
| 0 | 0 | 6 | 0 | 0 | 3 | [`components-site-alert--emergency-no-header`](./components-site-alert--emergency-no-header.md) |
| 0 | 0 | 6 | 0 | 0 | 3 | [`components-site-alert--emergency-no-icon`](./components-site-alert--emergency-no-icon.md) |
| 0 | 0 | 6 | 0 | 0 | 3 | [`components-site-alert--emergency-slim`](./components-site-alert--emergency-slim.md) |
| 0 | 0 | 6 | 0 | 0 | 3 | [`components-site-alert--info`](./components-site-alert--info.md) |
| 0 | 0 | 6 | 0 | 0 | 3 | [`components-validation--input-validation`](./components-validation--input-validation.md) |
| 0 | 0 | 6 | 0 | 0 | 3 | [`components-validation--textarea-validation`](./components-validation--textarea-validation.md) |
| 0 | 0 | 6 | 0 | 0 | 3 | [`patterns-forms--reset-password`](./patterns-forms--reset-password.md) |
| 0 | 0 | 6 | 0 | 0 | 3 | [`patterns-forms--test-error-form-elements`](./patterns-forms--test-error-form-elements.md) |

## Mismatches by property

| Count | Property |
|---:|---|
| 300 | `background` |
| 300 | `background-position` |
| 261 | `font-family` |
| 149 | `width` |
| 52 | `height` |
| 9 | `font-size` |
| 9 | `line-height` |
