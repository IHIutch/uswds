#!/usr/bin/env node
// Split a pretty-printed CSS file into per-component buckets.
// Usage: node split.mjs <input.css> <outdir>
import fs from "node:fs";
import path from "node:path";

const [, , input, outdir] = process.argv;
if (!input || !outdir) {
  console.error("usage: split.mjs <input.css> <outdir>");
  process.exit(1);
}
fs.mkdirSync(outdir, { recursive: true });

const src = fs.readFileSync(input, "utf8");

// Walk at brace depth 0, extract top-level blocks (rules + at-rules).
// Each block = text from previous boundary up to and including the matching `}`
// (or up to `;` for at-rules without a block like @charset, @import).
const blocks = [];
let i = 0;
const n = src.length;

function skipCommentOrString(j) {
  // Returns index after comment/string if starting at j, else j.
  if (src[j] === "/" && src[j + 1] === "*") {
    const end = src.indexOf("*/", j + 2);
    return end === -1 ? n : end + 2;
  }
  if (src[j] === '"' || src[j] === "'") {
    const q = src[j];
    let k = j + 1;
    while (k < n) {
      if (src[k] === "\\") { k += 2; continue; }
      if (src[k] === q) return k + 1;
      k++;
    }
    return n;
  }
  return j;
}

while (i < n) {
  // skip leading whitespace
  while (i < n && /\s/.test(src[i])) i++;
  if (i >= n) break;
  const start = i;

  // Top-level comment becomes its own block
  if (src[i] === "/" && src[i + 1] === "*") {
    const end = src.indexOf("*/", i + 2);
    i = end === -1 ? n : end + 2;
    blocks.push(src.slice(start, i));
    continue;
  }

  // Scan until we find `{` or `;` at depth 0 (respecting strings/comments)
  let j = i;
  let foundBrace = false;
  while (j < n) {
    const jj = skipCommentOrString(j);
    if (jj !== j) { j = jj; continue; }
    const c = src[j];
    if (c === "{") { foundBrace = true; break; }
    if (c === ";") { j++; break; }
    j++;
  }

  if (!foundBrace) {
    blocks.push(src.slice(start, j));
    i = j;
    continue;
  }

  // Found `{` at j. Walk to matching `}`.
  let depth = 1;
  let k = j + 1;
  while (k < n && depth > 0) {
    const kk = skipCommentOrString(k);
    if (kk !== k) { k = kk; continue; }
    const c = src[k];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    k++;
  }
  blocks.push(src.slice(start, k));
  i = k;
}

// Classify each block into a bucket.
function bucketFor(block) {
  const trimmed = block.trim();
  if (trimmed.startsWith("/*")) return "_comments";
  if (trimmed.startsWith("@")) {
    // Look for nested usa-*/usds-* class reference anywhere in the block.
    const m = trimmed.match(/\.(usa-[a-z0-9-]+|usds-[a-z0-9-]+)/);
    if (m) {
      // Chop to base component name: usa-accordion__button -> usa-accordion
      return m[1].split("__")[0].split("--")[0];
    }
    // At-rule without component reference
    const at = trimmed.match(/^@([a-z-]+)/);
    return at ? `_at-${at[1]}` : "_global";
  }
  // Regular rule: find first .usa-*/.usds-* in selector list.
  const selectorEnd = trimmed.indexOf("{");
  const selectors = trimmed.slice(0, selectorEnd);
  const m = selectors.match(/\.(usa-[a-z0-9-]+|usds-[a-z0-9-]+)/);
  if (m) return m[1].split("__")[0].split("--")[0];
  return "_global";
}

const buckets = new Map();
for (const b of blocks) {
  const name = bucketFor(b);
  if (!buckets.has(name)) buckets.set(name, []);
  buckets.get(name).push(b);
}

for (const [name, arr] of buckets) {
  const out = arr.join("\n\n") + "\n";
  fs.writeFileSync(path.join(outdir, `${name}.css`), out);
}

console.log(`wrote ${buckets.size} buckets to ${outdir}`);
