import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  createAdminClient,
  errorMessage,
  JsonRecord,
  jsonResponse,
  stringValue,
  stripeRequest,
  syncStripeAccount,
  verifyStripeWebhook,
} from "../_shared/market-stripe.ts";

function recordValue(value: unknown): JsonRecord {
  return value && typeof value === "object" ? value as JsonRecord : {};
}

function objectId(object: JsonRecord): string {
  return stringValue(object.id);
}

async function completeCheckout(admin: ReturnType<typeof createAdminClient>, eventId: string, session: JsonRecord) {
  if (session.mode !== "payment" || session.payment_status !== "paid") {
    throw new Error("Stripe checkout is not a completed payment");
  }
  const metadata = recordValue(session.metadata);
  const purchaseId = stringValue(metadata.pixieed_purchase_id) || stringValue(session.client_reference_id);
  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : stringValue(recordValue(session.payment_intent).id);
  if (!purchaseId || !paymentIntentId) throw new Error("Stripe checkout metadata is incomplete");

  const paymentIntent = await stripeRequest(
    `/payment_intents/${encodeURIComponent(paymentIntentId)}?expand[]=latest_charge.balance_transaction`,
    { method: "GET" },
  );
  const charge = recordValue(paymentIntent.latest_charge);
  const balanceTransaction = recordValue(charge.balance_transaction);
  const processorFee = Number(balanceTransaction.fee);
  const grossAmount = Number(session.amount_total);
  if (!Number.isInteger(processorFee) || processorFee < 0) throw new Error("Stripe processing fee is not available yet");
  if (!Number.isInteger(grossAmount) || grossAmount <= 0) throw new Error("Stripe checkout amount is invalid");

  const { error } = await admin.rpc("market_complete_stripe_purchase_v1", {
    input_purchase_id: purchaseId,
    input_checkout_session_id: objectId(session),
    input_payment_intent_id: paymentIntentId,
    input_charge_id: objectId(charge),
    input_gross_amount_yen: grossAmount,
    input_processor_fee_yen: processorFee,
    input_event_id: eventId,
  });
  if (error) throw error;
}

async function reverseCharge(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string,
  chargeId: string,
  reason: "refund" | "dispute",
  refundId = "",
) {
  const { data, error } = await admin.rpc("market_reverse_stripe_purchase_v1", {
    input_charge_id: chargeId,
    input_event_id: eventId,
    input_reason: reason,
    input_refund_id: refundId || null,
  });
  if (error) throw error;
  return String(data || "");
}

async function reverseTransferredPayouts(
  admin: ReturnType<typeof createAdminClient>,
  purchaseId: string,
  eventId: string,
) {
  if (!purchaseId) return;
  const { data, error } = await admin
    .from("market_payout_items")
    .select("id,amount_microyen,reversed_microyen,batch:market_payout_batches!inner(provider_transfer_id,status)")
    .eq("purchase_id", purchaseId);
  if (error) throw error;

  for (const rawItem of data || []) {
    const item = rawItem as JsonRecord;
    const rawBatch = Array.isArray(item.batch) ? item.batch[0] : item.batch;
    const batch = recordValue(rawBatch);
    const transferId = stringValue(batch.provider_transfer_id);
    if (!transferId || !["transferred", "partially_reversed"].includes(stringValue(batch.status))) continue;
    const remainingMicroyen = Number(item.amount_microyen) - Number(item.reversed_microyen);
    const reversalYen = Math.floor(remainingMicroyen / 1000000);
    if (!Number.isSafeInteger(reversalYen) || reversalYen <= 0) continue;

    const params = new URLSearchParams();
    params.set("amount", String(reversalYen));
    params.set("metadata[pixieed_purchase_id]", purchaseId);
    params.set("metadata[pixieed_event_id]", eventId);
    const reversal = await stripeRequest(`/transfers/${encodeURIComponent(transferId)}/reversals`, {
      params,
      idempotencyKey: `market-transfer-reversal-${eventId}-${String(item.id)}`,
    });
    const reversalId = objectId(reversal);
    if (!reversalId) throw new Error("Stripe transfer reversal id is missing");
    const { error: recordError } = await admin.rpc("market_record_stripe_transfer_reversal_v1", {
      input_payout_item_id: item.id,
      input_reversed_yen: reversalYen,
      input_reversal_id: reversalId,
      input_event_id: eventId,
    });
    if (recordError) throw recordError;
  }
}

