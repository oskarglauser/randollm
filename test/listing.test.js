// The directory listings (MCP Registry, ChatGPT plugin) repeat facts from the
// server. These checks catch them drifting apart.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { VERSION, tools } from "../src/tools.js";

const read = (path) => JSON.parse(fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const MCP_URL = "https://randollm.glauser.com/mcp";

test("server.json matches the server", () => {
  const server = read("server.json");
  assert.equal(server.version, VERSION);
  assert.ok(server.description.length <= 100);
  assert.deepEqual(server.remotes, [{ type: "streamable-http", url: MCP_URL }]);
});

test("ChatGPT plugin matches the server", () => {
  const plugin = read("chatgpt-plugin/plugin.json");
  assert.equal(plugin.version, VERSION);
  assert.equal(read("chatgpt-plugin/mcp.json").mcpServers.randollm.url, MCP_URL);

  const { interface: ui, review } = plugin.extensions["com.openai"];
  assert.ok(ui.displayName.length <= 30 && ui.shortDescription.length <= 30);
  assert.ok(ui.longDescription.length <= 4000);
  assert.ok(ui.defaultPrompt.length <= 3 && ui.defaultPrompt.every((p) => p.length <= 128));
  for (const path of [ui.logo, ui.composerIcon]) {
    assert.ok(fs.existsSync(new URL(`../chatgpt-plugin/${path}`, import.meta.url)), path);
  }

  assert.equal(review.test_cases.positive.length, 5);
  assert.equal(review.test_cases.negative.length, 3);
  for (const { tools_triggered } of review.test_cases.positive) assert.ok(Object.hasOwn(tools, tools_triggered));
});
