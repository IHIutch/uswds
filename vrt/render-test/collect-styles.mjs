#!/usr/bin/env node
// For each harness file and each viewport, open in Playwright against
// serve-<variant>/, walk every element, collect getComputedStyle for
// the whitelist + ::before/::after, and write a JSON per harness.
//
// Usage:
//   node collect-styles.mjs <variant> [story-filter]
//   variant ∈ {develop, lightningcss}
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { chromium } from "playwright";

const REPO = "/Users/jbhutch/Sites/uswds";
const BASE = path.join(REPO, "lightningcss-render-test");

const variant = process.argv[2];
if (!["develop", "lightningcss"].includes(variant)) {
  console.error("usage: collect-styles.mjs <develop|lightningcss> [story-filter]");
  process.exit(1);
}
const filter = process.argv[3];
const ROOT = path.join(BASE, `serve-${variant}`);
const HARNESS = path.join(ROOT, "harness");
const OUT = path.join(BASE, "results", variant);
fs.mkdirSync(OUT, { recursive: true });

const whitelist = fs
  .readFileSync(path.join(BASE, "whitelist.txt"), "utf8")
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

const VIEWPORT_DIMENSIONS = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 800 },
};

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".json": "application/json",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".otf": "font/otf",
  ".map": "application/json",
  ".ico": "image/x-icon",
};

function staticServer(root) {
  return http.createServer((req, res) => {
    let pathname = decodeURIComponent(req.url.split("?")[0]);
    if (pathname.endsWith("/")) pathname += "index.html";
    // Resolve symlinks so path.join doesn't escape root check incorrectly
    const filePath = path.join(root, pathname);
    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404);
        res.end(`not found: ${pathname}`);
        return;
      }
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      });
      fs.createReadStream(filePath).pipe(res);
    });
  });
}

async function startServer() {
  const server = staticServer(ROOT);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

function parseViewportFromFilename(fn) {
  const m = fn.match(/-(mobile|tablet|desktop)\.html$/);
  return m ? m[1] : null;
}

// Serialized in page context — must be self-contained.
function collectStylesInPage({ whitelist, originPattern }) {
  function structuralPath(el) {
    const parts = [];
    let cur = el;
    while (cur && cur.parentElement) {
      const siblings = cur.parentElement.children;
      let idx = 0;
      for (let i = 0; i < siblings.length; i++) {
        if (siblings[i] === cur) {
          idx = i;
          break;
        }
      }
      parts.unshift(String(idx));
      cur = cur.parentElement;
    }
    return parts.join(".");
  }

  function normalize(value) {
    if (value == null) return value;
    // Strip origin from url(...) values so two runs on different ports align.
    return String(value).replace(new RegExp(originPattern, "g"), "");
  }

  function pickStyles(el, pseudo) {
    const cs = getComputedStyle(el, pseudo || null);
    const out = {};
    for (const prop of whitelist) {
      const v = cs.getPropertyValue(prop);
      if (v) out[prop] = normalize(v);
    }
    return out;
  }

  const all = document.querySelectorAll("*");
  const result = [];
  for (const el of all) {
    const entry = {
      path: structuralPath(el),
      tag: el.tagName.toLowerCase(),
      classes: el.className && typeof el.className === "string" ? el.className : "",
      base: pickStyles(el, null),
    };
    const before = pickStyles(el, "::before");
    const after = pickStyles(el, "::after");
    if (Object.keys(before).length) entry.before = before;
    if (Object.keys(after).length) entry.after = after;
    result.push(entry);
  }
  return result;
}

async function main() {
  const { server, url } = await startServer();
  console.error(`[${variant}] serving ${ROOT} at ${url}`);

  const browser = await chromium.launch();
  // One persistent context per viewport so the HTTP cache warms up
  // and we don't re-download the CSS/fonts for every file.
  const contexts = new Map();
  for (const [name, dims] of Object.entries(VIEWPORT_DIMENSIONS)) {
    const ctx = await browser.newContext({ viewport: dims });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.error(`[${variant}][${name}] pageerror:`, e.message));
    page.on("requestfailed", (req) => {
      if (!req.url().includes("favicon")) {
        console.error(
          `[${variant}][${name}] request failed: ${req.url()} ${req.failure()?.errorText}`,
        );
      }
    });
    contexts.set(name, { page });
  }

  const files = fs
    .readdirSync(HARNESS)
    .filter((f) => f.endsWith(".html"))
    .filter((f) => !filter || f.includes(filter));

  console.error(`[${variant}] processing ${files.length} harness files`);

  const originPattern = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  let done = 0;
  for (const f of files) {
    const vp = parseViewportFromFilename(f);
    if (!vp) continue;
    const { page } = contexts.get(vp);
    const harnessUrl = `${url}/harness/${encodeURIComponent(f)}`;
    try {
      await page.goto(harnessUrl, { waitUntil: "load", timeout: 10000 });
      // Force all @font-face declarations to load to completion so `ex`
      // and text-metric-dependent values are deterministic across runs.
      await page.evaluate(async () => {
        if (!document.fonts) return;
        // Find every font-family referenced in stylesheets and pre-load it
        // at 1rem so the font files are fetched & parsed before measurement.
        const fams = new Set();
        for (const sheet of document.styleSheets) {
          let rules;
          try {
            rules = sheet.cssRules;
          } catch {
            continue;
          }
          if (!rules) continue;
          for (const rule of rules) {
            if (rule.type === 5 /* CSSRule.FONT_FACE_RULE */ && rule.style) {
              const ff = rule.style.getPropertyValue("font-family");
              if (ff) fams.add(ff.replace(/["']/g, "").trim());
            }
          }
        }
        const loads = [...fams].map((f) =>
          document.fonts.load(`16px "${f}"`).catch(() => null),
        );
        await Promise.all(loads);
        await document.fonts.ready;
      });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
      const result = await page.evaluate(collectStylesInPage, { whitelist, originPattern });
      const outFile = path.join(OUT, f.replace(/\.html$/, ".json"));
      fs.writeFileSync(outFile, JSON.stringify(result));
    } catch (err) {
      console.error(`[${variant}] FAIL ${f}:`, err.message);
    }
    done++;
    if (done % 50 === 0) console.error(`[${variant}]  ${done}/${files.length}`);
  }

  await browser.close();
  server.close();
  console.error(`[${variant}] done: wrote ${fs.readdirSync(OUT).length} JSON files to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
