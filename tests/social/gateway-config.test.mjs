import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('mixed public feed and Auth-verified owner functions accept asymmetric sessions without changing the moderator gateway', async () => {
  const config = await readFile(new URL('../../supabase/config.toml', import.meta.url), 'utf8');
  const verify = name => config.split(`[functions.${name}]`)[1]?.split(/\n\[/)[0].match(/^verify_jwt\s*=\s*(true|false)/m)?.[1];
  for (const name of ['social-feed', 'create-post', 'delete-post', 'set-author-name']) {
    assert.equal(verify(name), 'false', `${name} relies on server Auth.getUser, not the legacy shared-secret Gateway`);
    const handler = await readFile(new URL(`../../supabase/functions/${name}/index.ts`, import.meta.url), 'utf8');
    assert.match(handler, /auth\.getUser\(/);
    assert.match(handler, /authentication_required/);
  }
  assert.equal(verify('public-post-puzzle'), 'false');
  assert.equal(verify('moderate-post'), 'true', 'privileged moderation configuration stays separate');
});
