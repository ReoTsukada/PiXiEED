import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  createAdminClient,
  errorMessage,
  jsonResponse,
  readJson,
  requireUser,
  stringValue,
} from "../_shared/market-stripe.ts";

const ROOM_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BUCKET = "pixisync-checkpoints";

async function collectObjectPaths(
  admin: ReturnType<typeof createAdminClient>,
  prefix: string,
): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0;; offset += 1000) {
    const { data, error } = await admin.storage.from(BUCKET).list(prefix, {
      limit: 1000,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    const entries = data || [];
    for (const entry of entries) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id) paths.push(path);
      else paths.push(...await collectObjectPaths(admin, path));
    }
    if (entries.length < 1000) break;
  }
  return paths;
}

serve(async (request) => {
  if (request.method === "OPTIONS") return jsonResponse(request, { ok: true });
  if (request.method !== "POST") {
    return jsonResponse(request, { ok: false, error: "method not allowed" }, 405);
  }

  try {
    const { user } = await requireUser(request);
    const body = await readJson(request);
    const roomId = stringValue(body.room_id).toLowerCase();
    if (!ROOM_ID_PATTERN.test(roomId)) {
      return jsonResponse(request, { ok: false, error: "共有プロジェクトを確認できません。" }, 400);
    }

    const admin = createAdminClient();
    const { data: claimed, error: claimError } = await admin.rpc(
      "pixisync_claim_localized_room_cleanup_v1",
      { input_room_id: roomId, input_user_id: user.id },
    );
    if (claimError) throw claimError;
    const claim = Array.isArray(claimed) ? claimed[0] : claimed;
    const prefix = stringValue(claim?.storage_prefix);
    if (!prefix) throw new Error("cleanup claim is unavailable");

    const paths = await collectObjectPaths(admin, prefix);
    for (let index = 0; index < paths.length; index += 100) {
      const { error } = await admin.storage.from(BUCKET).remove(paths.slice(index, index + 100));
      if (error) throw error;
    }

    const { data: finalized, error: finalizeError } = await admin.rpc(
      "pixisync_finalize_localized_room_cleanup_v1",
      { input_room_id: roomId },
    );
    if (finalizeError) throw finalizeError;
    return jsonResponse(request, { ok: finalized === true, deleted_objects: paths.length });
  } catch (error) {
    return jsonResponse(request, {
      ok: false,
      error: errorMessage(error, "共有プロジェクトのサーバー整理を完了できませんでした"),
    }, 400);
  }
});
