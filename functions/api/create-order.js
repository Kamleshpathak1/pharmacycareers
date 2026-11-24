export async function onRequestPost({ request, env }) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "https://www.pharmacycareers.in",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  const respond = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  try {
    const authHeader = request.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return respond({ error: "Login required" }, 401);
    }

    const token = authHeader.substring(7);

    const userResponse = await fetch(
      `${env.SUPABASE_URL}/auth/v1/user`,
      {
        headers: {
          apikey: env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!userResponse.ok) {
      return respond({ error: "Invalid student session" }, 401);
    }

    const user = await userResponse.json();
    const { material_id } = await request.json();

    if (!material_id) {
      return respond({ error: "Material ID required" }, 400);
    }

    const materialResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/learning_materials?id=eq.${encodeURIComponent(material_id)}&is_published=eq.true&select=id,title,access_type,price_paise,currency`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );

    if (!materialResponse.ok) {
      return respond({ error: "Unable to verify material" }, 500);
    }

    const materials = await materialResponse.json();
    const material = materials[0];

    if (!material || material.access_type !== "paid") {
      return respond({ error: "Paid material not found" }, 404);
    }

    if (!Number.isSafeInteger(material.price_paise) ||
        material.price_paise <= 0) {
      return respond({ error: "Invalid material price" }, 400);
    }

    const orderResponse = await fetch(
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
          currency: material.currency || "INR",
          receipt: `pc_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
          notes: {
            user_id: user.id,
            material_id: material.id
          }
        })
      }
    );

    const order = await orderResponse.json();

    if (!orderResponse.ok) {
      return respond({ error: "Payment order creation failed" }, 502);
    }

    return respond({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: env.RAZORPAY_KEY_ID,
      material_title: material.title
    });

  } catch (error) {
    return respond({ error: "Server error" }, 500);
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
