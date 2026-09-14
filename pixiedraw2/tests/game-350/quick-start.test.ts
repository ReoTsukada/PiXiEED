const htmlUrl = new URL("../../index.html", import.meta.url);
const sourceUrl = new URL("../../src/wp180-workspace-ui.ts", import.meta.url);
const cssUrl = new URL("../../assets/draw2-pc-simple-game.css", import.meta.url);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("iGAME exposes the beginner draw-place-play path", async () => {
  const html = await Deno.readTextFile(htmlUrl);
  const source = await Deno.readTextFile(sourceUrl);
  const css = await Deno.readTextFile(cssUrl);

  for (const id of [
    "draw2GameQuickStart",
    "draw2GameQuickStartHeading",
    "draw2GameQuickStartStatus",
  ]) {
    assert(html.includes(`id="${id}"`), `quick-start hook missing: ${id}`);
  }
  for (const action of ["WORLD", "PLAYER", "OBJECT", "PLAY"]) {
    assert(
      html.includes(`data-game-quick-action="${action}"`),
      `quick-start action missing: ${action}`,
    );
  }
  assert(
    source.includes("renderGameQuickStart = (locked: boolean)"),
    "quick-start state renderer is not wired",
  );
  assert(
    source.includes("windowRef.innerWidth >= 1120"),
    "quick-start surface must stay within the PC-only breakpoint",
  );
  assert(
    source.includes('openGamePlaygroundDrawSelection({ kind: "PLAYER" })'),
    "quick-start Play must lead to the player capture path",
  );
  assert(
    css.includes(".draw2-game-quick-action") &&
      css.includes(".draw2-game-playground-mode-switch"),
    "desktop quick-start presentation contract is missing",
  );
});
