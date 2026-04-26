#!/usr/bin/env node
// Print, one per line, the top-level rule-head sequence of a CSS file.
// Each line: "<kind>\t<normalized-selector-or-at-head>"
// Used to diff the global cascade ORDER between two builds.
import fs from "node:fs";

const input = process.argv[2];
const src = fs.readFileSync(input, "utf8");
const n = src.length;

function skipCommentOrString(j) {
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

function normSel(s) {
  return s.replace(/\s+/g, " ").trim();
}

let i = 0;
const out = [];
while (i < n) {
  while (i < n && /\s/.test(src[i])) i++;
  if (i >= n) break;
  const start = i;

  if (src[i] === "/" && src[i + 1] === "*") {
    const end = src.indexOf("*/", i + 2);
    i = end === -1 ? n : end + 2;
    continue; // skip top-level comments
  }

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
    // bare at-rule like @charset/@import — include it
    const head = normSel(src.slice(start, j - 1));
    if (head) out.push(`at-bare\t${head}`);
    i = j;
    continue;
  }

  const head = normSel(src.slice(start, j));
  // Walk matching brace
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

  // If this is an at-rule with a block (@media/@supports/etc.), emit the head
  // AND recurse into its body to capture inner rules with a depth prefix.
  if (head.startsWith("@")) {
    out.push(`at\t${head}`);
    // Recurse: tokenize body the same way but tag as nested
    const body = src.slice(j + 1, k - 1);
    const inner = extractInner(body);
    for (const line of inner) out.push(`  ${line}`);
    out.push(`at-end\t${head}`);
  } else {
    out.push(`rule\t${head}`);
  }
  i = k;
}

function extractInner(body) {
  const result = [];
  const m = body.length;
  let p = 0;
  function skipCS(j) {
    if (body[j] === "/" && body[j + 1] === "*") {
      const e = body.indexOf("*/", j + 2);
      return e === -1 ? m : e + 2;
    }
    if (body[j] === '"' || body[j] === "'") {
      const q = body[j];
      let k = j + 1;
      while (k < m) {
        if (body[k] === "\\") { k += 2; continue; }
        if (body[k] === q) return k + 1;
        k++;
      }
      return m;
    }
    return j;
  }
  while (p < m) {
    while (p < m && /\s/.test(body[p])) p++;
    if (p >= m) break;
    if (body[p] === "/" && body[p + 1] === "*") {
      const e = body.indexOf("*/", p + 2);
      p = e === -1 ? m : e + 2;
      continue;
    }
    const start = p;
    let q = p;
    let foundBrace = false;
    while (q < m) {
      const qq = skipCS(q);
      if (qq !== q) { q = qq; continue; }
      if (body[q] === "{") { foundBrace = true; break; }
      if (body[q] === ";") { q++; break; }
      q++;
    }
    if (!foundBrace) { p = q; continue; }
    const head = normSel(body.slice(start, q));
    let d = 1;
    let k = q + 1;
    while (k < m && d > 0) {
      const kk = skipCS(k);
      if (kk !== k) { k = kk; continue; }
      if (body[k] === "{") d++;
      else if (body[k] === "}") d--;
      k++;
    }
    result.push(`rule\t${head}`);
    p = k;
  }
  return result;
}

process.stdout.write(out.join("\n") + "\n");
