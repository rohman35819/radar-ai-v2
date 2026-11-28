import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply({ error: "POST required" }, 405);
  if (!supabaseUrl || !serviceRoleKey) return reply({ error: "worker_not_configured" }, 503);

  const token = req.headers.get("x-nexus-worker-token") ?? "";
  if (token.length !== 64) return reply({ error: "unauthorized" }, 401);

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: valid, error: validationError } = await db.rpc("nexus_validate_worker_token", {
    p_token: token,
  });
  if (validationError || valid !== true) return reply({ error: "unauthorized" }, 401);

  try {
    const upstream = await fetch(supabaseUrl + "/functions/v1/nexus-agent-runtime", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + serviceRoleKey,
        "apikey": serviceRoleKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "worker_tick", worker_id: "nexus-cron-worker" }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return reply({ error: "worker_upstream_unavailable" }, 502);
  }
});
