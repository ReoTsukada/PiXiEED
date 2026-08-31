import * as publicIndex from "../../src/fp-007/index.ts";
import * as distributedBoundary from "../../src/fp-007/server-non-intrusion-authority.ts";
import {
  computeServerNonIntrusionReceiptDigest,
  FP007_SERVER_NON_INTRUSION_COMMAND,
  FP007_SERVER_NON_INTRUSION_SCOPE,
  isServerNonIntrusionProof,
  type ServerNonIntrusionReceipt,
  verifyServerNonIntrusionProof,
} from "../../src/fp-007/server-non-intrusion-authority.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const INSPECTED_PATHS = [
  "current-routes",
  "pixiedraw",
  "pxd",
  "pixync",
  "market",
] as const;

async function publicReceipt(
  overrides: Partial<ServerNonIntrusionReceipt> = {},
): Promise<ServerNonIntrusionReceipt> {
  const receipt: ServerNonIntrusionReceipt = {
    scope: [...FP007_SERVER_NON_INTRUSION_SCOPE],
    commandIdentity: FP007_SERVER_NON_INTRUSION_COMMAND,
    qualification: "EXECUTED",
    exitCode: 0,
    resultDigest: null,
    inspectedPaths: [...INSPECTED_PATHS],
    workspaceState: "clean",
    unresolvedDiffs: false,
    ...overrides,
  };
  return {
    ...receipt,
    resultDigest: await computeServerNonIntrusionReceiptDigest(receipt),
  };
}

Deno.test(
  "FP007 distributed boundary exposes no proof creation path",
  async () => {
    const publicNames = Object.keys(publicIndex);
    const distributedNames = Object.keys(distributedBoundary);
    const creationTokens = [
      "iss" + "uer",
      "fact" + "ory",
      "iss" + "ue",
      "cre" + "ate",
    ];
    const forbiddenName = new RegExp(
      `(?:${creationTokens.join("|")}).*proof|proof.*(?:${
        creationTokens.join("|")
      })`,
      "i",
    );

    assert(
      publicNames.every((name) => !forbiddenName.test(name)),
      "public integration index must not expose proof creation names",
    );
    assert(
      distributedNames.every((name) => !forbiddenName.test(name)),
      "distributed boundary must not expose proof creation names",
    );

    const receipt = await publicReceipt();
    const rehashedReceipt = {
      ...receipt,
      resultDigest: await computeServerNonIntrusionReceiptDigest(receipt),
    };

    assert(
      !isServerNonIntrusionProof(rehashedReceipt),
      "a rehashed public receipt is not an opaque server proof",
    );
    assert(
      !(await verifyServerNonIntrusionProof(rehashedReceipt, receipt)),
      "a rehashed public receipt must not authorize current-system impact",
    );
  },
);

Deno.test(
  "FP007 client/reference runtime remains fail closed without a server proof",
  async () => {
    const receipt = await publicReceipt();
    const browserShapedProofs: readonly unknown[] = [
      {},
      { __fp007ServerNonIntrusionProof: "trusted" },
      Object.freeze({}),
      new Proxy({}, {}),
      structuredClone({}),
      JSON.parse(JSON.stringify({})),
    ];

    for (const candidate of browserShapedProofs) {
      assert(
        !isServerNonIntrusionProof(candidate),
        "browser-shaped, clone, spread, JSON, and Proxy values must not be proof",
      );
      assert(
        !(await verifyServerNonIntrusionProof(candidate, receipt)),
        "browser-shaped values must not authorize the receipt",
      );
    }

    assert(
      !isServerNonIntrusionProof(receipt),
      "a valid-looking receipt remains diagnostic data only",
    );
  },
);
