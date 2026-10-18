import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import worker from "../src/worker.js";

const TOOLS = ["coin", "dice", "float", "int", "pick", "sample", "shuffle", "uuid", "weighted"];

async function checkClient(client) {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), TOOLS);
  const int = tools.find((t) => t.name === "int");
  assert.match(int.description, /never invent/);
  assert.equal(int.annotations.readOnlyHint, true);
  assert.equal(int.annotations.destructiveHint, false);
  assert.equal(int.annotations.openWorldHint, false);
  assert.equal(int._meta["openai/toolInvocation/invoking"], "Picking a number…");
  assert.match(client.getInstructions(), /instead of choosing yourself/);

  const res = await client.callTool({ name: "int", arguments: { min: 1, max: 10 } });
  const body = JSON.parse(res.content[0].text);
  assert.deepEqual(res.structuredContent, body);
  assert.equal(body.op, "int");
  assert.ok(body.result >= 1 && body.result <= 10);
  assert.equal(body.source, "system");

  const defaults = JSON.parse((await client.callTool({ name: "dice", arguments: {} })).content[0].text);
  assert.equal(defaults.result.rolls.length, 1);

  const bad = await client.callTool({ name: "int", arguments: { min: 10, max: 1 } });
  assert.equal(bad.isError, true);
  return body;
}

test("stdio MCP server", async () => {
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [fileURLToPath(new URL("../src/mcp.js", import.meta.url))],
    }),
  );
  try {
    await checkClient(client);
  } finally {
    await client.close();
  }
});

// The Worker's fetch handler, called directly (no ASSETS or rate limiter bindings).
const env = { RANDOLLM_SECRET: "test-secret", APP_URL: "https://randollm.example" };
const call = (path, init) => worker.fetch(new Request(`https://randollm.example${path}`, init), env);
const post = (path, body) =>
  call(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("Worker: remote MCP over Streamable HTTP", async () => {
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL("https://randollm.example/mcp"), {
      fetch: (url, init) => worker.fetch(new Request(url, init), env),
    }),
  );
  try {
    const receipt = await checkClient(client);
    assert.ok(receipt.signature, "results are signed when a secret is set");
    const info = client.getServerVersion();
    assert.equal(info.websiteUrl, "https://randollm.example");
    assert.deepEqual(
      info.icons.map((i) => i.src),
      ["https://randollm.example/icon.png", "https://randollm.example/icon.svg"],
    );
  } finally {
    await client.close();
  }
});

test("Worker: REST API", async () => {
  const res = await call("/api/int?min=1&max=6");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  const int = await res.json();
  assert.ok(int.result >= 1 && int.result <= 6);

  const picked = await (await post("/api/pick", { options: ["x", "y"] })).json();
  assert.ok(["x", "y"].includes(picked.result));

  const seeded = await Promise.all([1, 2].map(() => call("/api/int?seed=42").then((r) => r.json())));
  assert.equal(seeded[0].result, seeded[1].result);

  assert.deepEqual(await (await post("/api/verify", int)).json(), { valid: true });
  assert.deepEqual(await (await post("/api/verify", { ...int, result: 0 })).json(), { valid: false });

  assert.equal((await post("/api/pick", { options: [] })).status, 400);
  assert.equal((await call("/api/pick", { method: "POST", body: "not json" })).status, 400);
  assert.equal((await call("/api/nope")).status, 404);
  assert.equal((await call("/api/toString")).status, 404);
  assert.equal((await call("/api/int", { method: "PUT" })).status, 405);
  assert.equal((await post("/api/pick", { options: ["x".repeat(70_000)] })).status, 413);
});

test("Worker: health, CORS preflight, browser visit to /mcp", async () => {
  assert.deepEqual(await (await call("/health")).json(), { ok: true });

  const pre = await call("/mcp", { method: "OPTIONS" });
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get("access-control-allow-headers"), /Mcp-Protocol-Version/);

  const visit = await call("/mcp", { headers: { accept: "text/html,application/xhtml+xml" } });
  assert.equal(visit.status, 302);
  assert.equal(visit.headers.get("location"), "https://randollm.example/#setup");
});

test("Worker: rate limiter returns 429", async () => {
  const limited = { ...env, API_LIMITER: { limit: async () => ({ success: false }) } };
  const res = await worker.fetch(new Request("https://randollm.example/api/coin"), limited);
  assert.equal(res.status, 429);
});
