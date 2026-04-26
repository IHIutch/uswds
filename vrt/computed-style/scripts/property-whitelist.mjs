#!/usr/bin/env node
// Extract the set of CSS properties that appear as declarations in a
// min CSS file. Used to limit computed-style collection to properties
// USWDS actually sets, filtering out the ~400 defaults that would add
// noise to the diff.
//
// Usage: node property-whitelist.mjs <min.css>
// Writes to stdout, one property per line.
import fs from "node:fs";

const input = process.argv[2];
if (!input) {
  console.error("usage: property-whitelist.mjs <min.css>");
  process.exit(1);
}

const src = fs
  .readFileSync(input, "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, ""); // strip comments

// Match `property:` at the start of a declaration (after { or ; or newline)
// Skip lines that look like selectors.
const re = /[{;\n]\s*(-?[a-zA-Z_][\w-]*)\s*:/g;
const props = new Set();
let m;
while ((m = re.exec(src))) {
  const p = m[1].toLowerCase();
  // Exclude things that are actually pseudo-classes or at-rules mis-matched
  if (p.startsWith("--")) continue; // custom property; handled separately
  if (p === "var" || p === "calc" || p === "url" || p === "rgb" || p === "rgba") continue;
  props.add(p);
}

// Also include a few layout-related properties that USWDS may not explicitly
// set but are always worth checking (they propagate through inheritance).
const always = [
  "display",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "width",
  "height",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "color",
  "background-color",
  "font-size",
  "font-weight",
  "line-height",
  "text-align",
  "visibility",
  "opacity",
  "z-index",
  "box-sizing",
];
for (const p of always) props.add(p);

for (const p of [...props].sort()) console.log(p);
