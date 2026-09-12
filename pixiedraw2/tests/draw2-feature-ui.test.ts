const htmlUrl = new URL("../index.html", import.meta.url);
const entryUrl = new URL("../src/draw2-entry.ts", import.meta.url);
const shellCssUrl = new URL("../assets/draw2-shell.css", import.meta.url);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertIncludes(
  source: string,
  fragment: string,
  message: string,
): void {
  assert(source.includes(fragment), `${message}: missing ${fragment}`);
}

function assertAttribute(source: string, name: string, value: string): void {
  const pattern = new RegExp(
    `${name}\\s*=\\s*["']${value.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}["']`,
  );
  assert(pattern.test(source), `missing ${name}=${value}`);
}

Deno.test("iDRAW Context UI exposes the auto-outline and alpha-lock contract", async () => {
  const html = await Deno.readTextFile(htmlUrl);

  for (
    const id of [
      "draw2AutoOutlineToggle",
      "draw2AlphaLockToggle",
      "draw2AutoOutlineOptions",
      "draw2AutoOutlineColor",
      "draw2AutoOutlineReset",
    ]
  ) {
    assertAttribute(html, "id", id);
  }

  assertAttribute(html, "id", "draw2AutoOutlineOptions");
  assertIncludes(html, 'data-placement="OUTSIDE"', "auto-outline placement");
  assertIncludes(html, 'data-placement="INSIDE"', "auto-outline placement");
  assertIncludes(html, 'data-connectivity="4"', "auto-outline connectivity");
  assertIncludes(html, 'data-connectivity="8"', "auto-outline connectivity");

  const thickness = html.match(
    /id=["']draw2AutoOutlineThickness["'][^>]*>/,
  )?.[0] ?? "";
  assert(thickness.length > 0, "missing auto-outline thickness control");
  assertAttribute(thickness, "type", "range");
  assertAttribute(thickness, "min", "1");
  assertAttribute(thickness, "max", "16");
});

Deno.test("iDRAW detail mode remains reachable from the compact desktop command rail", async () => {
  const css = await Deno.readTextFile(shellCssUrl);
  assertIncludes(
    css,
    "> #draw2WorkspaceDetailToggle",
    "desktop detail mode selector",
  );
  assertIncludes(
    css,
    "display: grid !important",
    "desktop detail mode visibility",
  );
});

Deno.test("draw2-entry keeps auto-outline and alpha-lock connected to tool options, preview, and commit", async () => {
  const entry = await Deno.readTextFile(entryUrl);

  assert(
    /toolOptions\s*=\s*\{[\s\S]*autoOutline[\s\S]*alphaLock/.test(entry),
    "toolOptions does not retain autoOutline and alphaLock",
  );
  assertIncludes(
    entry,
    "applyTransientStrokeEffects(",
    "transient preview connection",
  );
  assert(
    /applyTransientStrokeEffects\([\s\S]*toolOptions/.test(entry),
    "preview path does not pass toolOptions to stroke effects",
  );
  assertIncludes(
    entry,
    "strokeOptions.autoOutline",
    "commit auto-outline payload",
  );
  assertIncludes(entry, "strokeOptions.alphaLock", "commit alpha-lock payload");
  assert(
    /payload:\s*\{[\s\S]*autoOutline/.test(entry),
    "stroke commit payload does not include autoOutline",
  );
  assert(
    /payload:\s*\{[\s\S]*alphaLock/.test(entry),
    "stroke commit payload does not include alphaLock",
  );
});

Deno.test("existing manual outline controls remain compatible", async () => {
  const html = await Deno.readTextFile(htmlUrl);
  for (
    const id of [
      "draw2OutlinePlacement",
      "draw2OutlineThickness",
      "draw2OutlineConnectivity",
      "draw2OutlineColor",
      "draw2OutlineApply",
    ]
  ) {
    assertAttribute(html, "id", id);
  }
});
