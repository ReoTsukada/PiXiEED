// Isolated local PostgreSQL acceptance test. Never reads a project DB URL.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = mkdtempSync(join(tmpdir(), 'pixieed-delete-post-db-'));
const data = join(scratch, 'data');
const port = '55441';
const migrations = [
  '20260918102416_user_posting_system.sql',
  '20260918102444_published_map_visibility.sql',
  '20260918102715_map_visibility_security_definer.sql',
  '20260921011823_add_globe_post_cells.sql',
  '20260927062906_classify_globe_posts.sql',
  '20260927065511_expand_pixel_art_post_dimensions.sql',
  '20260927120000_verify_new_pixel_post_limits.sql',
  '20260927163635_add_social_post_map_points.sql',
  '20260927234715_complete_puzzle_publication.sql',
  '20261004113352_allow_rectangular_256_pixel_posts.sql',
  '20261004125700_enable_puzzle_ogp_publication.sql',
  '20261005194748_pixieed_delete_own_post.sql',
  '20261005194755_pixieed_post_author_names.sql',
];

function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', timeout: 45000, stdio: ['ignore', 'pipe', 'pipe'] });
}
function sql(source, label) {
  const file = join(scratch, label);
  writeFileSync(file, source);
  return run('psql', ['-X', '-h', scratch, '-p', port, '-U', 'pixieed_test_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', file]);
}

let started = false;
try {
  run('initdb', ['-D', data, '-U', 'pixieed_test_admin', '--auth=trust', '--encoding=UTF8', '--no-locale']);
  run('pg_ctl', ['-D', data, '-l', join(scratch, 'postgres.log'), '-o', `-k ${scratch} -h '' -p ${port}`, '-w', 'start']);
  started = true;
  sql(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
    alter table storage.objects enable row level security;
    grant usage on schema auth, storage, public to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    grant select on storage.objects to anon, authenticated;
    alter default privileges in schema public grant all on tables to service_role;
    alter default privileges in schema public grant all on sequences to service_role;
    create table public.social_posts (id uuid primary key, creator_user_id uuid references auth.users(id), status text, post_kind text, distribution_mode text, media_object_path text);
    grant select on public.social_posts to anon, authenticated;
  `, 'bootstrap.sql');
  for (const name of migrations) {
    sql(readFileSync(join(root, 'supabase/migrations', name), 'utf8'), name);
    console.log(`MIGRATION PASS: ${name}`);
  }
  console.log(sql(readFileSync(join(root, 'tests/creation-suite/delete-post.sql'), 'utf8'), 'delete-post.sql').trim());
  console.log('DELETE POST DB: PASS (disposable local PostgreSQL; remote DB/Auth/Storage and production remain untested).');
} catch (error) {
  if (error.stdout) console.error(error.stdout.toString());
  console.error(error.stderr?.toString() || error.message);
  console.error('DELETE POST DB: FAIL');
  process.exitCode = 1;
} finally {
  if (started) {
    try { run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']); }
    catch (error) { console.error(`Test DB shutdown failed: ${error.message}`); process.exitCode = 1; }
  }
  console.log(`Local test evidence: ${scratch}`);
}
