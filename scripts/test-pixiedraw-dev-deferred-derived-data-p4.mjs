import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = fs.readFileSync(path.join(root, 'PiXiEEDrawDEV/assets/js/app.js'), 'utf8');
const journalSource = fs.readFileSync(path.join(root, 'PiXiEEDrawDEV/assets/js/modules/local-project-journal-utils.js'), 'utf8');

const journalOnlyBranch = journalSource.match(
  /if \(!hasSnapshot && !useCheckpoint && next\.checkpointPersisted\) \{([\s\S]*?)\n\s*\}\n\s*if \(!hasSnapshot\)/
);
assert.ok(journalOnlyBranch, 'journal-only fast path must exist before checkpoint session creation');
assert.doesNotMatch(journalOnlyBranch[1], /buildAutosaveSessionPayload|buildProjectSessionPayload/);
assert.match(journalOnlyBranch[1], /history\?\.past/);
assert.match(journalOnlyBranch[1], /journalOnly: true/);

const sessionBuildIndex = journalSource.indexOf("const session = typeof buildAutosaveSessionPayload");
const noSnapshotReturnIndex = journalSource.indexOf("if (!hasSnapshot) {", journalSource.indexOf('function buildSavePlan'));
assert.ok(sessionBuildIndex > noSnapshotReturnIndex, 'complete session/timelapse data must be built only after a checkpoint snapshot exists');

assert.match(appSource, /function scheduleAutosaveThumbnailRefresh\(projectId,/);
assert.match(appSource, /isAutosaveInteractionBusy\(\) \|\| hasRecentSaveInteraction\(\) \|\| hasRecentViewportInteraction\(\)/);
assert.match(appSource, /const needsInitialThumbnail = !previousEntry\?\.thumbnail/);
assert.match(appSource, /const deferThumbnailRefresh = refreshThumbnail/);
assert.match(appSource, /thumbnail = previousEntry\?\.thumbnail \|\| null/);
const writeV2Body = appSource.match(/async function writeAutosaveV2Primary[\s\S]*?\n  }\n\n  async function/);
assert.ok(writeV2Body, 'V2 writer body must be available');
assert.doesNotMatch(writeV2Body[0], /await generateSnapshotThumbnail\(snapshot\)/, 'checkpoint persistence must not synchronously generate thumbnails');
assert.match(appSource, /if \(!journalOnly && deferThumbnailRefresh\) \{\s*scheduleAutosaveThumbnailRefresh/);
assert.match(appSource, /latestEntry\.updatedAt !== expectedUpdatedAt/);
assert.match(appSource, /autosaveDirtyGeneration !== scheduledGeneration/);

console.log('PiXiEEDrawDEV P4 deferred derived-data checks passed.');
