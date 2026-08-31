/** DRAW-150 package boundary for the read-only Legacy PXD adapter. */
import {
  DRAW2_PXD_V1_MAGIC,
  LEGACY_IMPORT_LIMITS,
  LEGACY_PXD_ADAPTER_ID,
  LEGACY_PXD_FORMAT_VERSION,
  importLegacyPxd,
  inspectPxd,
  type LegacyPxdImportOptions,
  type LegacyPxdImportResult,
  type LegacyPxdInspection,
} from "../../draw2-legacy-compat.ts";

export const DRAW150_CONTRACT = Object.freeze({
  adapterId: LEGACY_PXD_ADAPTER_ID,
  legacyVersion: LEGACY_PXD_FORMAT_VERSION,
  sourceReadOnly: true,
  copyRequired: true,
  originalBytesRetained: true,
  lazyBoundary: true,
  newPxdMagic: Array.from(DRAW2_PXD_V1_MAGIC),
  networkUpload: false,
});

export { LEGACY_IMPORT_LIMITS };
export type { LegacyPxdImportOptions, LegacyPxdImportResult, LegacyPxdInspection };

export async function inspectDraw2LegacyPxd(bytes: Uint8Array): Promise<LegacyPxdInspection> {
  return await inspectPxd(bytes);
}

export async function importDraw2LegacyPxd(bytes: Uint8Array, options: LegacyPxdImportOptions = {}): Promise<LegacyPxdImportResult> {
  return await importLegacyPxd(bytes, options);
}
