// Supabase Edge Function: coinalyze (CORS 프록시)
const ORIGIN = "https://stopfirst.github.io";
const cors = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "Retry-After",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "GET") return new Response("method", { status: 405, headers: cors });

  const u = new URL(req.url);
  // /coinalyze/exchanges  또는  /functions/v1/coinalyze/exchanges  → /exchanges
  const i = u.pathname.indexOf("/coinalyze");
  const path = i >= 0 ? u.pathname.slice(i + "/coinalyze".length) : u.pathname;
  if (!/^\/[a-z0-9-]+$/.test(path)) return new Response("path", { status: 404, headers: cors });

  const key = Deno.env.get("COINALYZE_KEY");
  if (key) u.searchParams.set("api_key", key);

  try {
    const r = await fetch("https://api.coinalyze.net/v1" + path + u.search);
    const h = new Headers(cors);
    h.set("Content-Type", r.headers.get("content-type") || "application/json");
    const ra = r.headers.get("retry-after");
    if (ra) h.set("Retry-After", ra);
    return new Response(await r.arrayBuffer(), { status: r.status, headers: h });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 502, headers: cors });
  }
});
