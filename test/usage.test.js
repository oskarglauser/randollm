import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import worker from "../src/worker.js";

function envWithUsage() {
  const points = [];
  return { points, env: { USAGE: { writeDataPoint: (p) => points.push(p) } } };
}

test("MCP: records the client on connect and each tool call, never inputs", async () => {
  const { points, env } = envWithUsage();
  const client = new Client({ name: "test-client", version: "1.2.3" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL("https://randollm.example/mcp"), {
      fetch: (url, init) => worker.fetch(new Request(url, init), env),
    }),
  );
  await client.callTool({ name: "pick", arguments: { options: ["secret-option-a", "secret-option-b"] } });
  await client.close();

  const blobs = points.map((p) => p.blobs);
  assert.deepEqual(blobs[0].slice(0, 4), ["connect", "", "mcp", "test-client 1.2.3"]);
  const call = blobs.find((b) => b[0] === "call");
  assert.deepEqual(call.slice(0, 3), ["call", "pick", "mcp"]);
  assert.ok(!JSON.stringify(points).includes("secret-option"), "inputs are never recorded");
  // tools/list and notifications are not counted.
  assert.equal(points.length, 2);
});

test("API: counts calls, and separates the landing page's demos", async () => {
  const { points, env } = envWithUsage();
  await worker.fetch(new Request("https://randollm.example/api/coin", { headers: { "user-agent": "curl/8.7.1" } }), env);
  await worker.fetch(
    new Request("https://randollm.example/api/dice?count=1&sides=6", {
      headers: { referer: "https://randollm.example/", "user-agent": "Mozilla/5.0 something long" },
    }),
    env,
  );
  await worker.fetch(new Request("https://randollm.example/api/nope"), env);
  assert.deepEqual(
    points.map((p) => p.blobs.slice(0, 4)),
    [
      ["call", "coin", "api", "curl/8.7.1"],
      ["call", "dice", "site", ""],
    ],
  );
});

test("a failing analytics binding never breaks a request", async () => {
  const env = { USAGE: { writeDataPoint: () => { throw new Error("down"); } } };
  const res = await worker.fetch(new Request("https://randollm.example/api/coin"), env);
  assert.equal(res.status, 200);
});

// ---------- Appscope ----------

// Captures the Worker's outgoing Appscope requests instead of sending them.
function withAppscope(respond = () => new Response("{}", { status: 202 })) {
  const sent = [];
  const waits = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith("https://appscope.glauser.com/")) return realFetch(input, init);
    sent.push({ url, headers: new Headers(init.headers), body: JSON.parse(init.body) });
    return respond();
  };
  return {
    sent,
    env: { APPSCOPE_SECRET_KEY: "sk_test" },
    ctx: { waitUntil: (p) => waits.push(p) },
    done: async () => {
      await Promise.all(waits);
      globalThis.fetch = realFetch;
    },
  };
}

test("Appscope: mcp_connected and tool_called, sent with the secret key", async () => {
  const a = withAppscope();
  try {
    const client = new Client({ name: "claude-ai", version: "0.1.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL("https://randollm.example/mcp"), {
        fetch: (url, init) => worker.fetch(new Request(url, init), a.env, a.ctx),
      }),
    );
    await client.callTool({ name: "coin", arguments: {} });
    await client.close();
    await worker.fetch(new Request("https://randollm.example/api/int?min=1&max=6"), a.env, a.ctx);
    // The landing page's own demo is not real use.
    await worker.fetch(
      new Request("https://randollm.example/api/dice?count=1&sides=6", { headers: { referer: "https://randollm.example/" } }),
      a.env,
      a.ctx,
    );
  } finally {
    await a.done();
  }
  assert.deepEqual(
    a.sent.map((s) => [s.body.name, s.body.props]),
    [
      ["mcp_connected", { client: "claude-ai" }],
      ["tool_called", { tool: "coin", channel: "mcp" }],
      ["tool_called", { tool: "int", channel: "api" }],
    ],
  );
  for (const s of a.sent) {
    assert.equal(s.url, "https://appscope.glauser.com/api/v1/events");
    assert.equal(s.headers.get("authorization"), "Bearer sk_test");
    assert.match(s.body.id, /^[0-9a-f-]{36}$/);
  }
  assert.equal(new Set(a.sent.map((s) => s.body.id)).size, a.sent.length, "ids are unique");
});

test("Appscope: nothing is sent without a key, and a failure never breaks a request", async () => {
  const a = withAppscope(() => {
    throw new Error("appscope down");
  });
  try {
    const noKey = await worker.fetch(new Request("https://randollm.example/api/coin"), {}, a.ctx);
    assert.equal(noKey.status, 200);
    assert.equal(a.sent.length, 0);
    const down = await worker.fetch(new Request("https://randollm.example/api/coin"), a.env, a.ctx);
    assert.equal(down.status, 200);
  } finally {
    await a.done();
  }
});
