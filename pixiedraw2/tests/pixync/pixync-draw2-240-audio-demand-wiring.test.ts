import { strict as assert } from "node:assert";

const draw = await Deno.readTextFile("src/draw2-entry.ts");
const workspace = await Deno.readTextFile("src/wp180-workspace-ui.ts");

Deno.test("PIXYNC-DRAW2-240 does not request Audio catalog at Draw startup", () => {
  assert.equal(
    draw.match(/new CustomEvent\("draw2:audio-catalog-request"\)/gu)?.length,
    2,
  );
  assert.match(draw, /drawAudioAssetPicker\?\.addEventListener\("focus"/u);
  assert.match(
    draw,
    /drawAudioAssetPicker\?\.addEventListener\("pointerdown"/u,
  );
  assert.match(draw, /"draw2:audio-catalog-provider-ready"/u);
});

Deno.test("PIXYNC-DRAW2-240 hydrates Audio before referenced Draw playback", () => {
  assert.match(
    workspace,
    /"draw2:audio-reference-playback"[\s\S]*?async \(event\)[\s\S]*?if \(detail\?\.playing === true && hasReferences\) \{\s*await ensureAudioWorkspaceSession\(\);/u,
  );
});

Deno.test("PIXYNC-DRAW2-240 brackets all Audio-bearing export paths", () => {
  assert.match(
    draw,
    /async function withDrawAudioExportDemand<T>[\s\S]*?"draw2:audio-export-demand"[\s\S]*?active: true[\s\S]*?finally[\s\S]*?active: false/u,
  );
  assert.equal(
    draw.match(/withDrawAudioExportDemand\(\(\) =>/gu)?.length,
    3,
  );
});

Deno.test("PIXYNC-DRAW2-240 has no unconditional Audio restore beside demand listeners", () => {
  const region = workspace.slice(
    workspace.indexOf(
      'windowRef.addEventListener("draw2:audio-catalog-request"',
    ),
    workspace.indexOf("const toggleCurrentModePlayback"),
  );
  assert.equal(
    region.match(/ensureAudioWorkspaceSession\(\)/gu)?.length,
    2,
  );
  assert.doesNotMatch(region, /Restore only the lightweight Audio session/u);
});
