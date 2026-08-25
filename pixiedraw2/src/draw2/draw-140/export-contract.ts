/**
 * DRAW-140 package boundary.
 *
 * The implementation remains the isolated Draw2 exporter. This adapter gives
 * the work package a stable, DOM/network-free entry without touching the
 * current PiXiEEDraw PXD path.
 */
import {
  exportPng,
  exportPxd,
  importPxdPackage,
  type PngExport,
  type PxdExportOptions,
  type PxdExport,
  type PxdImportOptions,
  type PxdImportResult,
} from "../../draw2-export.ts";
import type { ProjectState } from "../../draw2-core.ts";

export const DRAW140_CONTRACT = Object.freeze({
  format: "PXD_V1",
  png: "RGBA8_FILTER0_STORED_DEFLATE",
  canonicalColorSource: "indexed-raster-palette",
  sourceBoundary: "DRAW2_ISOLATED_ONLY",
  networkUpload: false,
  currentPxdMutation: false,
});

export async function exportDraw2Png(state: ProjectState, assetId = state.activeAssetId): Promise<PngExport> {
  return await exportPng(state, assetId);
}

export async function exportDraw2Pxd(state: ProjectState, options: PxdExportOptions = {}): Promise<PxdExport> {
  return await exportPxd(state, options);
}

export async function importDraw2Pxd(bytes: Uint8Array, options: PxdImportOptions = {}): Promise<PxdImportResult> {
  return await importPxdPackage(bytes, options);
}
