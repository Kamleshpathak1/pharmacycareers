export async function onRequestPost({ request, env }) {
  try {
    const secret = env.RAZORPAY_WEBHOOK_SECRET;

    if (!secret) {
      return new Response("Webhook secret missing", { status: 500 });
    }

    const signature = request.headers.get("X-Razorpay-Signature");

    if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) {
      return new Response("Invalid signature", { status: 400 });
    }

    const rawBody = await request.text();

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signatureBytes = new Uint8Array(
      signature.match(/.{2}/g).map(byte => parseInt(byte, 16))
    );

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes,
      new TextEncoder().encode(rawBody)
    );

    if (!valid) {
      return new Response("Signature verification failed", { status: 400 });
    }

    const data = JSON.parse(rawBody);
    const event = data.event;

    // Failed attempts do not close the order.
    // Students may retry payment using the same order.
    if (event === "payment.failed") {
      return new Response("Failed attempt acknowledged", { status: 200 });
    }

    // Process captured payments only.
    if (event !== "payment.captured") {
      return new Response("Event acknowledged", { status: 200 });
    }

    const payment = data.payload?.payment?.entity;

    if (
      !payment?.id ||
      !payment?.order_id ||
      payment.status !== "captured"
    ) {
      return new Response("Invalid payment payload", { status: 400 });
    }

    const dbHeaders = {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json"
    };

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

    if (
      payment.amount !== transaction.amount_paise ||
      payment.currency !== transaction.currency
    ) {
      return new Response("Payment details mismatch", { status: 400 });
    }

    // Safe acknowledgement of an already processed delivery.
    if (
      transaction.status === "paid" &&
      transaction.razorpay_payment_id === payment.id
    ) {
      return new Response("Already processed", { status: 200 });
    }

    // Finalize payment and purchase in one database transaction.
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

    const result = await finalizeResponse.json();

    if (!result?.success) {
      return new Response("Purchase confirmation failed", { status: 500 });
    }

    return new Response("Payment processed", { status: 200 });

  } catch (error) {
    return new Response("Webhook processing error", { status: 500 });
  }
}
