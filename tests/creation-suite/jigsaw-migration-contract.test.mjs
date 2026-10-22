import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL('../../supabase/migrations/20261021121542_jigsaw_publication.sql', import.meta.url);
const fixturePath = new URL('./fixtures/jigsaw-catalog-contract.json', import.meta.url);
const md5 = (value) => createHash('md5').update(value).digest('hex');
const definitions = {
  pixieed_valid_puzzle_source: {
    signature: 'public.pixieed_valid_puzzle_source(text,jsonb)',
    args: 'p_mode text, p_source jsonb',
    identityArgs: 'p_mode text, p_source jsonb',
    reverse: (value) => replaceOnce(value, "elsif p_mode in ('hidden_object', 'jigsaw') then", "elsif p_mode = 'hidden_object' then"),
  },
  pixieed_valid_puzzle_definition: {
    signature: 'public.pixieed_valid_puzzle_definition(text,jsonb)',
    args: 'p_mode text, p_definition jsonb',
    identityArgs: 'p_mode text, p_definition jsonb',
    reverse: (value) => replaceOnce(value, JIGSAW_BRANCH, ''),
  },
  pixieed_create_post: {
    signature: 'public.pixieed_create_post(jsonb,jsonb,jsonb)',
    args: 'p_post jsonb, p_location jsonb, p_puzzle jsonb DEFAULT NULL::jsonb',
    identityArgs: 'p_post jsonb, p_location jsonb, p_puzzle jsonb',
    reverse: (value) => replaceOnce(value, "p_puzzle->>'mode' not in ('spot_difference','hidden_object','jigsaw')", "p_puzzle->>'mode' not in ('spot_difference','hidden_object')"),
  },
  pixieed_moderate_post: {
    signature: 'public.pixieed_moderate_post(uuid,text,text,jsonb,text)',
    args: 'p_post_id uuid, p_action text, p_note text, p_point jsonb DEFAULT NULL::jsonb, p_changed_public_path text DEFAULT NULL::text',
    identityArgs: 'p_post_id uuid, p_action text, p_note text, p_point jsonb, p_changed_public_path text',
    reverse: (value) => replaceOnce(value, "(v_puzzle.mode in ('hidden_object','jigsaw') and p_changed_public_path is not null)", "(v_puzzle.mode = 'hidden_object' and p_changed_public_path is not null)"),
  },
};
const JIGSAW_BRANCH = `  if p_mode = 'jigsaw' then
    return public.pixieed_json_object_size(p_definition) = 7
      and p_definition ?& array['schemaVersion','width','height','confirmed','layoutVersion','pieceSize','seed']
      and jsonb_typeof(p_definition->'width') = 'number'
      and jsonb_typeof(p_definition->'height') = 'number'
      and p_definition->'layoutVersion' = '1'::jsonb
      and jsonb_typeof(p_definition->'pieceSize') = 'number'
      and coalesce(p_definition->>'pieceSize','') ~ '^[0-9]{1,3}$'
      and (p_definition->>'pieceSize')::integer between 3 and greatest(v_width,v_height)
      and jsonb_typeof(p_definition->'seed') = 'string'
      and coalesce(p_definition->>'seed','') ~ '^[A-Za-z0-9_-]{1,128}$'
      and greatest(1,v_width / (p_definition->>'pieceSize')::integer)
        * greatest(1,v_height / (p_definition->>'pieceSize')::integer) <= 4096;
  end if;

`;

function replaceOnce(value, before, after) {
  assert.equal(value.split(before).length - 1, 1, `expected one exact branch to reverse: ${before}`);
  return value.replace(before, after);
}

