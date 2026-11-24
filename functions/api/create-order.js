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

    const token = auth.slice(7);

    const userRes = await fetch(
      `${env.SUPABASE_URL}/auth/v1/user`,
      {
        headers: {
          apikey: env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!userRes.ok) {
      return respond({ error: "Invalid session" }, 401);
    }

    const user = await userRes.json();
    const body = await request.json();
    const materialId = body.material_id;

    if (!materialId) {
      return respond({ error: "Material ID required" }, 400);
    }

    const dbHeaders = {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json"
    };

    const materialRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/learning_materials?id=eq.${encodeURIComponent(materialId)}&is_published=eq.true&select=id,title,access_type,price_paise,currency`,
      { headers: dbHeaders }
    );

    if (!materialRes.ok) {
      return respond({ error: "Material lookup failed" }, 500);
    }

    const materials = await materialRes.json();
    const material = materials[0];

    if (!material || material.access_type !== "paid") {
      return respond({ error: "Paid material unavailable" }, 404);
    }

    if (
      !Number.isSafeInteger(material.price_paise) ||
      material.price_paise <= 0 ||
      material.currency !== "INR"
    ) {
      return respond({ error: "Invalid material price" }, 400);
    }

    const existingRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/purchases?user_id=eq.${user.id}&material_id=eq.${material.id}&select=id,status`,
      { headers: dbHeaders }
    );

    if (!existingRes.ok) {
      return respond({ error: "Purchase lookup failed" }, 500);
    }

    const existing = (await existingRes.json())[0];

    if (existing?.status === "paid") {
      return respond({ error: "Material already purchased" }, 409);
    }

    let purchaseId;

    if (existing) {
      purchaseId = existing.id;

      const resetRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/purchases?id=eq.${purchaseId}&user_id=eq.${user.id}`,
        {
          method: "PATCH",
          headers: {
            ...dbHeaders,
            Prefer: "return=minimal"
          },
          body: JSON.stringify({
            status: "pending",
            amount_paise: material.price_paise,
            currency: "INR",
            paid_at: null
          })
        }
      );

      if (!resetRes.ok) {
        return respond({ error: "Purchase preparation failed" }, 500);
      }
    } else {
      const purchaseRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/purchases`,
        {
          method: "POST",
          headers: {
            ...dbHeaders,
            Prefer: "return=representation"
          },
          body: JSON.stringify({
            user_id: user.id,
            material_id: material.id,
            amount_paise: material.price_paise,
            currency: "INR",
            status: "pending"
          })
        }
      );

      if (!purchaseRes.ok) {
        return respond({ error: "Purchase creation failed" }, 500);
      }

      const purchases = await purchaseRes.json();
      purchaseId = purchases[0]?.id;

      if (!purchaseId) {
        return respond({ error: "Purchase creation failed" }, 500);
      }
    }

    const receipt = `pc_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;

    const orderRes = await fetch(
      "https://api.razorpay.com/v1/orders",
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(
            `${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`
          ),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          amount: material.price_paise,
          currency: "INR",
          receipt,
          notes: {
            user_id: user.id,
            material_id: material.id,
            purchase_id: purchaseId
          }
        })
      }
    );

    const order = await orderRes.json();

    if (!orderRes.ok || !order.id) {
      return respond({ error: "Razorpay order creation failed" }, 502);
    }

    const transactionRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/payment_transactions`,
      {
        method: "POST",
        headers: {
          ...dbHeaders,
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          user_id: user.id,
          purchase_id: purchaseId,
          razorpay_order_id: order.id,
          amount_paise: material.price_paise,
          currency: "INR",
          status: "created"
        })
      }
    );

    if (!transactionRes.ok) {
      return respond({ error: "Payment record creation failed" }, 500);
    }

    return respond({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: env.RAZORPAY_KEY_ID,
      material_title: material.title
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
