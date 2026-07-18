import assert from 'node:assert/strict';
import fs from 'node:fs';

const devTools = fs.readFileSync('scripts/account-dev-tools.js', 'utf8');
const adPermissions = fs.readFileSync('scripts/account-ad-permissions.js', 'utf8');
const rewardBudget = fs.readFileSync('scripts/account-pageview-reward-budget.js', 'utf8');
const sharedAuth = fs.readFileSync('scripts/shared-auth-panel.js', 'utf8');

for (const [name, source] of [
  ['account-dev-tools', devTools],
  ['account-ad-permissions', adPermissions],
  ['account-pageview-reward-budget', rewardBudget]
]) {
  assert.match(source, /ACCESS_CHANGE_EVENTS/ , `${name} must filter auth events`);
  assert.match(source, /SIGNED_IN/);
  assert.match(source, /SIGNED_OUT/);
  assert.doesNotMatch(source, /location\.reload\(/, `${name} must not reload on auth events`);
}

assert.match(adPermissions, /init\(\{ refresh: true \}\)/);
assert.match(rewardBudget, /init\(\{ refresh: true \}\)/);
assert.match(devTools, /refresh\(\{ refresh: true \}\)/);
assert.match(sharedAuth, /event === 'SIGNED_OUT' \|\| event === 'USER_DELETED'/);
assert.match(sharedAuth, /writeCachedAuthSession\(session\)/);

console.log('Account auth-state stability guard passed.');
