export async function onRequestPost({ request, env }) {
  try {
    const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      return new Response("Webhook configuration missing", { status: 500 });
    }

    const signature = request.headers.get("X-Razorpay-Signature");

    if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) {
      return new Response("Invalid signature", { status: 400 });
    }

    // Read the exact raw request body for signature verification
    const rawBody = await request.text();

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(webhookSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signatureBytes = new Uint8Array(
      signature.match(/.{2}/g).map(byte => parseInt(byte, 16))
    );

    const validSignature = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes,
      new TextEncoder().encode(rawBody)
    );

    if (!validSignature) {
      return new Response("Signature verification failed", { status: 400 });
    }

    const eventData = JSON.parse(rawBody);
    const event = eventData.event;

    const payment =
      eventData.payload?.payment?.entity;

    if (!payment?.order_id || !payment?.id) {
      return new Response("Invalid payment payload", { status: 400 });
    }

    const dbHeaders = {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json"
    };

    // Find the original transaction using the Razorpay order ID
    const transactionResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/payment_transactions?razorpay_order_id=eq.${encodeURIComponent(payment.order_id)}&select=id,user_id,purchase_id,amount_paise,currency,status,razorpay_payment_id`,
      { headers: dbHeaders }
    );

    if (!transactionResponse.ok) {
      return new Response("Transaction lookup failed", { status: 500 });
    }

    const transactions = await transactionResponse.json();
    const transaction = transactions[0];

    if (!transaction) {
      return new Response("Transaction not found", { status: 404 });
    }

    // Process successful captured payments
    if (event === "payment.captured" || event === "order.paid") {
      if (
        payment.status !== "captured" ||
        payment.amount !== transaction.amount_paise ||
        payment.currency !== transaction.currency
      ) {
        return new Response("Payment details mismatch", { status: 400 });
      }

      if (
        transaction.status === "paid" &&
        transaction.razorpay_payment_id === payment.id
      ) {
        return new Response("Already processed", { status: 200 });
      }

      const finalizeResponse = await fetch(
        `${env.SUPABASE_URL}/rest/v1/rpc/finalize_verified_purchase`,
        {
          method: "POST",
          headers: dbHeaders,
          body: JSON.stringify({
            p_transaction_id: transaction.id,
            p_razorpay_payment_id: payment.id
          })
        }
      );

      if (!finalizeResponse.ok) {
        return new Response("Purchase finalization failed", { status: 500 });
      }

      return new Response("Payment processed", { status: 200 });
    }

    // Record failed payments without changing purchase entitlement
    if (event === "payment.failed") {
      if (
        transaction.status === "created" &&
        !transaction.razorpay_payment_id
      ) {
        const updateResponse = await fetch(
          `${env.SUPABASE_URL}/rest/v1/payment_transactions?id=eq.${transaction.id}&status=eq.created`,
          {
            method: "PATCH",
            headers: {
              ...dbHeaders,
              Prefer: "return=minimal"
            },
            body: JSON.stringify({ status: "failed" })
          }
        );

        if (!updateResponse.ok) {
          return new Response("Failed payment update error", { status: 500 });
        }
      }

      return new Response("Failed payment recorded", { status: 200 });
    }

    // Acknowledge other events that this endpoint does not process
    return new Response("Event ignored", { status: 200 });

  } catch (error) {
    return new Response("Webhook processing error", { status: 500 });
  }
}
