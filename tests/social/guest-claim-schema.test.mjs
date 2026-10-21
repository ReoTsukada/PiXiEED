import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const migrationPath = resolve(import.meta.dirname, '../../supabase/migrations/20261021092108_guest_claim.sql');
const sql = await readFile(migrationPath, 'utf8');

test('guest claim is an invoker RPC with service-only verified-identity boundary', () => {
  assert.match(sql, /create function public\.pixieed_sns_claim_guest\([\s\S]*?returns jsonb language plpgsql security invoker set search_path = ''/);
  assert.doesNotMatch(sql, /from auth\.users|grant[^;]*auth\.users/i);
  assert.doesNotMatch(sql, /auth\.users[^;]*(raw_user_meta_data|user_metadata)/i);
  assert.match(sql, /revoke all on function public\.pixieed_sns_claim_guest\(uuid,uuid,uuid\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.pixieed_sns_claim_guest\(uuid,uuid,uuid\) to service_role/);
});

test('claim ledger retains identity pending a retention policy and binds replay keys', () => {
  assert.match(sql, /create table public\.sns_guest_claims\s*\([\s\S]*?guest_id uuid primary key references auth\.users\(id\) on delete restrict[\s\S]*?unique \(owner_id, request_key\)/);
  assert.match(sql, /revoke all on table public\.sns_guest_claims from public, anon, authenticated/);
  assert.match(sql, /grant select, insert, update, delete on table public\.sns_guest_claims to service_role/);
  assert.match(sql, /sns_guest_claimed/);
  assert.match(sql, /sns_claim_conflict/);
});

test('claim serializes creates, rejects pending work, combined music overflow, and key collisions', () => {
  assert.match(sql, /hashtextextended\('sns-post:' \|\| v_lock_id::text, 0\)/);
  assert.match(sql, /create trigger sns_posts_reject_claimed_guest_write/);
  assert.match(sql, /create trigger user_posts_reject_claimed_guest_write/);
  assert.match(sql, /sns_claim_pending/);
  assert.match(sql, /v_guest_bytes\+v_owner_bytes > 134217728/);
  assert.match(sql, /raise exception 'sns_music_capacity'/);
  assert.match(sql, /sns_claim_conflict/);
  assert.match(sql, /for update/);
});

test('authorship moves while original media owners and object path layout remain authoritative', () => {
  assert.match(sql, /add column if not exists media_author_id uuid references auth\.users\(id\) on delete restrict/);
  assert.match(sql, /add column if not exists media_owner_id uuid references auth\.users\(id\) on delete restrict/);
  assert.match(sql, /media_author_id=coalesce\(media_author_id,author_id\), author_id=p_owner_id/);
  assert.match(sql, /create trigger user_posts_claim_identity before update of author_id, media_author_id/);
  assert.match(sql, /new.media_author_id is distinct from coalesce\(old.media_author_id, old.author_id\)/);
  assert.match(sql, /if new\.media_owner_id is distinct from old\.media_owner_id then raise exception/);
  assert.match(sql, /'guestId',p_guest_id,'ownerId',p_owner_id,'requestKey',p_request_key/);
  assert.doesNotMatch(sql, /sns_comments|sns_comment/);
  assert.match(sql, /coalesce\(v_post\.media_author_id, v_post\.author_id\)::text/);
  assert.match(sql, /v_point\.public_image_path !~ \('\^' \|\| p_post_id::text/);
});

test('claim never rewrites registered author profiles and preserves deletion RPC ACLs', () => {
  assert.doesNotMatch(sql, /update public\.post_author_profiles|insert into public\.post_author_profiles/i);
  assert.match(sql, /create or replace function public\.pixieed_delete_own_post/);
  assert.match(sql, /create or replace function public\.pixieed_complete_own_post_delete/);
  assert.match(sql, /revoke all on function public\.pixieed_delete_own_post\(uuid, uuid\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.pixieed_delete_own_post\(uuid, uuid\) to service_role/);
  assert.match(sql, /revoke all on function public\.pixieed_complete_own_post_delete\(uuid, uuid\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.pixieed_complete_own_post_delete\(uuid, uuid\) to service_role/);
});
