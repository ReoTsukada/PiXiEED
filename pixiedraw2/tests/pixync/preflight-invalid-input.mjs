// Fixed synthetic source consumed by the repository-bound preflight only.
// The actual Deno harness is pixiedraw2/tests/pixync/pixync-draw2-100.test.ts.

const rejectedCases = [
  ["AUTHORITY-ROOT-001", "CALLER_INJECTION_REJECTED"],
  ["RESOLVER-IDENTITY-001", "CANONICAL_IDENTITY_MISMATCH"],
  ["CALLER-STATE-001", "CALLER_STATE_NOT_AUTHORITY"],
  ["EVENT-ID-001", "CANONICAL_EVENT_ID_REQUIRED"],
  ["REPLAY-REVOKE-001", "LIFECYCLE_TRANSITION_NOT_AUTHORIZED"],
];

export function assertRejectedInput(caseId, reasonCode) {
  const found = rejectedCases.some(([id, reason]) =>
    id === caseId && reason === reasonCode
  );
  if (!found) throw new Error("REJECT case is not registered");
  return "REJECT";
}