serve(async (request) => {
  if (request.method !== "POST") return jsonResponse(request, { ok: false, error: "method not allowed" }, 405);
  const rawBody = await request.text();
  try {
    await verifyStripeWebhook(rawBody, request.headers.get("stripe-signature") || "");
  } catch (error) {
    return jsonResponse(request, { ok: false, error: errorMessage(error, "invalid webhook") }, 400);
  }

  let event: JsonRecord;
  try {
    event = JSON.parse(rawBody) as JsonRecord;
  } catch (_error) {
    return jsonResponse(request, { ok: false, error: "invalid JSON" }, 400);
  }

  const eventId = stringValue(event.id);
  const eventType = stringValue(event.type);
  const object = recordValue(recordValue(recordValue(event.data).object));
  if (!eventId || !eventType) return jsonResponse(request, { ok: false, error: "invalid Stripe event" }, 400);

  const admin = createAdminClient();
  const { data: shouldProcess, error: claimError } = await admin.rpc("market_claim_payment_event_v1", {
    input_event_id: eventId,
    input_event_type: eventType,
    input_object_id: objectId(object),
  });
  if (claimError) return jsonResponse(request, { ok: false, error: claimError.message }, 500);
  if (!shouldProcess) return jsonResponse(request, { ok: true, duplicate: true });

  let finishStatus: "processed" | "ignored" = "processed";
  try {
    if (eventType === "checkout.session.completed" || eventType === "checkout.session.async_payment_succeeded") {
      if (object.payment_status === "paid") await completeCheckout(admin, eventId, object);
      else finishStatus = "ignored";
    } else if (eventType === "checkout.session.expired" || eventType === "checkout.session.async_payment_failed") {
      const { error } = await admin.rpc("market_cancel_stripe_checkout_v1", {
        input_checkout_session_id: objectId(object),
        input_event_id: eventId,
      });
      if (error) throw error;
    } else if (eventType === "account.updated") {
      await syncStripeAccount(admin, object);
    } else if (eventType === "charge.refunded") {
      const amount = Number(object.amount);
      const amountRefunded = Number(object.amount_refunded);
      if (Number.isInteger(amount) && amount > 0 && amountRefunded >= amount) {
        const refunds = recordValue(object.refunds);
        const refundRows = Array.isArray(refunds.data) ? refunds.data.map(recordValue) : [];
        const purchaseId = await reverseCharge(admin, eventId, objectId(object), "refund", objectId(refundRows.at(-1) || {}));
        await reverseTransferredPayouts(admin, purchaseId, eventId);
      } else {
        finishStatus = "ignored";
      }
    } else if (eventType === "charge.dispute.created") {
      const chargeId = typeof object.charge === "string" ? object.charge : objectId(recordValue(object.charge));
      const purchaseId = await reverseCharge(admin, eventId, chargeId, "dispute");
      await reverseTransferredPayouts(admin, purchaseId, eventId);
    } else if (eventType === "charge.dispute.closed") {
      const chargeId = typeof object.charge === "string" ? object.charge : objectId(recordValue(object.charge));
      if (object.status === "won") {
        const { data: purchaseId, error } = await admin.rpc("market_restore_stripe_purchase_v1", {
          input_charge_id: chargeId,
          input_event_id: eventId,
        });
        if (error) throw error;
        const { error: reopenError } = await admin.rpc("market_reopen_won_dispute_payout_v1", {
          input_purchase_id: purchaseId,
        });
        if (reopenError) throw reopenError;
      } else {
        const purchaseId = await reverseCharge(admin, eventId, chargeId, "dispute");
        await reverseTransferredPayouts(admin, purchaseId, eventId);
      }
    } else {
      finishStatus = "ignored";
    }

    const { error: finishError } = await admin.rpc("market_finish_payment_event_v1", {
      input_event_id: eventId,
      input_status: finishStatus,
      input_error_message: "",
    });
    if (finishError) throw finishError;
    return jsonResponse(request, { ok: true });
  } catch (error) {
    await admin.rpc("market_finish_payment_event_v1", {
      input_event_id: eventId,
      input_status: "failed",
      input_error_message: errorMessage(error, "webhook processing failed"),
    });
    return jsonResponse(request, { ok: false, error: errorMessage(error, "webhook processing failed") }, 500);
  }
});
