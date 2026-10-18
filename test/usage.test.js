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
