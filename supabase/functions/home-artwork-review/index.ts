import { createClient } from "npm:@supabase/supabase-js@2.106.2";
import { keyAwareFetch } from "../_shared/key-aware-fetch.ts";
import { rpcRecord } from "../_shared/post-publication.ts";


const env = (name: string) => Deno.env.get(name)?.trim() || "";
const supabaseUrl = env("SUPABASE_URL");

function defaultKeyDictionaryValue(name: string) {
  try {
    const values = JSON.parse(Deno.env.get(name) || "") as Record<
      string,
      unknown
    >;
    const value = values.default ||
      Object.values(values).find((entry) => typeof entry === "string");
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

const publishableKey = env("SUPABASE_PUBLISHABLE_KEY") ||
  env("SUPABASE_ANON_KEY") ||
  defaultKeyDictionaryValue("SUPABASE_PUBLISHABLE_KEYS");
const secretKey = env("SUPABASE_SECRET_KEY") ||
  env("SUPABASE_SERVICE_ROLE_KEY") ||
  defaultKeyDictionaryValue("SUPABASE_SECRET_KEYS");
const LOCAL_ORIGINS = new Set([
  "https://pixieed.jp",
  "https://www.pixieed.jp",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
]);

function allowedOrigins() {
  return env("PUBLIC_SITE_ORIGIN").split(",").map((origin) => origin.trim())
    .filter(Boolean);
}

const corsHeaders = (request: Request): HeadersInit => {
  const requestOrigin = request.headers.get("origin") || "";
  const configuredOrigins = allowedOrigins();
  const originIsAllowed = !requestOrigin ||
    (configuredOrigins.length
      ? configuredOrigins.includes(requestOrigin)
      : LOCAL_ORIGINS.has(requestOrigin));
  return {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Origin": requestOrigin
      ? (originIsAllowed ? requestOrigin : "null")
      : (configuredOrigins[0] || "null"),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
  };
};

const json = (request: Request, body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });

const fail = (request: Request, message: string, status = 400) =>
  json(request, { ok: false, error: message }, status);

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value);

function getBearerToken(request: Request) {
  const value = request.headers.get("authorization") || "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
}

function adminUserIds() {
  return new Set(
    env("SUPABASE_ADMIN_USER_IDS").split(",").map((value) => value.trim())
      .filter(Boolean),
  );
}

async function requireAdmin(request: Request, config: { projectUrl: string; publishableKey: string; serviceKey: string; createClient: typeof createClient }) {
  const token = getBearerToken(request);
  if (!token) {
    return {
      user: null,
      error: "authentication_required" as const,
      status: 401,
    };
  }
  if (!config.projectUrl || !config.publishableKey || !config.serviceKey) {
    return {
      user: null,
      error: "function_not_configured" as const,
      status: 503,
    };
  }

  const userClient = config.createClient(config.projectUrl, config.publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: { fetch: keyAwareFetch(config.publishableKey) },
  });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) {
    return {
      user: null,
      error: "authentication_required" as const,
      status: 401,
    };
  }

  const hasAdminRole = data.user.app_metadata?.role === "admin";
  const isAllowlisted = adminUserIds().has(data.user.id);
  if (data.user.is_anonymous || (!hasAdminRole && !isAllowlisted)) {
    return { user: null, error: "admin_access_required" as const, status: 403 };
  }
  return { user: data.user, error: null, status: 200 };
}

const HASH = /^[0-9a-f]{64}$/;
const UUID_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.png$/;
const MAX_BYTES = 262144;

/** Structural PNG validation. APNG controls are forbidden, including a single-frame APNG. */
export function isStillPng(bytes: Uint8Array): boolean {
  if (bytes.length < 45 || ![137,80,78,71,13,10,26,10].every((value,i)=>bytes[i]===value)) return false;
  const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let offset=8, ihdr=false, idat=false;
  while (offset+12<=bytes.length) {
    const length=view.getUint32(offset), end=offset+12+length;
    if (end>bytes.length) return false;
    let crc=0xffffffff;
    for(let i=offset+4;i<offset+8+length;i++) { crc^=bytes[i]; for(let bit=0;bit<8;bit++) crc=(crc>>>1)^((crc&1)?0xedb88320:0); }
    if(((crc^0xffffffff)>>>0)!==view.getUint32(offset+8+length)) return false;
    const type=String.fromCharCode(...bytes.subarray(offset+4,offset+8));
    if (['acTL','fcTL','fdAT'].includes(type)) return false;
    if (!ihdr && type!=='IHDR') return false;
    if (type==='IHDR') {
      if (ihdr || length!==13 || view.getUint32(offset+8)<1 || view.getUint32(offset+12)<1) return false;
      ihdr=true;
    }
    if (type==='IDAT') idat=true;
    if (type==='IEND') return length===0 && idat && end===bytes.length;
    offset=end;
  }
  return false;
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const reader=request.body?.getReader(); if (!reader) return null;
    const chunks: Uint8Array[]=[]; let size=0;
    for (;;) { const {done,value}=await reader.read(); if(done) break; size+=value.length; if(size>2048) { await reader.cancel(); return null; } chunks.push(value); }
    const bytes=new Uint8Array(size); let offset=0; for(const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.length; }
    const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    return body && typeof body==='object' && !Array.isArray(body) ? body : null;
  } catch { return null; }
}

