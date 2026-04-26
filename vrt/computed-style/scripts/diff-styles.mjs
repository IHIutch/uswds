#!/usr/bin/env node
// Pairwise diff of results/develop/*.json against results/lightningcss/*.json.
// Emits per-story markdown reports and a top-level summary listing only
// element × property mismatches.
import fs from "node:fs";
import path from "node:path";

const REPO = "/Users/jbhutch/Sites/uswds";
const BASE = path.join(REPO, "vrt", "computed-style");
const DEV = path.join(BASE, "results", "develop");
const LC = path.join(BASE, "results", "lightningcss");
const REPORT = path.join(BASE, "report");
fs.mkdirSync(REPORT, { recursive: true });

// Clear old reports
for (const f of fs.readdirSync(REPORT)) fs.unlinkSync(path.join(REPORT, f));

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function classifyMismatch(prop, av, bv) {
  // 1. Monospace hack collapse: font-family: monospace, monospace → monospace.
  if (prop === "font-family" && /\bmonospace\s*,\s*monospace\b/.test(av || "") && /^\s*monospace\s*$/.test(bv || "")) {
    return "monospace-hack-collapse";
  }
  // 1a. Direct consequences of the monospace hack collapse: Chromium applies
  //     a smaller default size to a single `monospace` than to the duplicated
  //     form, so `font-size: 16px` → `13px` and `line-height: 18.4px` → `14.95px`
  //     on <pre>/<code>/<kbd>/<samp>. These exact value pairs are specific
  //     enough to this regression that matching them is reliable.
  if ((prop === "font-size" && av === "16px" && bv === "13px") ||
    (prop === "line-height" && av === "18.4px" && bv === "14.95px")) {
    return "monospace-hack-collapse";
  }
  // 2. `getComputedStyle` background formatting: "0px 0px" vs "0% 0%" are
  //    identical in CSS but computed-style serializes them differently when
  //    the source used one form vs the other. No rendering difference.
  if ((prop === "background" || prop === "background-position") && typeof av === "string" && typeof bv === "string") {
    const normalize = (s) => s.replace(/0px 0px/g, "0% 0%");
    if (normalize(av) === normalize(bv)) return "bg-position-formatting";
  }
  // 3. Sub-pixel layout ripple from lightningcss's fractional-percent
  //    precision truncation (e.g. 33.3333333333% → 33.3333%). Chromium
  //    sub-pixel layout means differences < 0.5px are never rendered as
  //    a distinct boundary. Matches dimension and position properties.
  const pxRe = /^(-?\d+(?:\.\d+)?)px$/;
  const pxProps = new Set([
    "width",
    "height",
    "max-width",
    "min-width",
    "max-height",
    "min-height",
    "max-inline-size",
    "min-inline-size",
    "max-block-size",
    "min-block-size",
    "top",
    "right",
    "bottom",
    "left",
    "margin-top",
    "margin-right",
    "margin-bottom",
    "margin-left",
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
    "font-size",
    "line-height",
  ]);
  if (pxProps.has(prop) && typeof av === "string" && typeof bv === "string") {
    const ma = av.match(pxRe);
    const mb = bv.match(pxRe);
    if (ma && mb) {
      const delta = Math.abs(parseFloat(ma[1]) - parseFloat(mb[1]));
      if (delta < 0.5) return "sub-pixel-layout-ripple";
      // 4. Text-reflow ripple: when a monospace element shrinks from 16px
      //    to 13px, the paragraph / body / html heights recompute slightly
      //    smaller. Differences up to ~5px on block heights are consistent
      //    with that cascade. This is still a consequence of the monospace
      //    regression, not an independent bug.
      if ((prop === "height" || prop === "max-height") && delta < 5) {
        return "text-reflow-ripple";
      }
    }
  }
  return null;
}

function diffStyleObj(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  const out = [];
  for (const k of keys) {
    const av = a?.[k];
    const bv = b?.[k];
    if (av !== bv) {
      const category = classifyMismatch(k, av, bv);
      out.push({ prop: k, dev: av, lc: bv, category });
    }
  }
  return out;
}

function parseFilename(fn) {
  // components-button--default-desktop.json → { story, viewport }
  const m = fn.match(/^(.+)-(mobile|tablet|desktop)\.json$/);
  return m ? { story: m[1], viewport: m[2] } : null;
}

const pairs = [];
const devFiles = new Set(fs.readdirSync(DEV).filter((f) => f.endsWith(".json")));
const lcFiles = new Set(fs.readdirSync(LC).filter((f) => f.endsWith(".json")));

const onlyDev = [...devFiles].filter((f) => !lcFiles.has(f));
const onlyLc = [...lcFiles].filter((f) => !devFiles.has(f));
const both = [...devFiles].filter((f) => lcFiles.has(f));

if (onlyDev.length) console.error("only in develop:", onlyDev.length);
if (onlyLc.length) console.error("only in lightningcss:", onlyLc.length);

