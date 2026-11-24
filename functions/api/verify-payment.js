export async function onRequestPost({ request, env }) {
  const origin = "https://www.pharmacycareers.in";

  const headers = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  const respond = (data, status = 200) =>
    new Response(JSON.stringify(data), { status, headers });

  try {
    if (request.headers.get("Origin") !== origin) {
      return respond({ error: "Invalid origin" }, 403);
    }

    const auth = request.headers.get("Authorization");

    if (!auth?.startsWith("Bearer ")) {
      return respond({ error: "Login required" }, 401);
    }

    const userRes = await fetch(
      `${env.SUPABASE_URL}/auth/v1/user`,
      {
        headers: {
          apikey: env.SUPABASE_ANON_KEY,
          Authorization: auth
        }
      }
    );

    if (!userRes.ok) {
      return respond({ error: "Invalid student session" }, 401);
    }

    const user = await userRes.json();

    const body = await request.json();

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = body;

    if (
      typeof razorpay_order_id !== "string" ||
      typeof razorpay_payment_id !== "string" ||
      typeof razorpay_signature !== "string"
    ) {
      return respond({ error: "Invalid payment details" }, 400);
    }

    // Verify Razorpay signature
    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(env.RAZORPAY_KEY_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(
        `${razorpay_order_id}|${razorpay_payment_id}`
      )
    );

    const expectedSignature = Array.from(
      new Uint8Array(signature)
    )
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    if (
      !/^[a-f0-9]{64}$/i.test(razorpay_signature) ||
      expectedSignature !== razorpay_signature.toLowerCase()
    ) {
      return respond({ error: "Signature verification failed" }, 400);
    }

    const dbHeaders = {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json"
    };

    // Find the original transaction belonging to this student
    const transactionRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/payment_transactions?razorpay_order_id=eq.${encodeURIComponent(razorpay_order_id)}&user_id=eq.${encodeURIComponent(user.id)}&select=id,user_id,purchase_id,amount_paise,currency,status,razorpay_payment_id`,
      { headers: dbHeaders }
    );

    if (!transactionRes.ok) {
      return respond({ error: "Transaction lookup failed" }, 500);
    }

    const transactions = await transactionRes.json();
    const transaction = transactions[0];

    if (!transaction || !transaction.purchase_id) {
      return respond({ error: "Transaction not found" }, 404);
    }

    // Verify payment directly with Razorpay
    const paymentRes = await fetch(
      `https://api.razorpay.com/v1/payments/${encodeURIComponent(razorpay_payment_id)}`,
      {
        headers: {
          Authorization: "Basic " + btoa(
            `${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`
          )
        }
      }
    );

    if (!paymentRes.ok) {
      return respond({ error: "Razorpay verification unavailable" }, 502);
    }

    const payment = await paymentRes.json();

    if (
      payment.order_id !== razorpay_order_id ||
      payment.status !== "captured" ||
      payment.amount !== transaction.amount_paise ||
      payment.currency !== transaction.currency
    ) {
      return respond({ error: "Payment details do not match" }, 400);
    }

    // Finalize payment and purchase atomically in Supabase
    const finalizeRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/rpc/finalize_verified_purchase`,
      {
        method: "POST",
        headers: dbHeaders,
        body: JSON.stringify({
          p_transaction_id: transaction.id,
          p_razorpay_payment_id: razorpay_payment_id
        })
      }
    );

    if (!finalizeRes.ok) {
      return respond({
        error: "Payment verified but purchase finalization failed. Please contact support."
      }, 500);
    }

    const result = await finalizeRes.json();

    if (!result?.success) {
      return respond({ error: "Purchase confirmation failed" }, 500);
    }

    return respond({
      success: true,
      message: "Payment verified and purchase confirmed",
      purchase_id: result.purchase_id
    });

  } catch (error) {
    return respond({ error: "Internal server error" }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "https://www.pharmacycareers.in",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    }
  });
}
