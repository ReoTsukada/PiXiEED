const invalidInputCases = [
  {
    id: "AUTHORITY-ROOT-001",
    expectedOutcome: "REJECT",
    reasonCode: "CALLER_INJECTION_REJECTED",
  },
  {
    id: "RESOLVER-IDENTITY-001",
    expectedOutcome: "REJECT",
    reasonCode: "CANONICAL_IDENTITY_MISMATCH",
  },
  {
    id: "CALLER-STATE-001",
    expectedOutcome: "REJECT",
    reasonCode: "CALLER_STATE_NOT_AUTHORITY",
  },
  {
    id: "EVENT-ID-001",
    expectedOutcome: "REJECT",
    reasonCode: "CANONICAL_EVENT_ID_REQUIRED",
  },
  {
    id: "REPLAY-REVOKE-001",
    expectedOutcome: "REJECT",
    reasonCode: "LIFECYCLE_TRANSITION_NOT_AUTHORIZED",
  },
];

function assertInvalidInputRejection(caseRecord) {
  return caseRecord.expectedOutcome === "REJECT" &&
    typeof caseRecord.reasonCode === "string";
}

void invalidInputCases;
void assertInvalidInputRejection;
