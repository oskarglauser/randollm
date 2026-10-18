// Anonymous usage counting with Workers Analytics Engine (binding USAGE,
// dataset randollm_usage). One data point per event, never an IP address or
// a tool's inputs. Columns, as queried by scripts/usage.mjs:
//   blob1 event    "call" (a tool was used) or "connect" (an MCP client connected)
//   blob2 tool     e.g. "int"; "" for connect events
//   blob3 channel  "mcp", "api", or "site" (the landing page's own demos)
//   blob4 client   the MCP client's name and version, or the API caller's user agent
//   blob5 country  two-letter code from Cloudflare
import { operations } from "./random.js";

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

export function recordApi(env, request, url, op) {
  const site = fromSite(request, url);
  record(env, request, {
    event: "call",
    tool: op,
    channel: site ? "site" : "api",
    client: site ? "" : request.headers.get("user-agent"),
  });
}

// Reads a copy of the MCP request body: one JSON-RPC message, or a batch.
export async function recordMcp(env, request) {
  if (request.method !== "POST" || !env.USAGE) return;
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
    } else if (msg?.method === "tools/call") {
      const name = msg.params?.name;
      record(env, request, {
        event: "call",
        tool: Object.hasOwn(operations, name) ? name : "unknown",
        channel: "mcp",
        client: request.headers.get("user-agent"),
      });
    }
  }
}
