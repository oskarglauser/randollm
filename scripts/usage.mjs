#!/usr/bin/env node
// Prints randollm usage from Workers Analytics Engine (see src/usage.js).
//   npm run usage          last 7 days
//   npm run usage -- 30    last 30 days
// Uses your Wrangler login (`npx wrangler login`). To use an API token
// instead, set CLOUDFLARE_API_TOKEN (needs Account Analytics: Read) and
// CLOUDFLARE_ACCOUNT_ID in the environment or in .env.
import { execFileSync } from "node:child_process";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env: use the environment as it is.
}

// Output is captured, never printed: it contains the token.
const wrangler = (...args) =>
  execFileSync("npx", ["wrangler", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token } = process.env;
try {
  token ||= wrangler("auth", "token").split("\n").pop();
  account ||= JSON.parse(wrangler("whoami", "--json")).accounts?.[0]?.id;
} catch {
  // Not logged in: handled below.
}
if (!account || !token) {
  console.error("Run `npx wrangler login` first, or set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in .env.");
  process.exit(1);
}

const days = Math.max(1, Math.min(90, Number(process.argv[2]) || 7));
const since = `timestamp > NOW() - INTERVAL '${days}' DAY`;

async function sql(query) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/analytics_engine/sql`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: `${query} FORMAT JSON`,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Analytics Engine returned ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text).data.map((row) => ({ ...row, n: Number(row.n) }));
}

// Analytics Engine samples at high volume; SUM(_sample_interval) is the true count.
const sections = [
  [
    "Tool calls per day (real use, not the landing page)",
    `SELECT toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day, blob3 AS channel, SUM(_sample_interval) AS n
     FROM randollm_usage WHERE blob1 = 'call' AND blob3 != 'site' AND ${since}
     GROUP BY day, channel ORDER BY day, channel`,
  ],
  [
    "Calls by tool",
    `SELECT blob2 AS tool, blob3 AS channel, SUM(_sample_interval) AS n
     FROM randollm_usage WHERE blob1 = 'call' AND ${since}
     GROUP BY tool, channel ORDER BY n DESC`,
  ],
  [
    "MCP clients that connected",
    `SELECT blob4 AS client, SUM(_sample_interval) AS n
     FROM randollm_usage WHERE blob1 = 'connect' AND ${since}
     GROUP BY client ORDER BY n DESC LIMIT 20`,
  ],
  [
    "REST API callers",
    `SELECT blob4 AS user_agent, SUM(_sample_interval) AS n
     FROM randollm_usage WHERE blob1 = 'call' AND blob3 = 'api' AND ${since}
     GROUP BY user_agent ORDER BY n DESC LIMIT 15`,
  ],
  [
    "Countries",
    `SELECT blob5 AS country, SUM(_sample_interval) AS n
     FROM randollm_usage WHERE blob3 != 'site' AND ${since}
     GROUP BY country ORDER BY n DESC LIMIT 15`,
  ],
];

console.log(`randollm usage, last ${days} day${days === 1 ? "" : "s"}\n`);
for (const [title, query] of sections) {
  const rows = await sql(query);
  console.log(title);
  if (rows.length) console.table(rows);
  else console.log("  (nothing yet)\n");
}
