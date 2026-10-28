import { createCameraFileSave as localFileSave } from './file-save-core.mjs?rev=20261028-unified-output-1';
import { isEditorOutput, routeEditorFile, reportOutputError } from '../creation/output-router.mjs?rev=20261028-unified-output-1';

/** Cameras navigate to shared output; native save controls are confined to output/non-editor pages. */
export function createCameraFileSave(options = {}) {
  if (!isEditorOutput(options.locationRef || globalThis.location)) return localFileSave(options);
  let busy = false;
  return {
    show(snapshot = {}) {
      if (busy || !snapshot.blob?.size || !snapshot.filename || typeof snapshot.isCurrent !== 'function' || !snapshot.isCurrent()) return false;
      busy = true;
      void routeEditorFile(snapshot.blob, snapshot.filename, options)
        .catch(error => reportOutputError(error, options.dialog?.ownerDocument))
        .finally(() => { busy = false; });
      return true;
    },
    reset() { /* The staging transaction owns its snapshot; no native save dialog is opened. */ }
  };
}
