/**
 * Cloudflare Pages Function: /
 * Health check endpoint
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function onRequestOptions() {
  return new Response(null, { headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  const isConfigured = !!context.env.GEMINI_API_KEY;
  return new Response(
    JSON.stringify({
      status: "online",
      service: "Auto MCQ Solver Cloudflare Proxy",
      configured: isConfigured,
      timestamp: new Date().toISOString()
    }),
    {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    }
  );
}
