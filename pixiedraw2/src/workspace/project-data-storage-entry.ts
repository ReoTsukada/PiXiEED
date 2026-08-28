/** Lazy storage-only entry used by the Project deletion/recovery boundary. */

export {
  createIndexedDbAudioPersistenceStore,
} from "../audio/audio-200/indexeddb-store.ts";
export {
  asAudioProjectId,
} from "../audio/audio-200/contracts.ts";
import {
  asAudioProjectId,
  type AudioRevision,
} from "../audio/audio-200/contracts.ts";
import { createOpfsAudioAssetByteStore } from "../audio/audio-200/opfs-store.ts";
import { createIndexedDbAudioPersistenceStore } from "../audio/audio-200/indexeddb-store.ts";

/**
 * Removes Audio metadata and every OPFS revision referenced by that metadata.
 * Metadata stays present when a referenced byte cannot be removed, so a
 * later retry still has the authoritative list of files to clean up.
 */
export async function deleteIndexedDbAudioProjectData(
  projectId: string,
): Promise<boolean> {
  const audioProjectId = asAudioProjectId(projectId);
  const store = createIndexedDbAudioPersistenceStore();
  const loaded = await store.load(audioProjectId);
  if (!loaded.ok) return false;
  if (loaded.value !== null) {
    const opfs = createOpfsAudioAssetByteStore();
    const revisions = loaded.value.checkpoint.state.revisions as
      readonly AudioRevision[];
    for (const revision of revisions) {
      if (revision.source.locator.placement !== "OPFS") continue;
      const removed = await opfs.remove(revision);
      if (!removed.ok) return false;
    }
  }
  return (await store.clear(audioProjectId)).ok;
}

export {
  createIndexedDbGameEditorPersistenceStore,
} from "./game-persistence.ts";
export { createPixyncIndexedDbPersistence } from "../pixync/indexeddb-persistence.ts";
