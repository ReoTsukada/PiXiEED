import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = (relativePath) => JSON.parse(read(relativePath));

const publicIndex = read('pixiedraw2/src/pixync/index.ts');
const composition = read('pixiedraw2/src/pixync/composition-root.ts');
const durableTransport = read('pixiedraw2/src/pixync/durable-transport.ts');
const authorityManifest = json('docs/inventory/pixync-draw2-190-preflight-manifest.json');
const durableManifest = json('docs/inventory/pixync-draw2-200-preflight-manifest.json');

assert.match(publicIndex, /transport-neutral Draw2 PiXYNC boundary/);
assert.match(publicIndex, /PixyncInMemorySequencer/);
for (const forbidden of ['PixyncTransportAdapter', 'PixyncDurableTransportCoordinator', 'Supabase']) {
  assert.doesNotMatch(publicIndex, new RegExp(forbidden, 'i'), `Transport leaked through public index: ${forbidden}`);
}
assert.match(composition, /PixyncProductionCompositionRoot/);
assert.match(composition, /PixyncDurableTransportCoordinator/);
assert.match(composition, /PixyncSupabaseProvider/);
assert.match(durableTransport, /fencing|lease|catchUp|reconcile/i);

assert.equal(authorityManifest.designGate.status, 'AUTHORITY_DESIGN_GATE_READY_FOR_TERRA');
assert.equal(authorityManifest.designGate.currentDecision, 'SYNTHETIC_TRANSPORT_BOUNDARY_ONLY');
assert.equal(authorityManifest.evidenceSeparation.semanticAcceptanceStatus, 'PENDING');
assert.equal(durableManifest.designGate.status, 'DURABLE_TRANSPORT_DESIGN_GATE_READY_FOR_TERRA');
assert.equal(durableManifest.designGate.currentDecision, 'SYNTHETIC_DURABLE_TRANSPORT_ONLY');
assert.equal(durableManifest.evidenceSeparation.semanticAcceptanceStatus, 'PENDING');

console.log('PiXYNC readiness audit passed: public transport-free boundary and isolated durable composition are intact; Terra/provider acceptance remains pending.');
