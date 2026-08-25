import { strict as assert } from "node:assert";

Deno.test("SITE-460 browser entry is local feature flagged", () => {
  const source = Deno.readTextFileSync(
    "src/platform/site-460/browser-entry.ts",
  );
  assert(source.includes('get("site460") === "on"'));
  assert(source.includes('"PUBLIC_WORK_SOCIAL"'));
  assert(source.includes('"INBOX_APPLIED"'));
  assert(!source.includes("export function"));
  assert(!source.includes("export async function"));
});
