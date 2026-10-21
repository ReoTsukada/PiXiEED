import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('public, owner and moderator functions accept asymmetric sessions with their handler authorization intact', async () => {
  const config = await readFile(new URL('../../supabase/config.toml', import.meta.url), 'utf8');
  const verify = name => config.split(`[functions.${name}]`)[1]?.split(/\n\[/)[0].match(/^verify_jwt\s*=\s*(true|false)/m)?.[1];
  for (const name of ['social-feed', 'create-post', 'delete-post', 'set-author-name']) {
    assert.equal(verify(name), 'false', `${name} relies on server Auth.getUser, not the legacy shared-secret Gateway`);
    const handler = await readFile(new URL(`../../supabase/functions/${name}/index.ts`, import.meta.url), 'utf8');
    assert.match(handler, /auth\.getUser\(/);
    assert.match(handler, /authentication_required/);
  }
  assert.equal(verify('public-post-puzzle'), 'false');
  assert.equal(verify('moderate-post'), 'false', 'moderator also verifies asymmetric sessions with Auth.getUser');
  const moderator = await readFile(new URL('../../supabase/functions/moderate-post/index.ts', import.meta.url), 'utf8');
  assert.match(moderator, /auth\.getUser\(token\)/);
  assert.match(moderator, /data\.user\.app_metadata\?\.role === "admin"/);
  assert.match(moderator, /data\.user\.is_anonymous \|\| \(!hasAdminRole && !isAllowlisted\)/);
  assert.match(moderator, /admin_access_required/);
});
