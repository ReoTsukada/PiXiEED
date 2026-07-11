import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const index = read('PiXiEEDrawDEV/index.html');
const edition = read('PiXiEEDrawDEV/assets/js/modules/edition-capabilities-utils.js');
const benefits = read('PiXiEEDrawDEV/assets/js/modules/pixieed-support-benefit-utils.js');
const accountWorkflow = read('PiXiEEDrawDEV/assets/js/modules/pixieed-account-workflow-utils.js');
const localization = read('PiXiEEDrawDEV/assets/js/modules/ui-localization-utils.js');

assert.doesNotMatch(index, /pixieed-adfree\.js/, 'DEV must not load the advertising-off entitlement script');
assert.match(index, /support-checkout-panel\.js/, 'generic support and marketplace infrastructure remains available');
assert.doesNotMatch(edition, /pixieedAdFree/, 'advertising capability must not read legacy entitlements');
assert.doesNotMatch(benefits, /window\.pixieedAdFree/, 'support UI synchronization must not read legacy entitlements');
assert.doesNotMatch(accountWorkflow, /window\.pixieedAdFree/, 'account initialization must not subscribe to advertising-off entitlements');
assert.doesNotMatch(localization, /pixieedAdFree(Field|Status|Purchase)/, 'advertising-off UI must not be localized in DEV');

console.log('PiXiEEDraw DEV Phase G3-B advertising-off UI removal checks passed');
