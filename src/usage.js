// Anonymous usage counting with Workers Analytics Engine (binding USAGE,
// dataset randollm_usage). One data point per event, never an IP address or
// a tool's inputs. Columns, as queried by scripts/usage.mjs:
//   blob1 event    "call" (a tool was used) or "connect" (an MCP client connected)
//   blob2 tool     e.g. "int"; "" for connect events
//   blob3 channel  "mcp", "api", or "site" (the landing page's own demos)
//   blob4 client   the MCP client's name and version, or the API caller's user agent
//   blob5 country  two-letter code from Cloudflare
// Real use (not the landing page's demos) also goes to Appscope as
// "mcp_connected" and "tool_called" events (see src/appscope.js).
import { operations } from "./random.js";
import { sendEvent } from "./appscope.js";

const MAX_CLIENT = 96;

function clean(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, MAX_CLIENT);
}

function record(env, request, { event, tool = "", channel, client = "" }) {
  try {
    env.USAGE?.writeDataPoint({
      indexes: [tool || event],
      blobs: [event, tool, channel, clean(client), request.cf?.country ?? ""],
    });
  } catch {
    // Counting must never break a request.
  }
}

// Requests from the landing page's demos, so they don't count as real use.
function fromSite(request, url) {
  for (const header of ["origin", "referer"]) {
    const value = request.headers.get(header);
    if (!value) continue;
    try {
      return new URL(value).host === url.host;
    } catch {
      return false;
    }
  }
  return false;
}

export function recordApi(env, ctx, request, url, op) {
  const site = fromSite(request, url);
  record(env, request, {
    event: "call",
    tool: op,
    channel: site ? "site" : "api",
    client: site ? "" : request.headers.get("user-agent"),
  });
  if (!site) sendEvent(env, ctx, "tool_called", { tool: op, channel: "api" });
}

// Reads a copy of the MCP request body: one JSON-RPC message, or a batch.
export async function recordMcp(env, ctx, request) {
  if (request.method !== "POST" || (!env.USAGE && !env.APPSCOPE_SECRET_KEY)) return;
  let body;
  try {
    body = await request.clone().json();
  } catch {
    return;
  }
  for (const msg of Array.isArray(body) ? body : [body]) {
    if (msg?.method === "initialize") {
      const info = msg.params?.clientInfo ?? {};
      record(env, request, {
        event: "connect",
        channel: "mcp",
        client: [info.name, info.version].filter(Boolean).join(" "),
      });
      sendEvent(env, ctx, "mcp_connected", { client: clean(info.name) || "unknown" });
    } else if (msg?.method === "tools/call") {
      const name = msg.params?.name;
      const tool = Object.hasOwn(operations, name) ? name : "unknown";
      record(env, request, {
        event: "call",
        tool,
        channel: "mcp",
        client: request.headers.get("user-agent"),
      });
      sendEvent(env, ctx, "tool_called", { tool, channel: "mcp" });
    }
  }
}
