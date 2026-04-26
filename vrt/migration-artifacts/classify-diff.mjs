#!/usr/bin/env node
// Classify every +/- line in min-diffs/*.diff into change categories
// and print counts sorted descending.
import fs from "node:fs";
import path from "node:path";

const diffDir = process.argv[2];
if (!diffDir) {
  console.error("usage: classify-diff.mjs <min-diffs-dir>");
  process.exit(1);
}

// Collect all -/+ lines (not ---/+++ headers, not @@ hunks, not empty)
const removed = [];
const added = [];
for (const f of fs.readdirSync(diffDir)) {
  if (!f.endsWith(".diff")) continue;
  const lines = fs.readFileSync(path.join(diffDir, f), "utf8").split("\n");
  for (const line of lines) {
    if (line.startsWith("---") || line.startsWith("+++")) continue;
    if (line.startsWith("@@")) continue;
    const trimmed = line.slice(1).trim();
    if (!trimmed) continue;
    if (line.startsWith("-")) removed.push(trimmed);
    else if (line.startsWith("+")) added.push(trimmed);
  }
}

// Classification functions. Applied in order — first match wins.
const rules = [
  {
    name: "Vendor prefix dropped (-moz-*, -webkit-appearance, -o-*)",
    test: (l, side) =>
      side === "-" &&
      /^-(moz-|o-|webkit-appearance|webkit-mask-position: center center|webkit-mask-repeat)/.test(l),
  },
  {
    name: "Vendor prefix value normalized (-webkit-mask-position: 50%, etc.)",
    test: (l, side) => side === "+" && /^-webkit-mask/.test(l),
  },
  {
    name: "Media query range syntax (width >= N / width <= N)",
    test: (l) => /^@media[^{]*\bwidth\s*[<>]=/.test(l),
  },
  {
    name: "Media query legacy syntax (min-width / max-width)",
    test: (l) => /^@media[^{]*\b(min|max)-width:/.test(l),
  },
  {
    name: "Pseudo-element :: → :",
    test: (l, side) => side === "+" && /:(after|before)\b/.test(l) && !/::(after|before)/.test(l),
  },
  {
    name: "Pseudo-element ::after / ::before",
    test: (l, side) => side === "-" && /::(after|before)\b/.test(l),
  },
  {
    name: "Color: rgba()/rgb() removed",
    test: (l, side) => side === "-" && /\brgba?\(/.test(l),
  },
  {
    name: "Color: 8-digit hex (#RRGGBBAA) added",
    test: (l, side) => side === "+" && /#[0-9a-f]{8}\b/i.test(l),
  },
  {
    name: "Color: named (white/black/etc.) removed",
    test: (l, side) => side === "-" && /:\s*(white|black|red|blue|green|gray|grey|transparent)\b/i.test(l),
  },
  {
    name: "Color: 3/6-digit hex added",
    test: (l, side) => side === "+" && /:\s*#[0-9a-f]{3,6}\b/i.test(l),
  },
  {
    name: "Position value: center center → 50% (or center)",
    test: (l) => /:\s*(center\s+center|50%\s+50%)\b/.test(l),
  },
  {
    name: "Zero-with-unit (0px / 0rem / 0em)",
    test: (l) => /\b0(px|rem|em)\b/.test(l),
  },
  {
    name: "url() quoting change",
    test: (l) => /\burl\(/.test(l),
  },
  {
    name: "@font-face font-family quote change",
    test: (l) => /font-family:\s*["']?[A-Z]/.test(l),
  },
  {
    name: "@charset / banner comment",
    test: (l) => /^(@charset|\/\*!? uswds)/.test(l),
  },
  {
    name: "Selector line (rule head, no body)",
    test: (l) => /[,{]\s*$/.test(l) && !/:/.test(l.split(/[,{]/)[0] || ""),
  },
  {
    name: "Rule close brace",
    test: (l) => l === "}",
  },
  {
    name: "Declaration reordering / formatting (everything else)",
    test: () => true,
  },
];

function classify(line, side) {
  for (const r of rules) {
    if (r.test(line, side)) return r.name;
  }
  return "Declaration reordering / formatting (everything else)";
}

const counts = new Map();
for (const l of removed) {
  const k = classify(l, "-");
  counts.set(k, (counts.get(k) || 0) + 1);
}
for (const l of added) {
  const k = classify(l, "+");
  counts.set(k, (counts.get(k) || 0) + 1);
}

const total = removed.length + added.length;
const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);

console.log(`Total changed lines: ${total} (${removed.length} removed, ${added.length} added)\n`);
console.log("Category".padEnd(62) + "Count    %");
console.log("-".repeat(80));
for (const [cat, n] of sorted) {
  const pct = ((n / total) * 100).toFixed(1).padStart(5);
  console.log(cat.padEnd(62) + String(n).padStart(5) + "    " + pct);
}
