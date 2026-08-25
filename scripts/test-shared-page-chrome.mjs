import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sharedNav = fs.readFileSync(
  path.join(root, "scripts/shared-bottom-nav.js"),
  "utf8",
);
const sharedAds = fs.readFileSync(
  path.join(root, "scripts/bottom-nav-footer-ad.js"),
  "utf8",
);
const landingCss = fs.readFileSync(path.join(root, "site/landing.css"), "utf8");

assert.match(
  sharedNav,
  /body\.pixieed-seamless-page > \.page[\s\S]*margin-left:auto !important;[\s\S]*margin-right:auto !important;/,
);
assert.match(
  sharedNav,
  /\.header-inner,[\s\S]*\.section-inner,[\s\S]*\.footer-inner[\s\S]*margin-left:auto !important;/,
);
assert.match(
  landingCss,
  /\/\* Home layout: fill the available body width, then center the bounded content\. \*\/[\s\S]*body:has\(\.home-app\) > \.page\s*{[\s\S]*width:\s*100%;[\s\S]*max-width:\s*none;[\s\S]*margin-inline:\s*0;[\s\S]*justify-items:\s*center;/,
);
assert.match(
  landingCss,
  /body:has\(\.home-app\) \.home-app,[\s\S]*width:\s*min\(1120px, 100%\);[\s\S]*margin-inline:\s*auto!important;[\s\S]*justify-self:\s*center;/,
);

assert.match(sharedAds, /function isLandscapeViewport\(\)/);
assert.match(
  sharedAds,
  /if \(arePixieedAdsDisabled\(\)\s*\|\|\s*isLandscapeViewport\(\)\)/,
);
assert.match(
  sharedAds,
  /@media \(orientation: landscape\)[\s\S]*\.pixieed-shared-top-ad\{display:none!important\}/,
);
assert.match(sharedAds, /function isLocalFilePreview\(\)/);
assert.match(sharedAds, /is-local-preview/);
assert.match(
  sharedAds,
  /else if \(!localFilePreview\)\s*{[\s\S]*ensureAdsScript\(\);/,
);

function listHtmlFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (
      [".git", "node_modules", "app-shell", "dist", "build", "_backup"]
        .includes(entry.name)
    ) return [];
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listHtmlFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".html") ? [fullPath] : [];
  });
}

const sharedChromeExemptPages = new Set([
  "account/admin.html",
  "google92ae386aca6917c9.html",
  "googlee776c49d223e1a38.html",
  "google10107469bdcc60fa.html",
  "maoitu/game.html",
  "pixfind/marker-editor.html",
  "q/1/index.html",
  "q/index.html",
  // Isolated Core Shell preview intentionally does not load current shared chrome.
  "core-shell/index.html",
  // SITE-400 local qualification fixture intentionally has no current shared chrome.
  "core-shell/local-test.html",
  // Isolated Draw2 local-only entry intentionally does not replace current site chrome.
  "pixiedraw2/index.html",
  // Isolated Draw2 benchmark entry is measurement-only and intentionally has no site chrome.
  "pixiedraw2/reference-benchmark.html",
  // Isolated Draw2 icon sheet is a local visual QA surface, not a public route.
  "pixiedraw2/assets/icons/draw2-icons-preview.html",
]);

for (const filePath of listHtmlFiles(root)) {
  const html = fs.readFileSync(filePath, "utf8");
  const relativePath = path.relative(root, filePath);
  const isGeneratedRedirect = relativePath.startsWith("pixfind/puzzles/");
  const isDraw2LocalHarness = relativePath.startsWith("pixiedraw2/assets/")
    && (relativePath.endsWith("-harness.html")
      || relativePath.endsWith("/draw2-icons-preview.html"));
  if (!sharedChromeExemptPages.has(relativePath) && !isGeneratedRedirect && !isDraw2LocalHarness) {
    assert.match(
      html,
      /shared-bottom-nav\.js\?v=/,
      `${relativePath} is missing shared page chrome`,
    );
  }
  if (html.includes("shared-bottom-nav.js?v=")) {
    assert.match(
      html,
      /shared-bottom-nav\.js\?v=20260825-studio-brand1/,
      `${relativePath} has stale shared navigation`,
    );
  }
  if (html.includes("bottom-nav-footer-ad.js?v=")) {
    assert.match(
      html,
      /bottom-nav-footer-ad\.js\?v=20260719-shared-top-resume1/,
      `${relativePath} has stale shared advertising chrome`,
    );
  }
}

console.log("Shared page chrome guard passed.");
