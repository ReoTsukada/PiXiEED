import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getComparisonPixelArtCases, getUserAcceptedPixelArtCases, getVisiblePixelArtCases } from "../../js/mcp/pixel-art-cases.mjs";

const html = readFileSync(new URL("../../ai/examples/index.html", import.meta.url), "utf8");
const page = readFileSync(new URL("../../js/mcp/examples-page.mjs", import.meta.url), "utf8");

test("examples entry and catalog use a versioned module URL to refresh browser cache", () => {
  assert.match(html, /examples-page\.mjs\?v=20261117-case-library-24/);
  assert.match(page, /pixel-art-cases\.mjs\?v=20261117-case-library-24/);
});

test("examples filters can reach all completed comparison studies without accepting them", () => {
  const visible = getVisiblePixelArtCases();
  assert.equal(visible.length, 24);
  assert.equal(getUserAcceptedPixelArtCases().length, 1);
  assert.equal(getComparisonPixelArtCases().length, 23);
  for (const family of ["character", "animal", "food", "object", "machine", "scene", "transparent", "effect"]) {
    assert.equal(visible.filter((item) => item.family === family).length, 3, family);
  }
  for (const size of [16, 32, 64]) {
    assert.equal(visible.filter((item) => item.width === size).length, 8, String(size));
  }
  assert.ok(getComparisonPixelArtCases().every((item) => item.userAcceptance === "pending"));
});
