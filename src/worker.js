// Cloudflare Worker: remote MCP at /mcp, a REST API at /api/<op>, /health.
// Everything else is the static landing page in public/, served by Workers
// static assets without running this script (see run_worker_first).
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/cfworker";
import { createServer } from "./tools.js";
import { operations, run, verify, RandomError } from "./random.js";

const MAX_BODY = 64 * 1024;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers":
    "Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "access-control-expose-headers": "Mcp-Session-Id, Mcp-Protocol-Version",
  "access-control-max-age": "86400",
};

// Random results must never be cached by Cloudflare or a browser.
function withHeaders(response) {
  const res = new Response(response.body, response);
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  res.headers.set("cache-control", "no-store");
  return res;
}

function json(status, data) {
  return withHeaders(Response.json(data, { status }));
}

// Limiter bindings are per Cloudflare location and eventually consistent:
// a guard against one client hammering the Worker, not exact accounting.
async function rateLimited(limiter, request) {
  if (!limiter) return false;
  const key = request.headers.get("cf-connecting-ip") ?? "unknown";
  const { success } = await limiter.limit({ key });
  return !success;
}

function tooLarge(request) {
  return Number(request.headers.get("content-length") ?? 0) > MAX_BODY;
}

async function readParams(request, url) {
  const params = {};
  for (const [k, v] of url.searchParams) {
    params[k] = k !== "seed" && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : v;
  }
  if (request.method !== "POST") return params;
  const text = await request.text();
  if (text.length > MAX_BODY) throw Object.assign(new RandomError("body too large"), { status: 413 });
  if (!text.trim()) return params;
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new RandomError("body must be a JSON object");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new RandomError("body must be a JSON object");
  return { ...params, ...body };
}

async function handleApi(request, url, env) {
  if (request.method !== "GET" && request.method !== "POST") return json(405, { error: "use GET or POST" });
  if (tooLarge(request)) return json(413, { error: "body too large" });
  if (await rateLimited(env.API_LIMITER, request)) return json(429, { error: "rate limit exceeded, try again in a minute" });
  const op = url.pathname.slice("/api/".length);
  if (op !== "verify" && !Object.hasOwn(operations, op)) return json(404, { error: `unknown operation: ${op}` });
  try {
    const params = await readParams(request, url);
    if (op === "verify") return json(200, { valid: verify(params, env.RANDOLLM_SECRET) });
    return json(200, run(op, params, { secret: env.RANDOLLM_SECRET }));
  } catch (err) {
    if (err instanceof RandomError) return json(err.status ?? 400, { error: err.message });
    throw err;
  }
}

async function handleMcp(request, url, env) {
  // A person opening the MCP URL in a browser gets the setup instructions.
  const accept = request.headers.get("accept") ?? "";
  if (request.method === "GET" && accept.includes("text/html") && !accept.includes("text/event-stream")) {
    return Response.redirect(new URL("/#setup", url), 302);
  }
  if (tooLarge(request)) return json(413, { error: "body too large" });
  if (await rateLimited(env.MCP_LIMITER, request)) return json(429, { error: "rate limit exceeded, try again in a minute" });

  // Stateless: a fresh server and transport per request, no sessions to store.
  const server = createServer({
    secret: env.RANDOLLM_SECRET,
    websiteUrl: env.APP_URL,
    serverOptions: { jsonSchemaValidator: new CfWorkerJsonSchemaValidator() },
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return withHeaders(await transport.handleRequest(request));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const isApi = pathname.startsWith("/api/");
    const isMcp = pathname === "/mcp";

    try {
      if (request.method === "OPTIONS" && (isApi || isMcp)) return withHeaders(new Response(null, { status: 204 }));
      if (pathname === "/health") return json(200, { ok: true });
      if (isMcp) return await handleMcp(request, url, env);
      if (isApi) return await handleApi(request, url, env);
      return env.ASSETS ? env.ASSETS.fetch(request) : json(404, { error: "not found" });
    } catch (err) {
      console.error(err);
      return json(500, { error: "internal error" });
    }
  },
};