export async function verifyReviewImage(item: Record<string, unknown>, projectUrl: string, fetchImpl: typeof fetch=fetch): Promise<boolean> {
  const path=String(item.imagePath||''), expected=Number(item.imageBytes), hash=String(item.imageSha256||'');
  if (!UUID_PATH.test(path) || !Number.isInteger(expected) || expected<1 || expected>MAX_BYTES || !HASH.test(hash)) return false;
  const url=new URL(`/storage/v1/object/public/post-public/${path}`,projectUrl);
  const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),10000);
  try {
    const response=await fetchImpl(url,{credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal});
    if(!response.ok || !response.body) return false;
    const declared=response.headers.get('content-length'); if(declared!==null && Number(declared)!==expected) { await response.body.cancel(); return false; }
    const reader=response.body.getReader(), chunks: Uint8Array[]=[]; let size=0;
    for(;;) { const {done,value}=await reader.read(); if(done)break; size+=value.length; if(size>expected || size>MAX_BYTES) { await reader.cancel(); return false; } chunks.push(value); }
    if(size!==expected) return false;
    const bytes=new Uint8Array(size); let offset=0; for(const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.length; }
    if(!isStillPng(bytes)) return false;
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
    return digest===hash;
  } catch { return false; } finally { clearTimeout(timeout); }
}

type Dependencies={projectUrl?:string;publishableKey?:string;serviceKey?:string;createClient?:typeof createClient;fetchImpl?:typeof fetch};
export async function homeArtworkReviewHandler(request: Request,deps: Dependencies={}) {
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:corsHeaders(request)});
  if(!['GET','POST'].includes(request.method)) return fail(request,'method_not_allowed',405);
  const config={projectUrl:deps.projectUrl??supabaseUrl,publishableKey:deps.publishableKey??publishableKey,serviceKey:deps.serviceKey??secretKey,createClient:deps.createClient??createClient};
  try {
    const auth=await requireAdmin(request,config);
    if(auth.error || !auth.user) return fail(request,auth.error||'authentication_required',auth.status);
    const admin=config.createClient(config.projectUrl,config.serviceKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:keyAwareFetch(config.serviceKey)}});
    if(request.method==='GET') {
      const params=new URL(request.url).searchParams;
      if([...params.keys()].some(key=>!['state','after','limit'].includes(key))) return fail(request,'invalid_query');
      const state=params.get('state')||'all',after=params.get('after')||null,limit=Number(params.get('limit')||24);
      if(!['all','pending','approved','held'].includes(state) || (after!==null&&!isUuid(after)) || !Number.isInteger(limit)||limit<1||limit>24) return fail(request,'invalid_query');
      const result=await admin.rpc('pixieed_home_review_list',{p_state:state,p_after:after,p_limit:limit});
      const data=!result.error?rpcRecord(result.data):null;
      if(!data || !Array.isArray(data.artworks)) return fail(request,'review_unavailable',503);
      return json(request,{ok:true,artworks:data.artworks,nextCursor:data.nextCursor??null});
    }
    const body=await readBody(request);
    if(!body || Object.keys(body).some(key=>!['postId','action','snapshotToken','confirmedStillImage','confirmedRights','confirmedContent'].includes(key)) || !isUuid(String(body.postId||'')) || !['approve','hold'].includes(String(body.action)) || !HASH.test(String(body.snapshotToken||''))) return fail(request,'invalid_review');
    if(body.action==='approve' && (body.confirmedStillImage!==true || body.confirmedRights!==true || body.confirmedContent!==true)) return fail(request,'review_confirmations_required');
    if(body.action==='approve') {
      const current=await admin.rpc('pixieed_home_review_item',{p_post_id:body.postId});
      const item=!current.error?rpcRecord(current.data):null;
      if(!item || item.eligible!==true || item.snapshotToken!==body.snapshotToken) return fail(request,'review_conflict',409);
      const displayText=(value: unknown,max: number)=>{if(typeof value!=='string')return false;const text=value.normalize('NFC').trim();return text.length>0&&text.length<=max&&!/[\u0000-\u001f\u007f]/.test(text);};
      if(!displayText(item.title,60)||!displayText(item.authorName,40)) return fail(request,'public_display_name_required',422);
      if(!await verifyReviewImage(item,config.projectUrl,deps.fetchImpl)) return fail(request,'image_verification_failed',422);
    }
    const saved=await admin.rpc('pixieed_home_review_save',{p_post_id:body.postId,p_action:body.action,p_snapshot_token:body.snapshotToken,p_reviewer_id:auth.user.id});
    if(saved.error) return fail(request,saved.error.message==='review_conflict'?'review_conflict':'review_save_failed',saved.error.message==='review_conflict'?409:503);
    const result=rpcRecord(saved.data);
    if(!result || result.postId!==body.postId || !['approved','held'].includes(String(result.reviewState))) return fail(request,'review_save_failed',503);
    return json(request,{ok:true,postId:result.postId,reviewState:result.reviewState});
  } catch { return fail(request,'review_unavailable',503); }
}
if(import.meta.main) Deno.serve(request=>homeArtworkReviewHandler(request));
