#!/usr/bin/env node
// Navigate Storybook's static build, enumerate stories via the runtime
// story store, capture the rendered #storybook-root DOM for each story
// at three viewport sizes. Writes to snapshots/<storyId>-<viewport>.html.
//
// Storybook 6.5 doesn't ship stories.json, so we enumerate by reading
// window.__STORYBOOK_PREVIEW__ inside iframe.html after it boots.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { chromium } from "playwright";

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
    const filePath = path.join(root, pathname);
    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Content-Length": stat.size,
      });
      fs.createReadStream(filePath).pipe(res);
    });
  });
}

const REPO = "/Users/jbhutch/Sites/uswds";
const SITE = path.join(REPO, "_site");
const OUT = path.join(REPO, "lightningcss-render-test", "snapshots");
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 667 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
];

const ONLY = process.argv[2]; // optional story-id filter for smoke test

async function startServer(root) {
  const server = staticServer(root);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  return { server, url: `http://127.0.0.1:${port}` };
}

async function getStoryList(page, baseUrl) {
  await page.goto(`${baseUrl}/iframe.html?id=*&viewMode=story`, { waitUntil: "networkidle" });
  // Wait for the story store to be ready. Storybook 6.5 exposes a few globals.
  await page.waitForFunction(
    () => {
      const s = window.__STORYBOOK_PREVIEW__ || window.__STORYBOOK_CLIENT_API__;
      return !!(s && (s.storyStore || s.storyStoreValue || s.raw));
    },
    { timeout: 30000 },
  );
  const stories = await page.evaluate(() => {
    // Prefer __STORYBOOK_PREVIEW__ (6.5+), fall back to CLIENT_API.
    const preview = window.__STORYBOOK_PREVIEW__;
    const clientApi = window.__STORYBOOK_CLIENT_API__;
    const store = preview?.storyStore || clientApi?.storyStore;
    if (store?.extract) {
      const data = store.extract();
      return Object.values(data).map((s) => ({ id: s.id, title: s.title, name: s.name }));
    }
    if (clientApi?.raw) {
      return clientApi.raw().map((s) => ({ id: s.id, title: s.kind, name: s.story }));
    }
    return [];
  });
  return stories;
}

async function captureStory(page, baseUrl, storyId, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  const url = `${baseUrl}/iframe.html?viewMode=story&id=${encodeURIComponent(storyId)}`;
  await page.goto(url, { waitUntil: "networkidle" });
  // Wait for the root to have content and for fonts to settle.
  await page.waitForFunction(
    () => {
      const root = document.querySelector("#storybook-root") || document.querySelector("#root");
      return !!(root && root.children.length > 0 && root.innerText !== undefined);
    },
    { timeout: 15000 },
  );
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(250);
  const html = await page.evaluate(() => {
    const root = document.querySelector("#storybook-root") || document.querySelector("#root");
    return root ? root.innerHTML : "";
  });
  return html;
}

function safeFileName(s) {
  return s.replace(/[^a-zA-Z0-9_-]+/g, "_");
}

async function main() {
  const { server, url } = await startServer(SITE);
  console.error(`serving ${SITE} at ${url}`);

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("pageerror", (err) => console.error("pageerror:", err.message));

  console.error("enumerating stories...");
  const stories = await getStoryList(page, url);
  console.error(`found ${stories.length} stories`);

  let filteredStories = stories;
  if (ONLY) {
    filteredStories = stories.filter((s) => s.id === ONLY || s.id.includes(ONLY));
    console.error(`filter "${ONLY}" matched ${filteredStories.length} stories`);
  }

  // Skip docs-only stories (no renderable body); keep everything else.
  filteredStories = filteredStories.filter((s) => !s.id.endsWith("--page"));

  let done = 0;
  for (const story of filteredStories) {
    for (const vp of VIEWPORTS) {
      try {
        const html = await captureStory(page, url, story.id, vp);
        const fn = `${safeFileName(story.id)}-${vp.name}.html`;
        fs.writeFileSync(path.join(OUT, fn), html);
      } catch (err) {
        console.error(`FAIL ${story.id} @ ${vp.name}:`, err.message);
      }
    }
    done++;
    if (done % 10 === 0) console.error(`  ${done}/${filteredStories.length}`);
  }

  await browser.close();
  server.close();
  console.error(`done: wrote ${fs.readdirSync(OUT).length} snapshots to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
