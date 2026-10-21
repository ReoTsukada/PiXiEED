import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
const socket = process.env.PIXIEED_SOCIAL_SQL_SOCKET;
const enabled = !!socket;
if (enabled && !/^\/tmp\/pixieed-social-backend-[\d]+\/socket$/.test(socket)) throw Error('Only the dedicated synthetic Unix socket is allowed');
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function sql(body,{fail,role='service_role',uid=A}={}) {
 const result=spawnSync('psql',['-X','-q','-A','-t','-h',socket,'-p','55432','-d','postgres','-v','ON_ERROR_STOP=1'],{encoding:'utf8',input:`begin;truncate public.sns_reports,public.sns_posts;set local role ${role};set local request.jwt.claim.sub='${uid}';${body};rollback;`});
 if(fail){assert.notEqual(result.status,0);assert.match(result.stderr,fail);return;}
 assert.equal(result.status,0,result.stderr);return result.stdout.trim();
}
const reserve=(key,vis='public',owner=A,kind='text',audio='')=>`public.pixieed_sns_reserve_post('${owner}','${key}',repeat('a',64),'${kind}','合成','本文','Synthetic','${vis}'${audio})`;
const k='10000000-0000-4000-8000-000000000001';

test('new server migration opts into only explicit grants and keeps legacy contracts separate',async()=>{
 const source=await readFile(new URL('../../supabase/migrations/20261020232509_sns_feed.sql',import.meta.url),'utf8');
 for(const table of ['sns_posts','sns_reports'])assert.match(source,new RegExp(`alter table public\\.${table} enable row level security`));
 assert.match(source,/revoke all on public\.sns_posts, public\.sns_reports from public, anon, authenticated/);
 assert.doesNotMatch(source,/security definer|alter default privileges|alter table public\.(?:user_posts|post_map_points|social_posts)|grant all/i);
 assert.doesNotMatch(source,/create table public\.sns_comments|pixieed_sns_create_comment/);
 assert.match(source,/grant select, insert, update, delete on public\.sns_posts, public\.sns_reports to service_role/);
});
test('real PostgreSQL: idempotency preserves one row and tombstone request identity',{skip:!enabled},()=>{
 const v=sql(`select ${reserve(k)};select ${reserve(k)};select count(*) from public.sns_posts;update public.sns_posts set state='deleted',visibility='private';select ${reserve(k)};select count(*) from public.sns_posts`);
 const lines=v.split('\n');assert.equal(JSON.parse(lines[0]).postId,JSON.parse(lines[1]).postId);assert.equal(lines[2],'1');assert.equal(JSON.parse(lines[3]).state,'deleted');assert.equal(lines[4],'1');
 sql(`select ${reserve(k)};select public.pixieed_sns_reserve_post('${A}','${k}',repeat('b',64),'text','合成','別本文','Synthetic','public')`,{fail:/sns_idempotency_conflict/});
});
test('real PostgreSQL: all browser table/RPC access denied; server-owned rows separated',{skip:!enabled},()=>{
 const grants=JSON.parse(sql(`select json_build_object('anonread',has_table_privilege('anon','public.sns_posts','select'),'authwrite',has_table_privilege('authenticated','public.sns_posts','insert'),'servicewrite',has_table_privilege('service_role','public.sns_posts','insert'),'authrpc',has_function_privilege('authenticated','public.pixieed_sns_finish_audio(uuid,uuid)','execute'),'anonreport',has_table_privilege('anon','public.sns_reports','select'))`));
 assert.deepEqual(grants,{anonread:false,authwrite:false,servicewrite:true,authrpc:false,anonreport:false});
 const v=sql(`select ${reserve(k)};select ${reserve('10000000-0000-4000-8000-000000000002','private',B)};select count(distinct owner_id) from public.sns_posts`);assert.equal(v.split('\n').at(-1),'2');
 sql('select * from public.sns_posts',{role:'authenticated',fail:/permission denied/});
 sql('select * from public.sns_posts',{role:'anon',fail:/permission denied/});
 sql(`select ${reserve(k)}`,{role:'authenticated',fail:/permission denied/});
 sql(`insert into public.sns_posts default values`,{role:'authenticated',fail:/permission denied/});
});
test('real PostgreSQL: identity immutable, invalid owner/body/audio rejected',{skip:!enabled},()=>{
 sql(`select ${reserve(k)};update public.sns_posts set owner_id='${B}'`,{fail:/sns_identity_immutable/});
 sql(`select public.pixieed_sns_reserve_post('${A}','${k}',repeat('a',64),'text','合成','','Synthetic','public')`,{fail:/sns_input_invalid/});
 sql(`select public.pixieed_sns_reserve_post('cccccccc-cccc-4ccc-8ccc-cccccccccccc','${k}',repeat('a',64),'text','合成','本文','Synthetic','public')`,{fail:/foreign key/});
 sql(`select ${reserve(k,'private',A,'music',",16777217,1,repeat('f',64)")}`,{fail:/sns_audio_invalid/});
});
test('real PostgreSQL: reports require public parent and never hide posts',{skip:!enabled},()=>{
 const p=`select ${reserve(k)};`;
 const id=`(select id from public.sns_posts limit 1)`;
 const report=`select public.pixieed_sns_report('${B}','sns:'||${id}::text,'spam','合成')`;
 const v=sql(p+report+`;select state||':'||visibility from public.sns_posts`);
 assert.equal(v.split('\n').at(-1),'ready:public');
 sql(p+`update public.sns_posts set state='deleted';`+report,{fail:/sns_target_not_public/});
});
test('real PostgreSQL: rate and capacity bounds include cleanup-pending tombstones',{skip:!enabled},()=>{
 const many=`do $$begin for i in 1..20 loop perform public.pixieed_sns_reserve_post('${A}',gen_random_uuid(),repeat('a',64),'text','合成','本文','Synthetic','private');end loop;end$$;`;
 sql(many+`select ${reserve(k)}`,{fail:/sns_post_rate_limited/});
 const audio=`do $$begin for i in 1..8 loop perform public.pixieed_sns_reserve_post('${A}',gen_random_uuid(),repeat('a',64),'music','合成','','Synthetic','private',16777216,1,repeat('f',64));end loop;end$$;update public.sns_posts set state='deleted',cleanup_pending=true;`;
 sql(audio+`select ${reserve(k,'private',A,'music',",1,1,repeat('f',64)")}`,{fail:/sns_music_capacity/});
});

test('real PostgreSQL: consent receipts stay append-only even under permissive service default grants',{skip:!enabled},()=>{
 const grants=JSON.parse(sql(`select json_build_object('read',has_table_privilege('service_role','public.posting_consents','select'),'append',has_table_privilege('service_role','public.posting_consents','insert'),'update',has_table_privilege('service_role','public.posting_consents','update'),'delete',has_table_privilege('service_role','public.posting_consents','delete'),'truncate',has_table_privilege('service_role','public.posting_consents','truncate'),'client',has_table_privilege('authenticated','public.posting_consents','select'))`));
 assert.deepEqual(grants,{read:true,append:true,update:false,delete:false,truncate:false,client:false});
 const insert=`insert into public.posting_consents(owner_id,purpose,request_key,request_digest,terms_version,privacy_version,terms_sha256,privacy_sha256)values('${A}','image','${k}',repeat('a',64),'synthetic-1','synthetic-1',repeat('b',64),repeat('c',64));`;
 assert.equal(sql(insert+'select count(*) from public.posting_consents'),'1');
 sql(insert+"update public.posting_consents set terms_version='forged'",{fail:/permission denied/});
 sql(insert+'delete from public.posting_consents',{fail:/permission denied/});
});
