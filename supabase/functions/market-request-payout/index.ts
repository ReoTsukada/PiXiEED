import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  createAdminClient, errorMessage, jsonResponse, requireMarketUser,
  stringValue, stripeRequest,
} from "../_shared/market-stripe.ts";

const MINIMUM_YEN = 5000;

serve(async (request) => {
  if (request.method === "OPTIONS") return jsonResponse(request, { ok: true });
  if (request.method !== "POST") return jsonResponse(request, { ok: false, error: "method not allowed" }, 405);

  let requestId = "";
  let transferFinalized = false;
  try {
    const { client } = await requireMarketUser(request);
    const { data: requested, error: requestError } = await client.rpc("market_request_stripe_payout_v1", {
      input_minimum_yen: MINIMUM_YEN,
    });
    if (requestError) throw requestError;
    requestId = stringValue(requested?.request_id);
    if (!requestId) throw new Error("出金申請を作成できませんでした");

    const admin = createAdminClient();
    const { data: batch, error: batchError } = await admin.rpc("market_prepare_requested_stripe_payout_v1", {
      input_request_id: requestId,
    });
    if (batchError) throw batchError;
    const batchId = stringValue(batch?.batch_id);
    const accountId = stringValue(batch?.provider_account_id);
    const amountYen = Number(batch?.amount_yen);
    if (!batchId || !accountId || !Number.isInteger(amountYen) || amountYen <= 0) throw new Error("出金情報を確認できませんでした");

    const params = new URLSearchParams();
    params.set("amount", String(amountYen));
    params.set("currency", "jpy");
    params.set("destination", accountId);
    params.set("transfer_group", `pixieed_market_payout_${batchId}`);
    params.set("metadata[pixieed_payout_batch_id]", batchId);
    const transfer = await stripeRequest("/transfers", {
      params, idempotencyKey: `market-payout-${batchId}`,
    });
    const transferId = stringValue(transfer.id);
    if (!transferId) throw new Error("Stripe送金IDを確認できませんでした");
    const { error: finalizeError } = await admin.rpc("market_finalize_stripe_payout_batch_v1", {
      input_batch_id: batchId, input_transfer_id: transferId,
    });
    if (finalizeError) throw finalizeError;
    transferFinalized = true;
    const { error: completeError } = await admin.rpc("market_complete_requested_stripe_payout_v1", {
      input_request_id: requestId, input_failure_message: "",
    });
    if (completeError) throw completeError;
    return jsonResponse(request, { ok: true, amount_yen: amountYen, transfer_id: transferId });
  } catch (error) {
    if (requestId && !transferFinalized) {
      try {
        const admin = createAdminClient();
        await admin.rpc("market_complete_requested_stripe_payout_v1", {
          input_request_id: requestId, input_failure_message: errorMessage(error, "Stripe payout failed").slice(0, 500),
        });
      } catch (_ignored) { /* Preserve the original error for the user. */ }
    }
    return jsonResponse(request, { ok: false, error: errorMessage(error, "出金を開始できませんでした") }, 400);
  }
});
