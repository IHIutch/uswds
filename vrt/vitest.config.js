import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import { createReadStream, statSync, existsSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

// MIME map for the static storybook build server below.
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".map": "application/json; charset=utf-8",
};

// Same-origin path so test code can reach into the storybook iframe DOM.
const SITE_PREFIX = "/__vrt_site__/";

// Serves _site/ on Vitest's dev origin under SITE_PREFIX.
const serveSite = () => ({
  name: "vrt-serve-site",
  configureServer(server) {
    const siteDir = resolve(process.cwd(), "_site");
    server.middlewares.use(SITE_PREFIX, (req, res, next) => {
      try {
        const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
        let filePath = normalize(join(siteDir, urlPath));
        if (!filePath.startsWith(siteDir)) { res.statusCode = 403; res.end(); return; }
        if (existsSync(filePath) && statSync(filePath).isDirectory()) {
          filePath = join(filePath, "index.html");
        }
        if (!existsSync(filePath)) { next(); return; }
        res.setHeader("Content-Type", MIME[extname(filePath)] || "application/octet-stream");
        res.setHeader("Cache-Control", "no-store");
        createReadStream(filePath).pipe(res);
      } catch (err) {
        res.statusCode = 500;
        res.end(String(err));
      }
    });
  },
});

// Vitest config — browser mode, two viewports, screenshot comparator.
export default defineConfig({
  plugins: [serveSite()],
  test: {
    include: ["vrt/**/*.test.js"],
    globalSetup: ["vrt/setup/global-setup.js"],
    attachmentsDir: "vrt/.vitest-attachments",
    testTimeout: 60_000,
    hookTimeout: 120_000,
    browser: {
      enabled: true,
      // 2x DPR to capture Retina-resolution screenshots.
      provider: playwright({ contextOptions: { deviceScaleFactor: 2 } }),
      headless: true,
      instances: [
        {
          browser: "chromium",
          name: "chromium-mobile",
          // Tall mobile viewport so long stories aren't cropped.
          viewport: { width: 320, height: 2400 },
        },
        {
          browser: "chromium",
          name: "chromium-desktop",
          viewport: { width: 1024, height: 800 },
        },
      ],
      expect: {
        toMatchScreenshot: {
          comparatorName: "pixelmatch",
          // Tolerate sub-pixel antialiasing noise across re-renders.
          comparatorOptions: {
            allowedMismatchedPixelRatio: 0.005,
          },
        },
      },
    },
  },
});
