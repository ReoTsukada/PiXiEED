#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || process.cwd());
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const errors = [];
const registry = JSON.parse(read('00_START_HERE/WORK_PACKAGE_REGISTRY.json'));
const queue = read('00_START_HERE/IMPLEMENTATION_QUEUE.yaml');
const state = read('.codex/PIXIEED_IMPLEMENTATION_STATE.yaml');
const roadmap = read('09_ROADMAP/PIXIEED_COMPLETION_ROADMAP.md');

const value = (text, key) => text.match(new RegExp(`^\\s*${key}:\\s*([^#\\n]+)`, 'm'))?.[1].trim();
const registryCurrent = registry.authority?.currentReadyPackage;
const queueCurrent = value(queue, 'current_ready_package');
const roadmapCurrent = value(roadmap, 'current_ready_package');
const stateCurrent = value(state, 'work_package');
const stateStatus = value(state, 'status');
const current = registry.packages?.find((pkg) => pkg.id === registryCurrent);

for (const [label, actual] of Object.entries({ queue: queueCurrent, roadmap: roadmapCurrent, state: stateCurrent })) {
  if (actual !== registryCurrent) errors.push(`current package mismatch: registry=${registryCurrent} ${label}=${actual}`);
}
if (!current) errors.push(`registry current package is missing: ${registryCurrent}`);
if (current && stateStatus !== current.status) errors.push(`current status mismatch: registry=${current.status} state=${stateStatus}`);

const packageFiles = ['WP-900', 'WP-970', 'WP-980'];
for (const id of packageFiles) {
  const pkg = registry.packages?.find((entry) => entry.id === id);
  const definition = read(`09_ROADMAP/WORK_PACKAGES/${id}.md`);
  const defined = [...definition.matchAll(/`([A-Z]+\\d+-[A-Z0-9-]+-\\d+)`/g)].map((match) => match[1]);
  const registered = pkg?.acceptanceIds || [];
  for (const acceptanceId of defined) {
    if (!registered.includes(acceptanceId)) errors.push(`acceptance ID absent from registry: ${id} ${acceptanceId}`);
  }
}

if (errors.length) {
  console.error(errors.map((error) => `FAIL ${error}`).join('\n'));
  process.exit(1);
}
console.log(`PASS canonical package alignment (${registryCurrent}, ${current.status})`);
