import type {
  DeviceCapabilities,
  DeviceDiagnostic,
  DeviceProfile,
  DeviceProfileResult,
} from "./contracts.ts";

function diagnostic(
  code: DeviceDiagnostic["code"],
  severity: DeviceDiagnostic["severity"],
  message: string,
): DeviceDiagnostic {
  return { code, severity, message };
}

export function resolveDeviceProfile(
  capabilities: DeviceCapabilities,
): DeviceProfileResult {
  const diagnostics: DeviceDiagnostic[] = [];
  const { viewportWidth: width, viewportHeight: height, safeArea } =
    capabilities;
  if (
    !Number.isFinite(width) || !Number.isFinite(height) || width < 1 ||
    height < 1
  ) {
    diagnostics.push(
      diagnostic(
        "VIEWPORT_INVALID",
        "error",
        "Viewport dimensions must be positive.",
      ),
    );
  }
  if (
    [safeArea.top, safeArea.right, safeArea.bottom, safeArea.left].some((
      value,
    ) =>
      !Number.isFinite(value) || value < 0 || value > Math.max(width, height)
    )
  ) {
    diagnostics.push(
      diagnostic(
        "SAFE_AREA_INVALID",
        "error",
        "Safe-area insets must be finite and non-negative.",
      ),
    );
  }
  if (
    !Number.isFinite(capabilities.textScale) || capabilities.textScale < 0.8 ||
    capabilities.textScale > 3
  ) {
    diagnostics.push(
      diagnostic(
        "TEXT_SCALE_INVALID",
        "error",
        "Text scale must remain within the supported accessibility range.",
      ),
    );
  }
  if (
    (capabilities.orientation === "portrait" && width > height * 1.25) ||
    (capabilities.orientation === "landscape" && height > width * 1.25)
  ) {
    diagnostics.push(
      diagnostic(
        "ORIENTATION_MISMATCH",
        "warning",
        "Reported orientation does not match the viewport.",
      ),
    );
  }
  if (
    !capabilities.pointerCoarse && !capabilities.pointerFine &&
    !capabilities.touch && !capabilities.hover
  ) {
    diagnostics.push(
      diagnostic(
        "CAPABILITY_AMBIGUOUS",
        "error",
        "No usable pointer capability was reported; fail closed.",
      ),
    );
  }
  if (capabilities.imeVisible) {
    diagnostics.push(
      diagnostic(
        "IME_REQUIRES_INTERNAL_SCROLL",
        "warning",
        "IME-visible layouts must scroll inside a bounded panel, never the page.",
      ),
    );
  }
  diagnostics.push(
    diagnostic(
      "PAGE_SCROLL_FORBIDDEN",
      "warning",
      "Page-level scrolling is forbidden; only bounded panels may scroll.",
    ),
  );
  if (capabilities.host !== "native") {
    diagnostics.push(
      diagnostic(
        "PHYSICAL_DEVICE_UNTESTED",
        "warning",
        "Physical mobile/native qualification remains UNTESTED.",
      ),
    );
  }
  if (!capabilities.stylusCandidate) {
    diagnostics.push(
      diagnostic(
        "STYLUS_UNTESTED",
        "warning",
        "Physical stylus qualification remains UNTESTED.",
      ),
    );
  }

  const failClosed = diagnostics.some((item) => item.severity === "error");
  const ambiguous = !capabilities.pointerFine && !capabilities.pointerCoarse;
  let profile: DeviceProfile = "unknown";
  if (!failClosed && !ambiguous) {
    const split = width >= 700 && width < 1120 && height < width;
    if (split) profile = "split";
    else if (
      capabilities.pointerCoarse &&
      (capabilities.touch || !capabilities.hover) && width < 700
    ) profile = "mobile";
    else if (capabilities.pointerCoarse && width < 1120) profile = "tablet";
    else profile = "desktop";
  }
  return {
    profile,
    capabilities,
    diagnostics,
    failClosed,
    canvasFirst: profile === "mobile" || profile === "tablet" ||
      profile === "split",
    pageScrollAllowed: false,
    minimumTouchTargetPx: profile === "mobile" ? 44 : 36,
  };
}

export interface LayoutEvidence {
  readonly pageScrollWidth: number;
  readonly pageClientWidth: number;
  readonly pageScrollHeight: number;
  readonly pageClientHeight: number;
  readonly criticalControlsFit: boolean;
  readonly boundedPanelScrollOnly: boolean;
}

export function validateLayoutEvidence(
  evidence: LayoutEvidence,
): readonly string[] {
  const issues: string[] = [];
  if (evidence.pageScrollWidth !== evidence.pageClientWidth) {
    issues.push("PAGE_HORIZONTAL_OVERFLOW");
  }
  if (evidence.pageScrollHeight !== evidence.pageClientHeight) {
    issues.push("PAGE_VERTICAL_OVERFLOW");
  }
  if (!evidence.criticalControlsFit) {
    issues.push("CRITICAL_CONTROL_OUTSIDE_VIEWPORT");
  }
  if (!evidence.boundedPanelScrollOnly) issues.push("UNBOUNDED_SCROLL_REGION");
  return issues;
}