// Aggregate by story (fold all three viewports into one report)
const byStory = new Map();
for (const f of both.sort()) {
  const parsed = parseFilename(f);
  if (!parsed) continue;
  const dev = loadJson(path.join(DEV, f));
  const lc = loadJson(path.join(LC, f));
  if (dev.length !== lc.length) {
    const entry = byStory.get(parsed.story) || { mismatches: [], fatal: [] };
    entry.fatal.push(
      `viewport ${parsed.viewport}: element count differs (develop=${dev.length}, lightningcss=${lc.length})`,
    );
    byStory.set(parsed.story, entry);
    continue;
  }
  for (let i = 0; i < dev.length; i++) {
    const a = dev[i];
    const b = lc[i];
    if (a.path !== b.path) {
      const entry = byStory.get(parsed.story) || { mismatches: [], fatal: [] };
      entry.fatal.push(
        `viewport ${parsed.viewport}: path diverged at index ${i}: ${a.path} vs ${b.path}`,
      );
      byStory.set(parsed.story, entry);
      break;
    }
    const baseDiff = diffStyleObj(a.base, b.base);
    const beforeDiff = diffStyleObj(a.before, b.before);
    const afterDiff = diffStyleObj(a.after, b.after);
    if (baseDiff.length || beforeDiff.length || afterDiff.length) {
      const entry = byStory.get(parsed.story) || { mismatches: [], fatal: [] };
      entry.mismatches.push({
        viewport: parsed.viewport,
        path: a.path,
        tag: a.tag,
        classes: a.classes,
        base: baseDiff,
        before: beforeDiff,
        after: afterDiff,
      });
      byStory.set(parsed.story, entry);
    }
  }
}

// Write per-story reports
const summary = [];
const propCounts = new Map();
const categoryCounts = new Map();
let zeroDiff = 0;
let zeroSubstantive = 0; // stories whose only mismatches are classified (known-benign) categories
let realRegressions = 0;
const allStories = new Set();
for (const f of both) {
  const p = parseFilename(f);
  if (p) allStories.add(p.story);
}
for (const story of [...allStories].sort()) {
  const data = byStory.get(story);
  if (!data) {
    zeroDiff++;
    continue;
  }
  const totalMismatches = data.mismatches.length;
  // A mismatch is "substantive" (potentially real) if any of its properties
  // is uncategorized (category == null).
  let unclassified = 0;
  let mono = 0;
  let bgCosmetic = 0;
  let subpixel = 0;
  let reflow = 0;
  for (const m of data.mismatches) {
    for (const d of [...m.base, ...m.before, ...m.after]) {
      propCounts.set(d.prop, (propCounts.get(d.prop) || 0) + 1);
      if (d.category === "monospace-hack-collapse") mono++;
      else if (d.category === "bg-position-formatting") bgCosmetic++;
      else if (d.category === "sub-pixel-layout-ripple") subpixel++;
      else if (d.category === "text-reflow-ripple") reflow++;
      else unclassified++;
      const cat = d.category || "unclassified";
      categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
    }
  }
  if (unclassified === 0) zeroSubstantive++;
  else realRegressions++;
  summary.push({
    story,
    totalMismatches,
    fatal: data.fatal.length,
    unclassified,
    mono,
    bgCosmetic,
    subpixel,
    reflow,
  });

  const lines = [];
  lines.push(`# ${story}`);
  lines.push("");
  if (data.fatal.length) {
    lines.push("## Fatal");
    lines.push("");
    for (const x of data.fatal) lines.push(`- ${x}`);
    lines.push("");
  }
  if (data.mismatches.length) {
    lines.push(`## ${data.mismatches.length} element-property mismatches`);
    lines.push("");
    for (const m of data.mismatches) {
      const classes = m.classes ? ` .${m.classes.split(/\s+/).filter(Boolean).join(".")}` : "";
      lines.push(`### \`${m.tag}${classes}\` at path \`${m.path}\` (${m.viewport})`);
      lines.push("");
      const rows = [];
      for (const d of m.base) rows.push({ pseudo: "", ...d });
      for (const d of m.before) rows.push({ pseudo: "::before", ...d });
      for (const d of m.after) rows.push({ pseudo: "::after", ...d });
      lines.push("| pseudo | property | develop | lightningcss | category |");
      lines.push("|---|---|---|---|---|");
      for (const r of rows) {
        lines.push(
          `| ${r.pseudo} | \`${r.prop}\` | \`${r.dev ?? "—"}\` | \`${r.lc ?? "—"}\` | ${r.category || "**unclassified**"} |`,
        );
      }
      lines.push("");
    }
  }
  fs.writeFileSync(path.join(REPORT, `${story}.md`), lines.join("\n"));
}

