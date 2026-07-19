import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  createAdminClient,
  errorMessage,
  jsonResponse,
  stringValue,
  stripeRequest,
} from "../_shared/market-stripe.ts";

serve(async (request) => {
  if (request.method !== "POST") return jsonResponse(request, { ok: false, error: "method not allowed" }, 405);
  const expectedSecret = Deno.env.get("MARKET_PAYOUT_SECRET")?.trim() || "";
  const suppliedSecret = request.headers.get("x-pixieed-market-payout-secret") || "";
  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    return jsonResponse(request, { ok: false, error: "unauthorized" }, 401);
  }

  const minimumYen = Math.max(1, Math.min(10000000, Number(Deno.env.get("MARKET_PAYOUT_MINIMUM_YEN")) || 5000));
  const maxBatches = Math.max(1, Math.min(100, Number(new URL(request.url).searchParams.get("limit")) || 20));
  const admin = createAdminClient();
  const transferred: Array<{ batch_id: string; transfer_id: string; amount_yen: number }> = [];

  try {
    for (let index = 0; index < maxBatches; index += 1) {
      const { data: batch, error: batchError } = await admin.rpc("market_next_stripe_payout_batch_v1", {
        input_minimum_yen: minimumYen,
      });
      if (batchError) throw batchError;
      if (!batch) break;

      const batchId = stringValue(batch.batch_id);
      const accountId = stringValue(batch.provider_account_id);
      const amountYen = Number(batch.amount_yen);
      if (!batchId || !accountId || !Number.isInteger(amountYen) || amountYen <= 0) {
        throw new Error("prepared payout batch is invalid");
      }
      const params = new URLSearchParams();
      params.set("amount", String(amountYen));
      params.set("currency", "jpy");
      params.set("destination", accountId);
      params.set("transfer_group", `pixieed_market_payout_${batchId}`);
      params.set("metadata[pixieed_payout_batch_id]", batchId);
      const transfer = await stripeRequest("/transfers", {
        params,
        idempotencyKey: `market-payout-${batchId}`,
      });
      const transferId = stringValue(transfer.id);
      if (!transferId) throw new Error("Stripe transfer id is missing");
      const { error: finalizeError } = await admin.rpc("market_finalize_stripe_payout_batch_v1", {
        input_batch_id: batchId,
        input_transfer_id: transferId,
      });
      if (finalizeError) throw finalizeError;
      transferred.push({ batch_id: batchId, transfer_id: transferId, amount_yen: amountYen });
    }
    return jsonResponse(request, { ok: true, minimum_yen: minimumYen, transferred });
  } catch (error) {
    return jsonResponse(request, {
      ok: false,
      error: errorMessage(error, "Stripe payout failed"),
      transferred,
    }, 500);
  }
});