async function readDefinitions() {
  const sql = await readFile(migrationPath, 'utf8');
  const result = {};
  for (const [name, { signature }] of Object.entries(definitions)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${escaped}\\([\\s\\S]*?\\n\\$function\\$;`));
    assert.ok(match, `complete DDL is present for ${name}`);
    result[name] = match[0].slice(0, -1);
    assert.match(result[name], new RegExp(`^CREATE OR REPLACE FUNCTION public\\.${name}\\(${definitions[name].args.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`));
  }
  return { sql, result };
}

test('observed definition-validator anchor occurs twice; only top-level dispatch is extended', async () => {
  const { result } = await readDefinitions();
  const definition = result.pixieed_valid_puzzle_definition;
  const anchor = "  if p_mode = 'spot_difference' then";
  assert.equal(definition.split(anchor).length - 1, 2, 'the observed validator has both top-level and nested spot branches');
  const sharedDimensionCheck = 'if v_width < 8 or v_width > 512 or v_height < 8 or v_height > 512 then return false; end if;';
  assert.ok(definition.indexOf(sharedDimensionCheck) < definition.indexOf(JIGSAW_BRANCH));
  assert.ok(definition.indexOf(JIGSAW_BRANCH) < definition.indexOf(anchor));
  assert.equal(definition.split("if p_mode = 'spot_difference' then").length - 1, 2);
  assert.equal(definition.split("if p_mode = 'spot_difference' then\n      if public.pixieed_json_object_size(v_row) <> 2").length - 1, 1,
    'nested row-specific spot validation remains unchanged');
});

test('reversing only the four jigsaw additions reproduces each observed full-definition fingerprint', async () => {
  const { result } = await readDefinitions();
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  for (const [name, contract] of Object.entries(definitions)) {
    const metadata = fixture.functions.find((item) => item.name === name);
    assert.ok(metadata, `catalog metadata exists for ${name}`);
    assert.equal(metadata.signature, contract.identityArgs);
    const restored = `${contract.reverse(result[name])}\n`;
    assert.equal(md5(restored), metadata.definitionMd5, `${name} has no unrelated body change`);
    assert.equal(metadata.searchPathEmpty, true);
    assert.equal(metadata.anonExecute, false);
    assert.equal(metadata.authenticatedExecute, false);
    assert.equal(metadata.serviceExecute, true);
    assert.equal(metadata.securityDefiner, false);
  }
});

test('preflight checks four functions and only independently approved exact constraints before DDL', async () => {
  const { sql } = await readDefinitions();
  const preflightEnd = sql.indexOf('$jigsaw_preflight$;', sql.indexOf('do $jigsaw_preflight$'));
  const firstDdl = sql.search(/CREATE OR REPLACE FUNCTION|ALTER TABLE|REVOKE ALL|GRANT EXECUTE/i);
  assert.ok(preflightEnd >= 0 && firstDdl > preflightEnd);
  const approvedBlock = sql.match(/approved_constraints constant jsonb := \$approved_constraint_json\$([\s\S]*?)\$approved_constraint_json\$::jsonb;/);
  assert.ok(approvedBlock, 'release approval contains exact reviewed constraint definitions');
  assert.match(sql, /jigsaw_constraint_review_required/);
  assert.match(sql, /jigsaw_constraint_definition_changed/);
  assert.match(sql, /pg_get_functiondef\(fn\)/);
  assert.match(sql, /md5\(actual_definition\) is distinct from expected_functions->>function_name/);
  assert.match(sql, /pg_get_function_identity_arguments\(fn\)/);
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  assert.equal(fixture.functions.length, 4);
  assert.equal(fixture.constraints.length, 4);
  const expectedBlock = sql.match(/expected_constraints constant jsonb := \$constraint_json\$([\s\S]*?)\$constraint_json\$::jsonb;/);
  assert.ok(expectedBlock, 'the exact observed constraint definitions are encoded in preflight');
  assert.deepEqual(JSON.parse(expectedBlock[1]), Object.fromEntries(fixture.constraints.map(({ name, definition }) => [name, definition])));
  assert.deepEqual(JSON.parse(approvedBlock[1]), Object.fromEntries(fixture.constraints.map(({ name, definition }) => [name, definition])));
  assert.match(sql, /approved_constraints->>constraint_name is distinct from actual_constraint/);
});

test('jigsaw shares source, image, pending-review, and no-changed-image rules without changing old modes', async () => {
  const { sql, result } = await readDefinitions();
  assert.match(result.pixieed_valid_puzzle_source, /elsif p_mode in \('hidden_object', 'jigsaw'\) then/);
  assert.match(result.pixieed_valid_puzzle_source, /p_source \? 'changed'/);
  assert.match(result.pixieed_valid_puzzle_definition, /public\.pixieed_json_object_size\(p_definition\) = 7/);
  assert.match(result.pixieed_valid_puzzle_definition, /jsonb_typeof\(p_definition->'width'\) = 'number'/);
  assert.match(result.pixieed_valid_puzzle_definition, /jsonb_typeof\(p_definition->'height'\) = 'number'/);
  assert.match(result.pixieed_valid_puzzle_definition, /\) <= 4096/);
  assert.match(result.pixieed_create_post, /p_puzzle->>'mode' not in \('spot_difference','hidden_object','jigsaw'\)/);
  assert.match(result.pixieed_create_post, /elsif p_puzzle \? 'changed_image_path' or p_puzzle \? 'changed_image_claim' then/);
  assert.match(result.pixieed_create_post, /'pending', p_puzzle->>'changed_image_path', p_puzzle->'changed_image_claim'/);
  assert.match(result.pixieed_moderate_post, /v_puzzle\.mode in \('hidden_object','jigsaw'\) and p_changed_public_path is not null/);
  assert.match(result.pixieed_moderate_post, /elsif p_changed_public_path is not null then\s+raise exception 'changed_public_path_unexpected'/);
  assert.match(sql, /mode in \('hidden_object','jigsaw'\) and changed_image_path is null and changed_image_claim is null/);
  assert.match(sql, /mode = 'spot_difference' and changed_image_path is not null/);
  assert.match(sql, /revoke all on function public\.pixieed_create_post\(jsonb,jsonb,jsonb\) from public,anon,authenticated/);
  assert.match(sql, /grant execute on function public\.pixieed_create_post\(jsonb,jsonb,jsonb\) to service_role/);
  assert.doesNotMatch(sql, /create\s+(?:policy|table)|insert\s+into\s+(?:storage\.|public\.pixfind|auth\.)|grant[^;]+to\s+(?:anon|authenticated)/i);
});
