/** WP-190 injected Preview/Export/Storage adapter boundary. */

import type { AudioExportPlan, AudioPreviewPlan, AudioRevisionId, AudioStorageLocator } from "./wp190-audio-core.ts";

export interface AudioPreviewHandle {
  readonly planId: string;
  readonly revisionIds: readonly AudioRevisionId[];
  readonly status: "READY" | "CANCELLED";
}

export interface AudioPreviewAdapter {
  start(plan: AudioPreviewPlan): Promise<AudioPreviewHandle>;
  swapAtSafePlayhead(plan: AudioPreviewPlan): Promise<AudioPreviewHandle>;
  cancel(planId: string): Promise<void>;
}

export interface AudioExportResult {
  readonly planId: string;
  readonly format: string;
  readonly contentHash: string;
  readonly byteLength: number;
  readonly locator: AudioStorageLocator;
}

export interface AudioExportAdapter {
  export(plan: AudioExportPlan, revisions: readonly AudioStorageLocator[]): Promise<AudioExportResult>;
}

export interface AudioStorageResolver {
  resolve(locator: AudioStorageLocator): Promise<{ readonly locator: AudioStorageLocator; readonly available: boolean }>;
}

export interface AudioBridgeTransport {
  publishRevision(reference: { readonly revisionId: AudioRevisionId; readonly contentHash: string }): Promise<void>;
}

/**
 * Runtime/editor code injects real implementations later. This adapter never
 * creates an AudioContext, reads a Blob, calls a network client, or mutates a
 * Project/Market/PiXYNC record by itself.
 */
export const WP190_ADAPTER_BOUNDARY = Object.freeze({
  preview: "INJECTED_LOCAL_PREVIEW",
  export: "INJECTED_ASYNC_EXPORT",
  storage: "HASH_AND_LOCATOR_ONLY",
  transport: "REVISION_REFERENCE_ONLY",
});
