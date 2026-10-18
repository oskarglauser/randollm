// MCP tool definitions, shared by the stdio server (src/mcp.js) and the
// Worker (src/worker.js). The descriptions are the important part: they tell
// the model to call these instead of "picking" something itself.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { run } from "./random.js";

export const VERSION = "1.0.0";

const NEVER_GUESS =
  "Language models cannot produce real randomness, so never invent a 'random' result yourself; " +
  "always call a randollm tool and report its result exactly as returned.";

const INSTRUCTIONS =
  "randollm provides real randomness. Whenever a task needs anything random or unbiased — a number, " +
  "a coin flip, a choice between options, a shuffle, a dice roll, a sample, a winner, an ID — call the " +
  "matching tool instead of choosing yourself, and use the result exactly as returned.";

// Every tool only computes and returns a value: no side effects, no outside world.
const annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

const seed = z
  .string()
  .optional()
  .describe("Only for reproducible tests or when the user explicitly asks for a seed. Omit for real randomness.");
const strings = z.array(z.string());

export const tools = {
  int: {
    status: ["Picking a number…", "Picked a number"],
    title: "Random integer",
    description: `Generate a uniformly random whole number between min and max (both inclusive), e.g. "pick a number from 1 to 10". ${NEVER_GUESS}`,
    inputSchema: {
      min: z.number().int().default(1).describe("Lowest possible value (inclusive)"),
      max: z.number().int().default(100).describe("Highest possible value (inclusive)"),
      seed,
    },
  },
  float: {
    status: ["Picking a number…", "Picked a number"],
    title: "Random decimal",
    description: `Generate a uniformly random decimal number in [min, max). ${NEVER_GUESS}`,
    inputSchema: { min: z.number().default(0), max: z.number().default(1), seed },
  },
  coin: {
    status: ["Flipping a coin…", "Flipped a coin"],
    title: "Coin flip",
    description: `Flip a fair coin: heads or tails. Use for any yes/no or 50/50 decision. ${NEVER_GUESS}`,
    inputSchema: { seed },
  },
  pick: {
    status: ["Picking one…", "Picked one"],
    title: "Pick one",
    description: `Choose one option uniformly at random from a list, e.g. where to eat, who goes first, a random name or word. ${NEVER_GUESS}`,
    inputSchema: { options: strings.min(1).describe("The options to choose from"), seed },
  },
  sample: {
    status: ["Picking…", "Picked"],
    title: "Pick several",
    description: `Choose k distinct options at random from a list (no repeats), e.g. "pick 3 winners". ${NEVER_GUESS}`,
    inputSchema: { items: strings.min(1), k: z.number().int().min(0).describe("How many to pick"), seed },
  },
  shuffle: {
    status: ["Shuffling…", "Shuffled"],
    title: "Shuffle",
    description: `Put a list in a uniformly random order, e.g. a playlist, turn order or team draw. ${NEVER_GUESS}`,
    inputSchema: { items: strings, seed },
  },
  weighted: {
    status: ["Picking one…", "Picked one"],
    title: "Weighted pick",
    description: `Choose one option where some options are more likely than others. weights[i] is the relative weight of options[i] (they don't need to sum to 1). ${NEVER_GUESS}`,
    inputSchema: {
      options: strings.min(1),
      weights: z.array(z.number().min(0)).describe("Relative weights, same length as options"),
      seed,
    },
  },
  dice: {
    status: ["Rolling dice…", "Rolled dice"],
    title: "Roll dice",
    description: `Roll dice, e.g. 2d6 is count=2, sides=6. Returns each roll and the total. ${NEVER_GUESS}`,
    inputSchema: {
      count: z.number().int().min(1).max(1000).default(1),
      sides: z.number().int().min(2).default(6),
      seed,
    },
  },
  uuid: {
    status: ["Generating a UUID…", "Generated a UUID"],
    title: "Random UUID",
    description: `Generate a random version-4 UUID. ${NEVER_GUESS}`,
    inputSchema: { seed },
  },
};

// serverOptions lets the Worker swap in a JSON Schema validator that doesn't use eval.
// Directories and clients show these next to the server's name.
function icons(websiteUrl) {
  return [
    { src: `${websiteUrl}/icon.png`, mimeType: "image/png", sizes: ["512x512"] },
    { src: `${websiteUrl}/icon.svg`, mimeType: "image/svg+xml", sizes: ["any"] },
  ];
}

export function createServer({ secret, websiteUrl, serverOptions = {} } = {}) {
  const server = new McpServer(
    {
      name: "randollm",
      title: "randollm",
      version: VERSION,
      ...(websiteUrl && { websiteUrl, icons: icons(websiteUrl) }),
    },
    { instructions: INSTRUCTIONS, ...serverOptions },
  );
  for (const [op, { status, ...config }] of Object.entries(tools)) {
    const tool = {
      ...config,
      annotations: { title: config.title, ...annotations },
      // ChatGPT shows these while the tool runs and after it's done.
      _meta: { "openai/toolInvocation/invoking": status[0], "openai/toolInvocation/invoked": status[1] },
    };
    server.registerTool(op, tool, async (params) => {
      try {
        const receipt = run(op, params, { secret });
        return { structuredContent: receipt, content: [{ type: "text", text: JSON.stringify(receipt, null, 2) }] };
      } catch (err) {
        return { isError: true, content: [{ type: "text", text: err.message }] };
      }
    });
  }
  return server;
}
