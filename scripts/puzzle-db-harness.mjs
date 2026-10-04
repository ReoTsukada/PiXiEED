// Independent PostgreSQL acceptance tests. Never reads a project DB URL.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = mkdtempSync(join(tmpdir(), 'pixieed-puzzle-db-'));
const data = join(scratch, 'data');
const port = '55439'; // Unix socket lives under the unique scratch directory.
const migrationDir = join(root, 'supabase/migrations');
const publication = readdirSync(migrationDir).filter((name) => name.endsWith('_complete_puzzle_publication.sql'));
if (publication.length !== 1) throw new Error('Exactly one complete_puzzle_publication migration is required');
const rollout = readdirSync(migrationDir).filter(name => name.endsWith('_enable_puzzle_ogp_publication.sql'));
if (rollout.length !== 1) throw new Error('Exactly one enable_puzzle_ogp_publication migration is required');
const productionShape = process.argv.includes('--production-shape');
const migrations = productionShape ? [
  '20260918102416_user_posting_system.sql',
  '20260918102444_published_map_visibility.sql',
  '20260918102715_map_visibility_security_definer.sql',
  '20260921011823_add_globe_post_cells.sql',
  '20260927065511_expand_pixel_art_post_dimensions.sql',
  '20261004113352_allow_rectangular_256_pixel_posts.sql',
  rollout[0],
] : [
  '20260918102416_user_posting_system.sql',
  '20260918102444_published_map_visibility.sql',
  '20260918102715_map_visibility_security_definer.sql',
  '20260921011823_add_globe_post_cells.sql',
  '20260927062906_classify_globe_posts.sql',
  '20260927065511_expand_pixel_art_post_dimensions.sql',
  '20260927120000_verify_new_pixel_post_limits.sql',
  '20260927163635_add_social_post_map_points.sql',
  publication[0],
  '20261004113352_allow_rectangular_256_pixel_posts.sql',
  rollout[0],
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
    alter default privileges in schema public grant all on tables to service_role;
    alter default privileges in schema public grant all on sequences to service_role;
    grant select on auth.users to service_role;
    create table public.social_posts (id uuid primary key, creator_user_id uuid references auth.users(id), status text, post_kind text, distribution_mode text, media_object_path text);
    grant select on public.social_posts to anon, authenticated;
  `, 'bootstrap.sql');
  for (const name of migrations) {
    if (name === '20260927120000_verify_new_pixel_post_limits.sql' ||
      (productionShape && name === '20261004113352_allow_rectangular_256_pixel_posts.sql')) {
      sql(`insert into auth.users(id) values ('00000000-0000-4000-8000-000000000001');
        insert into public.user_posts(id,author_id,title,image_path,image_mime,image_bytes,image_width,image_height,color_count,content_hash)
        values ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Legacy preservation','legacy/source.webp','image/webp',100,512,512,512,repeat('a',64));`, 'legacy.sql');
    }
    sql(readFileSync(join(migrationDir, name), 'utf8'), name);
    console.log(`MIGRATION PASS: ${name}`);
  }
  const migrationOnly = process.argv.includes('--migrations-only');
  if (!migrationOnly) {
    const result = sql(readFileSync(join(root, 'tests/creation-suite/puzzle-publication.sql'), 'utf8'), 'acceptance.sql');
    console.log(result.trim());
    if (!productionShape) {
      console.log(sql(readFileSync(join(root, 'tests/creation-suite/legacy-placement.sql'), 'utf8'), 'legacy-placement.sql').trim());
    }
  }
  sql(`do $$ begin
    update public.user_posts set status='rejected', moderation_note='Historical moderation remains possible'
      where id='00000000-0000-4000-8000-000000000002';
    if not exists(select 1 from public.user_posts where id='00000000-0000-4000-8000-000000000002' and image_mime='image/webp' and color_count=512 and image_width=512 and image_height=512 and status='rejected' and title='Legacy preservation') then
      raise exception 'legacy row changed';
    end if;
    begin
      update public.user_posts set image_path='legacy/replaced.png' where id='00000000-0000-4000-8000-000000000002';
      raise exception 'historical image replacement unexpectedly passed new image trigger';
    exception when check_violation then null;
    end;
    if (select image_path from public.user_posts where id='00000000-0000-4000-8000-000000000002') <> 'legacy/source.webp' then
      raise exception 'rejected historical image replacement changed the stored row';
    end if;
  end $$;`, 'preservation.sql');
  if (process.argv.includes('--integration')) {
    const fixtures = join(scratch, 'public-fixtures.json');
    const result = execFileSync('deno', ['test', '--allow-env', '--allow-run=psql', '--allow-read', `--allow-write=${fixtures}`, 'tests/creation-suite/publication-integration.test.ts'], {
      cwd: root, encoding: 'utf8', timeout: 90000,
      env: { ...process.env, PIXIEED_TEST_PG_SOCKET: scratch, PIXIEED_TEST_PUBLIC_FIXTURES: fixtures }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    console.log(result.trim());
  }
  console.log(migrationOnly
    ? 'MIGRATIONS: PASS. DB acceptance: UNTESTED (migrations-only).'
    : 'DB: PASS (real PostgreSQL; test auth/storage schemas). Supabase HTTP/Auth/Storage services and production: UNTESTED.');
} catch (error) {
  if (error.stdout) console.error(error.stdout.toString());
  console.error(error.stderr?.toString() || error.message);
  console.error('DB: FAIL');
  process.exitCode = 1;
} finally {
  if (started) {
    try { run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']); }
    catch (error) { console.error(`Test DB shutdown failed: ${error.message}`); process.exitCode = 1; }
  }
  console.log(`Local test evidence: ${scratch}`);
}
