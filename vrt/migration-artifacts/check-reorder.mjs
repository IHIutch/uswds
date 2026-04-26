#!/usr/bin/env node
// Detect dangerous declaration-order patterns in a pretty-printed CSS file:
//  1) Duplicate-property fallbacks: same prop twice in one rule (2nd is intended winner)
//  2) Shorthand-then-longhand: shorthand `font`/`animation`/`background`/etc. followed
//     later in same rule by a longhand that the shorthand would reset.
// Usage: node check-reorder.mjs <pretty.css>
import fs from "node:fs";

const input = process.argv[2];
const src = fs.readFileSync(input, "utf8");

// Strip comments to simplify
const noComments = src.replace(/\/\*[\s\S]*?\*\//g, "");

// Walk top-level rules; for nested at-rules, just recurse by finding inner `{...}` blocks.
const rules = [];
let i = 0;
const n = noComments.length;
function findMatchingBrace(start) {
  let d = 1;
  let k = start + 1;
  while (k < n && d > 0) {
    const c = noComments[k];
    if (c === "{") d++;
    else if (c === "}") d--;
    k++;
  }
  return k;
}
// Collect all innermost rule bodies (bodies that contain no nested `{`)
function walk(start, end) {
  let p = start;
  while (p < end) {
    const brace = noComments.indexOf("{", p);
    if (brace === -1 || brace >= end) break;
    const close = findMatchingBrace(brace);
    const body = noComments.slice(brace + 1, close - 1);
    if (!body.includes("{")) {
      // innermost
      const head = noComments.slice(p, brace).trim();
      rules.push({ selector: head, body });
    } else {
      walk(brace + 1, close - 1);
    }
    p = close;
  }
}
walk(0, n);

// Shorthand → set of longhands it resets
const SHORTHANDS = {
  font: [
    "font-style",
    "font-variant",
    "font-variant-caps",
    "font-variant-numeric",
    "font-variant-ligatures",
    "font-variant-alternates",
    "font-variant-east-asian",
    "font-variant-position",
    "font-weight",
    "font-stretch",
    "font-size",
    "line-height",
    "font-family",
    "font-size-adjust",
    "font-kerning",
    "font-feature-settings",
    "font-language-override",
    "font-optical-sizing",
  ],
  background: [
    "background-image",
    "background-position",
    "background-size",
    "background-repeat",
    "background-attachment",
    "background-origin",
    "background-clip",
    "background-color",
  ],
  animation: [
    "animation-name",
    "animation-duration",
    "animation-timing-function",
    "animation-delay",
    "animation-iteration-count",
    "animation-direction",
    "animation-fill-mode",
    "animation-play-state",
    "animation-timeline",
    "animation-range",
    "animation-range-start",
    "animation-range-end",
  ],
  transition: [
    "transition-property",
    "transition-duration",
    "transition-timing-function",
    "transition-delay",
    "transition-behavior",
  ],
  border: [
    "border-width",
    "border-style",
    "border-color",
    "border-top",
    "border-right",
    "border-bottom",
    "border-left",
  ],
  margin: ["margin-top", "margin-right", "margin-bottom", "margin-left"],
  padding: ["padding-top", "padding-right", "padding-bottom", "padding-left"],
  flex: ["flex-grow", "flex-shrink", "flex-basis"],
  grid: [
    "grid-template-rows",
    "grid-template-columns",
    "grid-template-areas",
    "grid-auto-rows",
    "grid-auto-columns",
    "grid-auto-flow",
  ],
  mask: [
    "mask-image",
    "mask-mode",
    "mask-repeat",
    "mask-position",
    "mask-clip",
    "mask-origin",
    "mask-size",
    "mask-composite",
  ],
  "list-style": ["list-style-type", "list-style-image", "list-style-position"],
  "text-decoration": [
    "text-decoration-line",
    "text-decoration-style",
    "text-decoration-color",
    "text-decoration-thickness",
  ],
};

let dupCount = 0;
let shortLongCount = 0;
const dupFindings = [];
const shortLongFindings = [];

for (const { selector, body } of rules) {
  // Parse declarations: split by `;` at depth 0 (respect parens)
  const decls = [];
  let depth = 0;
  let buf = "";
  for (const c of body) {
    if (c === "(") depth++;
    else if (c === ")") depth--;
    if (c === ";" && depth === 0) {
      if (buf.trim()) decls.push(buf.trim());
      buf = "";
    } else buf += c;
  }
  if (buf.trim()) decls.push(buf.trim());

  const props = decls.map((d) => {
    const colon = d.indexOf(":");
    return colon === -1 ? "" : d.slice(0, colon).trim().toLowerCase();
  });

  // 1) duplicates
  const seen = new Map();
  for (let k = 0; k < props.length; k++) {
    const p = props[k];
    if (!p) continue;
    if (seen.has(p)) {
      dupCount++;
      dupFindings.push({ selector, prop: p, first: decls[seen.get(p)], second: decls[k] });
    }
    seen.set(p, k);
  }

  // 2) shorthand followed by longhand (in source order)
  for (let k = 0; k < props.length; k++) {
    const p = props[k];
    const longhands = SHORTHANDS[p];
    if (!longhands) continue;
    for (let m = k + 1; m < props.length; m++) {
      if (longhands.includes(props[m])) {
        shortLongCount++;
        shortLongFindings.push({
          selector,
          shorthand: decls[k],
          longhand: decls[m],
        });
      }
    }
  }
}

console.log(`rules scanned: ${rules.length}`);
console.log(`duplicate-property findings: ${dupCount}`);
console.log(`shorthand-then-longhand findings: ${shortLongCount}`);
if (dupCount) {
  console.log("\n--- duplicate properties (first 20) ---");
  for (const f of dupFindings.slice(0, 20)) {
    console.log(`  ${f.selector}  [${f.prop}]`);
    console.log(`    1st: ${f.first}`);
    console.log(`    2nd: ${f.second}`);
  }
}
if (shortLongCount) {
  console.log("\n--- shorthand → longhand (first 20) ---");
  for (const f of shortLongFindings.slice(0, 20)) {
    console.log(`  ${f.selector}`);
    console.log(`    shorthand: ${f.shorthand}`);
    console.log(`    longhand : ${f.longhand}`);
  }
}
