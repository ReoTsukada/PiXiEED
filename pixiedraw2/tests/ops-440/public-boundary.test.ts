import { strict as assert } from "node:assert";

const publicPath = new URL(
  "../../src/platform/ops-440/contracts.ts",
  import.meta.url,
);
const compositionPath = new URL(
  "../../src/platform/ops-440/composition.ts",
  import.meta.url,
);
const eventAdapterPath = new URL(
  "../../src/platform/ops-440/event-adapter.ts",
  import.meta.url,
);

Deno.test("OPS440-SCOPE-001: public contract cannot reach server context, resolver, composition, or event adapter", async () => {
  const publicSource = await Deno.readTextFile(publicPath);
  const compositionSource = await Deno.readTextFile(compositionPath);
  assert.doesNotMatch(publicSource, /\bfrom\s*["']/u);
  assert.doesNotMatch(publicSource, /export\s+type\s+\*/u);
  for (
    const forbidden of [
      "ServerAuthorityRequestContextV1",
      "AuthPrincipalProvider",
      "TenantMembershipResolver",
      "CanonicalTenantMembershipRegistryV1",
      "createOps440ServerComposition",
      "Ops440ServerCompositionOptions",
      "Fp004ProviderIngress",
      "event-adapter",
    ]
  ) {
    assert.equal(
      publicSource.includes(forbidden),
      false,
      `public contract leaked ${forbidden}`,
    );
  }
  assert.match(
    compositionSource,
    /export\s+function\s+createOps440ServerComposition/u,
  );
  assert.match(
    compositionSource,
    /server\/internal\/authenticated-context\.ts/u,
  );
  assert.equal(compositionSource.includes("event-adapter.ts"), false);
  await assert.rejects(Deno.stat(eventAdapterPath));
});

Deno.test("OPS440-STOP-001: public commands contain no authority, state, consent, or revenue mutation inputs", async () => {
  const source = await Deno.readTextFile(publicPath);
  for (
    const forbidden of [
      "authorizationProof",
      "resolver",
      "currentState",
      "role",
      "capability",
      "consentAuthority",
      "regionAuthority",
      "ageAuthority",
      "revenueMutationFlags",
      "ledgerMutation",
      "payoutMutation",
      "royaltyMutation",
    ]
  ) {
    const commandSection = source.split("export type Ops440Command =")[0]
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .replace(/\/\/.*$/gmu, "");
    assert.equal(
      commandSection.includes(forbidden),
      false,
      `public command leaked ${forbidden}`,
    );
  }
  assert.match(source, /Ops440OpaqueId/u);
  assert.match(source, /Ops440EventMetadata/u);
  assert.match(source, /Ops440Surface/u);
});