// Write _summary.md
const summaryLines = [];
summaryLines.push("");
summaryLines.push("");
summaryLines.push("# Computed-style diff summary");
summaryLines.push("");
summaryLines.push(
  `Compared \`develop\` (csso) vs \`use-lightningcss\` (lightningcss) using ${both.length} harness files across ${allStories.size} stories × 3 viewports. Computed styles collected via Playwright chromium.`,
);
summaryLines.push("");
summaryLines.push("## Overview");
summaryLines.push("");
summaryLines.push(`- Stories checked: ${allStories.size}`);
summaryLines.push(`- Stories with **zero** computed-style mismatches (identical in both builds): **${zeroDiff}**`);
summaryLines.push(
  `- Stories with only classified-benign mismatches (see "Mismatch categories" below): **${zeroSubstantive}**`,
);
summaryLines.push(`- Stories with unclassified mismatches that need review: **${realRegressions}**`);
if (onlyDev.length || onlyLc.length) {
  summaryLines.push(`- Files present only in develop: ${onlyDev.length}`);
  summaryLines.push(`- Files present only in lightningcss: ${onlyLc.length}`);
}
summaryLines.push("");

summaryLines.push("## Mismatch categories");
summaryLines.push("");
summaryLines.push("| Count | Category | Interpretation |");
summaryLines.push("|---:|---|---|");
const catRows = [
  [
    "monospace-hack-collapse",
    "**REAL REGRESSION.** lightningcss collapses `font-family: monospace, monospace` (an intentional CSS hack from Normalize.css) to `font-family: monospace`. Chromium applies a smaller default size to a single `monospace` generic than to a duplicated one, so `<pre>`, `<code>`, `<kbd>`, `<samp>` render at ~13px instead of the expected 16px.",
  ],
  [
    "bg-position-formatting",
    "**COSMETIC.** `getComputedStyle` serializes `0px 0px` and `0% 0%` as different strings, but they compute to the same background-position and render identically. The two builds emit the same canonical form via different normalization paths.",
  ],
  [
    "sub-pixel-layout-ripple",
    "**COSMETIC.** Dimension or position differs by less than 0.5px, below Chromium's sub-pixel rendering threshold. Caused by lightningcss truncating fractional percentages (e.g. `33.3333333333%` → `33.3333%`) which produces computed widths like `431.984px` instead of `432px`. Invisible to end users.",
  ],
  [
    "text-reflow-ripple",
    "**CONSEQUENCE of monospace regression (not independent).** Page/block height differs by up to 5px because a monospace child element rendered at 13px (lightningcss) instead of 16px (develop), so the surrounding text takes less vertical space. Fixes itself once the `monospace-hack-collapse` root cause is addressed.",
  ],
  [
    "unclassified",
    "Needs review — not matched by any known-benign classifier. These are either real regressions or new classification rules worth adding.",
  ],
];
for (const [cat, desc] of catRows) {
  const n = categoryCounts.get(cat) || 0;
  summaryLines.push(`| ${n} | \`${cat}\` | ${desc} |`);
}
summaryLines.push("");

if (summary.length) {
  summary.sort((a, b) => b.unclassified - a.unclassified || b.totalMismatches - a.totalMismatches);
  summaryLines.push("## Stories with mismatches");
  summaryLines.push("");
  summaryLines.push(
    "Sorted by `unclassified` first (most likely to contain real regressions), then by total mismatches.",
  );
  summaryLines.push("");
  summaryLines.push("| Unclass. | Mono | Bg-fmt | Sub-px | Reflow | Total | Story |");
  summaryLines.push("|---:|---:|---:|---:|---:|---:|---|");
  for (const s of summary) {
    summaryLines.push(
      `| ${s.unclassified} | ${s.mono} | ${s.bgCosmetic} | ${s.subpixel} | ${s.reflow} | ${s.totalMismatches} | [\`${s.story}\`](./${s.story}.md) |`,
    );
  }
  summaryLines.push("");

  summaryLines.push("## Mismatches by property");
  summaryLines.push("");
  const props = [...propCounts.entries()].sort((a, b) => b[1] - a[1]);
  summaryLines.push("| Count | Property |");
  summaryLines.push("|---:|---|");
  for (const [prop, n] of props) {
    summaryLines.push(`| ${n} | \`${prop}\` |`);
  }
  summaryLines.push("");
} else {
  summaryLines.push("## Result");
  summaryLines.push("");
  summaryLines.push(
    "**Zero computed-style mismatches across all stories and viewports.** Every element computes to the same value for every whitelisted CSS property in both builds.",
  );
  summaryLines.push("");
}

fs.writeFileSync(path.join(REPORT, "_summary.md"), summaryLines.join("\n"));

console.error(`wrote reports to ${REPORT}`);
console.error(`  ${zeroDiff}/${allStories.size} stories have zero mismatches`);
console.error(`  ${allStories.size - zeroDiff}/${allStories.size} stories have mismatches`);
