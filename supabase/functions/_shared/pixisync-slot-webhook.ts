import {
  createAdminClient,
  errorMessage,
  JsonRecord,
  jsonResponse,
  stringValue,
  stripeRequest,
} from "./market-stripe.ts";

function recordValue(value: unknown): JsonRecord {
  return value && typeof value === "object" ? value as JsonRecord : {};
}

function objectId(value: JsonRecord): string {
  return stringValue(value.id);
}

function parseSlotQuantity(value: unknown): number {
  const quantity = Number(value ?? 1);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 20) {
    throw new Error("Stripe checkout slot quantity is invalid");
  }
  return quantity;
}

async function completeCheckout(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string,
  session: JsonRecord,
) {
  const metadata = recordValue(session.metadata);
  const quantity = parseSlotQuantity(metadata.pixieed_slot_quantity);
  const purchaseId = stringValue(metadata.pixieed_purchase_id) || stringValue(session.client_reference_id);
  const userId = stringValue(metadata.pixieed_user_id);
  if (
    metadata.pixieed_product_key !== "pixisync_project_slot"
    || session.mode !== "payment"
    || session.payment_status !== "paid"
    || Number(session.amount_total) !== quantity * 100
    || !purchaseId
    || !userId
  ) throw new Error("Stripe checkout does not match a PiXiSYNC slot purchase");

  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : stringValue(recordValue(session.payment_intent).id);
  if (!paymentIntentId) throw new Error("Stripe payment intent is missing");
  const paymentIntent = await stripeRequest(
    `/payment_intents/${encodeURIComponent(paymentIntentId)}?expand[]=latest_charge`,
    { method: "GET" },
  );
  const charge = recordValue(paymentIntent.latest_charge);
  const { error } = await admin.rpc("pixisync_complete_slot_purchase_v1", {
    input_purchase_id: purchaseId,
    input_user_id: userId,
    input_checkout_session_id: objectId(session),
    input_payment_intent_id: paymentIntentId,
    input_charge_id: objectId(charge),
    input_gross_amount_yen: Number(session.amount_total),
    input_event_id: eventId,
  });
  if (error) throw error;
}

export async function handlePixisyncSlotStripeEvent(
  request: Request,
  event: JsonRecord,
): Promise<Response | null> {
  const eventId = stringValue(event.id);
  const eventType = stringValue(event.type);
  const object = recordValue(recordValue(recordValue(event.data).object));
  if (!eventId || !eventType) return null;

  const admin = createAdminClient();
  const metadata = recordValue(object.metadata);
  const checkoutEvent = eventType.startsWith("checkout.session.");
  let chargeId = "";
  if (eventType === "charge.refunded") chargeId = objectId(object);
  if (eventType.startsWith("charge.dispute.")) chargeId = stringValue(object.charge);
  if (checkoutEvent && metadata.pixieed_product_key !== "pixisync_project_slot") return null;
  if (chargeId) {
    const { data, error } = await admin.rpc("pixisync_find_slot_purchase_by_charge_v1", {
      input_charge_id: chargeId,
    });
    if (error) return jsonResponse(request, { ok: false, error: error.message }, 500);
    if (!data) return null;
  }
  if (!checkoutEvent && !chargeId) return null;

  const { data: shouldProcess, error: claimError } = await admin.rpc("pixisync_claim_slot_payment_event_v1", {
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
      const { error } = await admin.rpc("pixisync_cancel_slot_checkout_v1", {
        input_checkout_session_id: objectId(object),
        input_event_id: eventId,
      });
      if (error) throw error;
    } else if (eventType === "charge.refunded") {
      if (Number(object.amount_refunded) >= Number(object.amount)) {
        const refunds = recordValue(object.refunds);
        const firstRefund = Array.isArray(refunds.data) ? recordValue(refunds.data[0]) : {};
        const { error } = await admin.rpc("pixisync_reverse_slot_purchase_v1", {
          input_charge_id: chargeId,
          input_event_id: eventId,
          input_reason: "refund",
          input_refund_id: objectId(firstRefund),
        });
        if (error) throw error;
      } else finishStatus = "ignored";
    } else if (eventType === "charge.dispute.created") {
      const { error } = await admin.rpc("pixisync_reverse_slot_purchase_v1", {
        input_charge_id: chargeId,
        input_event_id: eventId,
        input_reason: "dispute",
        input_refund_id: null,
      });
      if (error) throw error;
    } else if (eventType === "charge.dispute.closed" && object.status === "won") {
      const { error } = await admin.rpc("pixisync_restore_slot_purchase_v1", {
        input_charge_id: chargeId,
        input_event_id: eventId,
      });
      if (error) throw error;
    } else finishStatus = "ignored";

    const { error: finishError } = await admin.rpc("pixisync_finish_slot_payment_event_v1", {
      input_event_id: eventId,
      input_status: finishStatus,
      input_error_message: "",
    });
    if (finishError) throw finishError;
    return jsonResponse(request, { ok: true, status: finishStatus });
  } catch (error) {
    await admin.rpc("pixisync_finish_slot_payment_event_v1", {
      input_event_id: eventId,
      input_status: "failed",
      input_error_message: errorMessage(error, "processing failed"),
    });
    return jsonResponse(request, { ok: false, error: errorMessage(error, "processing failed") }, 500);
  }
}
