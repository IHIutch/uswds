import { describe, test, expect, inject, beforeAll } from "vitest";
import { page } from "vitest/browser";

// Same-origin path where the storybook build is mounted (see vitest.config.js).
const SITE_PREFIX = "/__vrt_site__";

// Globals injected by the global-setup hook.
const phase = inject("vrtPhase");
const storyIds = inject("vrtStoryIds");
const baselineCss = inject("vrtBaselineCss");
const candidateCss = inject("vrtCandidateCss");
const cssToInject = phase === "baseline" ? baselineCss : candidateCss;

// Renders one storybook story into the test document, stripped of storybook chrome.
const loadStory = async (storyId) => {
  // Reset previous story.
  document.head.querySelectorAll("style.vrt-css").forEach((el) => el.remove());
  document.body.innerHTML = "";
  document.body.style.cssText = "margin:0;padding:0;background:#fff";

  // Hidden iframe just long enough to extract rendered DOM — skips storybook UI.
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;border:0;opacity:0;pointer-events:none";
  iframe.src = `${SITE_PREFIX}/iframe.html?id=${encodeURIComponent(storyId)}&viewMode=story`;
  document.body.appendChild(iframe);

  // Wait for the iframe document to load.
  await new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error(`iframe load timeout for ${storyId}`)), 30_000);
    iframe.addEventListener("load", () => { clearTimeout(to); resolve(); }, { once: true });
  });

  const doc = iframe.contentDocument;

  // Storybook can fire `load` before the story renders; poll until #root is populated.
  await new Promise((resolve, reject) => {
    const deadline = Date.now() + 30_000;
    const tick = () => {
      const root = doc.querySelector("#storybook-root, #root");
      if (root && root.childElementCount > 0) return resolve();
      if (Date.now() > deadline) return reject(new Error(`story root never populated: ${storyId}`));
      setTimeout(tick, 50);
    };
    tick();
  });

  // Snapshot rendered HTML, drop the iframe.
  const storyRoot = doc.querySelector("#storybook-root, #root");
  const storyHtml = storyRoot.innerHTML;
  iframe.remove();

  // Resolves @font-face url(../fonts/...) declarations relative to dist/css/.
  if (!document.querySelector("base.vrt-base")) {
    const base = document.createElement("base");
    base.className = "vrt-base";
    base.href = `${SITE_PREFIX}/css/`;
    document.head.prepend(base);
  }

  // Inject the phase's CSS plus animation/transition kill switch.
  if (!document.querySelector("style.vrt-css")) {
    const styleEl = document.createElement("style");
    styleEl.className = "vrt-css";
    styleEl.textContent = cssToInject +
      "\n*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }";
    document.head.appendChild(styleEl);
  }

  // Mount the story HTML in a screenshot-able container.
  const container = document.createElement("div");
  container.id = "vrt-container";
  container.dataset.testid = "vrt-container";
  container.style.cssText = "display:inline-block;width:100%;min-height:1px";
  container.innerHTML = storyHtml;
  document.body.appendChild(container);

  // Settle: wait for fonts to apply, then two RAFs for layout.
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
};

// One test per story × instance — viewport tag keeps mobile/desktop snapshots distinct.
describe(`uswds visual regression [${phase}]`, () => {
  beforeAll(() => {
    if (!storyIds || storyIds.length === 0) {
      throw new Error("No story IDs provided by global setup — did build:storybook run?");
    }
  });

  for (const storyId of storyIds) {
    test(storyId, async () => {
      await loadStory(storyId);
      const locator = page.getByTestId("vrt-container");
      const vp = window.innerWidth <= 400 ? "mobile" : "desktop";
      await expect(locator).toMatchScreenshot(`${storyId}--${vp}`);
    });
  }
});
