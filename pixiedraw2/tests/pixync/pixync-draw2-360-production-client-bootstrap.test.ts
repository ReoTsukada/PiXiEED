import { strict as assert } from "node:assert";

const html = await Deno.readTextFile("index.html");
const entry = await Deno.readTextFile("src/draw2-entry.ts");
const bootstrap = await Deno.readTextFile(
  "../scripts/pixieed-account-supabase-client.js",
);

Deno.test("PIXYNC-DRAW2-360 supplies the shared authenticated client before Draw2 starts", () => {
  const clientScript = html.indexOf("pixieed-account-supabase-client.js");
  const drawEntry = html.indexOf("dist/draw2-entry.js");
  assert.ok(clientScript >= 0);
  assert.ok(drawEntry > clientScript);
  assert.match(bootstrap, /@supabase\/supabase-js@2\.46\.1\?bundle/u);
  assert.match(bootstrap, /persistSession:\s*true/u);
  assert.match(
    bootstrap,
    /storageKey:\s*'sb-kyyiuakrqomzlikfaire-auth-token'/u,
  );
  assert.doesNotMatch(bootstrap, /service[_-]?role/iu);
});

Deno.test("PIXYNC-DRAW2-360 starts and stops the production root with account state", () => {
  assert.match(bootstrap, /pixieed:supabase-client-ready/u);
  assert.match(bootstrap, /pixieed:account-auth-state/u);
  assert.match(entry, /addEventListener\("pixieed:supabase-client-ready"/u);
  assert.match(entry, /queuePixyncProductionStart\(client\)/u);
  assert.match(entry, /pixyncProductionRoot\?\.close\("signed-out"\)/u);
  assert.match(entry, /dataset\.pixyncComposition = "awaiting-auth"/u);
});
