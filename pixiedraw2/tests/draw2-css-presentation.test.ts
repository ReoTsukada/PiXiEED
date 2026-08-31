function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function readProjectFile(path: string): Promise<string> {
  return await Deno.readTextFile(new URL(path, import.meta.url));
}

Deno.test("stable presentation defaults live in CSS", async () => {
  const css = await readProjectFile("../assets/draw2-shell.css");

  for (
    const contract of [
      ".draw2-viewport-wrap.is-mirror-enabled",
      ".draw2-timeline-onion-popover.is-timeline-popover-positioned",
      ".draw2-menu-popover.is-menu-positioned",
      ".draw2-tool-popover.is-flyout-positioned",
      ".draw2-audio-playhead",
      ".draw2-audio-arranger-playhead",
      ".draw2-audio-arranger-midi-waveform",
      ".draw2-audio-draw-frame-cells",
      ".draw2-audio-midi-canvas",
    ]
  ) {
    assert(
      css.includes(contract),
      `Missing CSS presentation contract: ${contract}`,
    );
  }

  assert(
    css.includes("padding: 42px !important"),
    "Mirror padding must be CSS-owned",
  );
  assert(
    css.includes("grid-column: 2 / -1"),
    "Audio lane placement must be CSS-owned",
  );
  assert(
    css.includes("position: absolute"),
    "Audio frame cells must have CSS positioning",
  );
  assert(
    css.includes("inset: 0 auto auto 0"),
    "MIDI canvas edge anchoring must be CSS-owned",
  );
  assert(
    css.includes(".draw2-mirror-line-toggle.is-dragging") &&
      css.includes("cursor: pointer") &&
      css.includes("cursor: grabbing"),
    "Mirror handles must show a click cursor until a real drag starts.",
  );
});

Deno.test("presentation-only inline writes are not reintroduced", async () => {
  const entrySource = await readProjectFile("../src/draw2-entry.ts");
  const workspaceSource = await readProjectFile("../src/wp180-workspace-ui.ts");

  for (
    const forbidden of [
      'onionOptionsPopover.style.setProperty("left", "0px")',
      'onionOptionsPopover.style.setProperty("top", "0px")',
      "audioPlayhead.style.top =",
      "audioPlayhead.style.height =",
      "audioArrangerPlayhead.style.top =",
      "audioArrangerPlayhead.style.height =",
      'canvas.style.width = "100%"',
      'canvas.style.height = "100%"',
      'audioMidiGrid.style.width = "100%"',
      'audioMidiGrid.style.minWidth = "0px"',
      'canvas.style.top = "0px"',
      'canvas.style.right = "auto"',
      'canvas.style.bottom = "auto"',
    ]
  ) {
    assert(
      !entrySource.includes(forbidden) && !workspaceSource.includes(forbidden),
      `Presentation write remains in JavaScript: ${forbidden}`,
    );
  }
});
