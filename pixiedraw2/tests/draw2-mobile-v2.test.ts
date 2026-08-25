const readWorkspaceFile = async (path: string): Promise<string> =>
  await Deno.readTextFile(new URL(path, import.meta.url));

Deno.test("Retired mobile layouts are not loaded by the runtime entry", async () => {
  const html = await readWorkspaceFile("../index.html");
  for (
    const retiredAsset of [
      "draw2-mobile-v2.css",
      "draw2-mobile-v2.js",
      "draw2-mobile-v3.css",
      "draw2-mobile-v3.js",
      "draw2-mobile-workspace.css",
      "draw2-mobile-workspace.js",
    ]
  ) {
    if (html.includes(retiredAsset)) {
      throw new Error(
        `Retired mobile layout is still in the runtime entry: ${retiredAsset}`,
      );
    }
  }
});

Deno.test("Retired Mobile V2 assets do not become a second runtime", async () => {
  const html = await readWorkspaceFile("../index.html");
  for (
    const retiredAsset of [
      "draw2-mobile-workspace.css",
      "draw2-mobile-workspace.js",
    ]
  ) {
    if (html.includes(retiredAsset)) {
      throw new Error(
        `Retired mobile asset is still in the runtime entry: ${retiredAsset}`,
      );
    }
  }
});
