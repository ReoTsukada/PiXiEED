import {
  resolveDeviceProfile,
  validateLayoutEvidence,
} from "../../src/fp-006/device-profile.ts";
import type { DeviceCapabilities } from "../../src/fp-006/contracts.ts";

function capabilities(
  overrides: Partial<DeviceCapabilities> = {},
): DeviceCapabilities {
  return {
    viewportWidth: 390,
    viewportHeight: 844,
    pointerCoarse: true,
    pointerFine: false,
    hover: false,
    touch: true,
    stylusCandidate: false,
    orientation: "portrait",
    safeArea: { top: 0, right: 0, bottom: 24, left: 0 },
    textScale: 1,
    imeVisible: false,
    reducedMotion: false,
    host: "browser",
    ...overrides,
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("FP-006 resolves mobile/tablet/desktop from capability-aware profiles", () => {
  const mobile = resolveDeviceProfile(capabilities());
  assert(mobile.profile === "mobile", "390x844 touch profile must be mobile");
  assert(mobile.canvasFirst, "mobile must be canvas-first");
  assert(
    mobile.pageScrollAllowed === false,
    "page scroll must remain forbidden",
  );
  assert(mobile.minimumTouchTargetPx === 44, "mobile target must be 44px");

  const tablet = resolveDeviceProfile(
    capabilities({
      viewportWidth: 834,
      viewportHeight: 1112,
      pointerCoarse: true,
    }),
  );
  assert(
    tablet.profile === "tablet",
    "tablet profile must not be a shrunk desktop",
  );
  const desktop = resolveDeviceProfile(
    capabilities({
      viewportWidth: 1280,
      viewportHeight: 900,
      pointerCoarse: false,
      pointerFine: true,
      hover: true,
      touch: false,
      orientation: "landscape",
    }),
  );
  assert(
    desktop.profile === "desktop",
    "fine pointer wide profile must be desktop",
  );
});

Deno.test("FP-006 unknown/invalid capability input fails closed", () => {
  const unknown = resolveDeviceProfile(
    capabilities({
      pointerCoarse: false,
      pointerFine: false,
      hover: false,
      touch: false,
    }),
  );
  assert(
    unknown.profile === "unknown",
    "ambiguous capabilities must be unknown",
  );
  assert(unknown.failClosed, "ambiguous capabilities must fail closed");
  const invalid = resolveDeviceProfile(
    capabilities({ viewportWidth: 0, textScale: 4 }),
  );
  assert(invalid.failClosed, "invalid viewport/text scale must fail closed");
  assert(
    invalid.diagnostics.some((item) => item.code === "VIEWPORT_INVALID"),
    "viewport diagnostic required",
  );
  assert(
    invalid.diagnostics.some((item) => item.code === "TEXT_SCALE_INVALID"),
    "text scale diagnostic required",
  );
});

Deno.test("FP-006 layout evidence rejects page overflow and unbounded scroll", () => {
  assert(
    validateLayoutEvidence({
      pageScrollWidth: 390,
      pageClientWidth: 390,
      pageScrollHeight: 844,
      pageClientHeight: 844,
      criticalControlsFit: true,
      boundedPanelScrollOnly: true,
    }).length === 0,
    "fitting layout must pass",
  );
  const issues = validateLayoutEvidence({
    pageScrollWidth: 410,
    pageClientWidth: 390,
    pageScrollHeight: 900,
    pageClientHeight: 844,
    criticalControlsFit: false,
    boundedPanelScrollOnly: false,
  });
  assert(
    issues.includes("PAGE_HORIZONTAL_OVERFLOW"),
    "horizontal page overflow must be detected",
  );
  assert(
    issues.includes("PAGE_VERTICAL_OVERFLOW"),
    "vertical page overflow must be detected",
  );
  assert(
    issues.includes("UNBOUNDED_SCROLL_REGION"),
    "unbounded page/panel scroll must be detected",
  );
});
