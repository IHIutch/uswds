#!/usr/bin/env node
// For each DOM snapshot under snapshots/, emit a standalone HTML file
// under harness/ that wraps the DOM with a single <link> tag pointing
// to /css/uswds.min.css. The actual CSS is overlaid by the two
// serve-*/ directories in the next step.
import fs from "node:fs";
import path from "node:path";

const REPO = "/Users/jbhutch/Sites/uswds";
const BASE = path.join(REPO, "lightningcss-render-test");
const SNAP = path.join(BASE, "snapshots");
const HARN = path.join(BASE, "harness");
fs.mkdirSync(HARN, { recursive: true });

// Clear old output
for (const f of fs.readdirSync(HARN)) fs.unlinkSync(path.join(HARN, f));

const template = (body) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="/css/uswds.min.css">
</head>
<body>
${body}
</body>
</html>
`;

let wrote = 0;
for (const f of fs.readdirSync(SNAP)) {
  if (!f.endsWith(".html")) continue;
  const body = fs.readFileSync(path.join(SNAP, f), "utf8");
  fs.writeFileSync(path.join(HARN, f), template(body));
  wrote++;
}
console.error(`wrote ${wrote} harness files to ${HARN}`);
