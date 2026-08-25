import {
  DEFAULT_DRAW2_VISUAL_SETTINGS,
  normalizeDraw2VisualSettings,
} from "../src/draw2-settings.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("Draw2 visual settings normalize zoom sensitivity and colors", () => {
  const settings = normalizeDraw2VisualSettings({
    zoomSensitivity: 1.63,
    checkerA: "#abcdef",
    checkerB: "#123456",
    gridMinor: "invalid",
    gridMajor: "#654321",
    themeAccent: "#fedcba",
  });
  assert(settings.zoomSensitivity === 1.75, "zoom sensitivity was not quantized to a supported step");
  assert(settings.checkerA === "#ABCDEF" && settings.checkerB === "#123456", "checker colors were not normalized");
  assert(settings.gridMinor === DEFAULT_DRAW2_VISUAL_SETTINGS.gridMinor, "invalid grid color was accepted");
  assert(settings.gridMajor === "#654321" && settings.themeAccent === "#FEDCBA", "custom colors were not retained");
});

Deno.test("Draw2 visual settings fail closed to safe defaults", () => {
  const settings = normalizeDraw2VisualSettings({ zoomSensitivity: 99, checkerA: "#fff" });
  assert(settings.zoomSensitivity === 2, "zoom sensitivity upper bound was not enforced");
  assert(settings.checkerA === DEFAULT_DRAW2_VISUAL_SETTINGS.checkerA, "short color was accepted");
  assert(settings.gridMajor === DEFAULT_DRAW2_VISUAL_SETTINGS.gridMajor, "missing grid color did not use the default");
});
