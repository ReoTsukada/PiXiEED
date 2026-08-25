import type {
  Core110FailureInjectionControls,
  Core110InjectionPoint,
  Core110ProviderResponseControl,
  Core110SideEffectCounts,
  Core110SideEffectSpy,
} from "./contracts.ts";

export function createCore110FailureControls(
  initial: Partial<{
    crashPoint: Core110FailureInjectionControls["crashPoint"];
    providerResponse: Core110ProviderResponseControl;
    pauseOutbox: boolean;
    poisonOutbox: boolean;
    retryableOutboxFailure: boolean;
    authorizationRevoked: boolean;
    schemaMismatch: boolean;
    privacyMismatch: boolean;
    unsupportedCapabilities: readonly string[];
  }> = {},
): Core110FailureInjectionControls {
  const points = new Map<Core110InjectionPoint, number>();
  let crashPoint = initial.crashPoint;
  let providerResponse = initial.providerResponse;
  let pauseOutbox = initial.pauseOutbox === true;
  let poisonOutbox = initial.poisonOutbox === true;
  let retryableOutboxFailure = initial.retryableOutboxFailure === true;
  let authorizationRevoked = initial.authorizationRevoked === true;
  let schemaMismatch = initial.schemaMismatch === true;
  let privacyMismatch = initial.privacyMismatch === true;
  let unsupportedCapabilities = [...(initial.unsupportedCapabilities ?? [])];

  const controls: Core110FailureInjectionControls = {
    get crashPoint() {
      return crashPoint;
    },
    get providerResponse() {
      return providerResponse;
    },
    get pauseOutbox() {
      return pauseOutbox;
    },
    get poisonOutbox() {
      return poisonOutbox;
    },
    get retryableOutboxFailure() {
      return retryableOutboxFailure;
    },
    get authorizationRevoked() {
      return authorizationRevoked;
    },
    get schemaMismatch() {
      return schemaMismatch;
    },
    get privacyMismatch() {
      return privacyMismatch;
    },
    get unsupportedCapabilities() {
      return [...unsupportedCapabilities];
    },
    trigger(point) {
      points.set(point, (points.get(point) ?? 0) + 1);
    },
    count(point) {
      return points.get(point) ?? 0;
    },
    configure(values) {
      if ("crashPoint" in values) crashPoint = values.crashPoint;
      if ("providerResponse" in values) {
        providerResponse = values.providerResponse;
      }
      if ("pauseOutbox" in values) pauseOutbox = values.pauseOutbox === true;
      if ("poisonOutbox" in values) poisonOutbox = values.poisonOutbox === true;
      if ("retryableOutboxFailure" in values) {
        retryableOutboxFailure = values.retryableOutboxFailure === true;
      }
      if ("authorizationRevoked" in values) {
        authorizationRevoked = values.authorizationRevoked === true;
      }
      if ("schemaMismatch" in values) {
        schemaMismatch = values.schemaMismatch === true;
      }
      if ("privacyMismatch" in values) {
        privacyMismatch = values.privacyMismatch === true;
      }
      if ("unsupportedCapabilities" in values) {
        unsupportedCapabilities = [...(values.unsupportedCapabilities ?? [])];
      }
    },
    reset() {
      points.clear();
      crashPoint = undefined;
      providerResponse = undefined;
      pauseOutbox = false;
      poisonOutbox = false;
      retryableOutboxFailure = false;
      authorizationRevoked = false;
      schemaMismatch = false;
      privacyMismatch = false;
      unsupportedCapabilities = [];
    },
  };
  return controls;
}

export function createCore110SideEffectSpy(): Core110SideEffectSpy {
  const values: Record<
    keyof Omit<Core110SideEffectCounts, "externalTotal">,
    number
  > = {
    provider: 0,
    finance: 0,
    notification: 0,
    search: 0,
  };
  const snapshot = (): Core110SideEffectCounts => ({
    ...values,
    externalTotal: values.provider + values.finance + values.notification +
      values.search,
  });
  return {
    get counts() {
      return snapshot();
    },
    record(kind) {
      values[kind] += 1;
    },
    snapshot,
    reset() {
      values.provider = 0;
      values.finance = 0;
      values.notification = 0;
      values.search = 0;
    },
  };
}
