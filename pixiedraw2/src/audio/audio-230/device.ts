import type { Audio230DeviceClaim, Audio230Result, Audio230SafeDevice } from "./contracts.ts";

export function validateAudio230DeviceClaim(claim: Audio230DeviceClaim): Audio230Result<Audio230SafeDevice> {
  if (!claim || !["OUTPUT", "INPUT", "MIDI"].includes(claim.kind) || !["AVAILABLE", "PERMISSION_REQUIRED", "UNAVAILABLE"].includes(claim.state)) return { ok: false, diagnostics: [{ code: "AUDIO230_UNSAFE_DEVICE_CLAIM", message: "Unknown device kind or state is not trusted." }] };
  if (typeof claim.id !== "string" || claim.id.length === 0 || claim.id.length > 256 || /[\u0000\n\r]/.test(claim.id)) return { ok: false, diagnostics: [{ code: "AUDIO230_UNSAFE_DEVICE_CLAIM", message: "Device identity must be a bounded opaque identifier.", path: "id" }] };
  if (claim.label !== undefined && (typeof claim.label !== "string" || claim.label.length > 256)) return { ok: false, diagnostics: [{ code: "AUDIO230_UNSAFE_DEVICE_CLAIM", message: "Device label is not bounded.", path: "label" }] };
  if (claim.channels !== undefined && claim.channels !== 1 && claim.channels !== 2) return { ok: false, diagnostics: [{ code: "AUDIO230_UNSAFE_DEVICE_CLAIM", message: "Only mono/stereo capability claims are accepted.", path: "channels" }] };
  if (claim.sampleRateHz !== undefined && (!Number.isInteger(claim.sampleRateHz) || claim.sampleRateHz < 8_000 || claim.sampleRateHz > 384_000)) return { ok: false, diagnostics: [{ code: "AUDIO230_UNSAFE_DEVICE_CLAIM", message: "Sample-rate claim is outside the supported bounded range.", path: "sampleRateHz" }] };
  return { ok: true, value: { kind: claim.kind, id: claim.id, label: claim.label?.trim() || "Unnamed device", state: claim.state, capabilities: { ...(claim.channels === undefined ? {} : { channels: claim.channels }), ...(claim.sampleRateHz === undefined ? {} : { sampleRateHz: claim.sampleRateHz }) }, trust: "CLAIM_ONLY" }, diagnostics: [] };
}
