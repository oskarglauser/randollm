# randollm

LLMs can't be random. Ask one to "pick a number from 1 to 10" and you get 7 far too often. randollm gives the model a tool that does the randomness for it.

Live at **https://randollm.glauser.com**:

| Path          | What                                                             |
| ------------- | ---------------------------------------------------------------- |
| `/mcp`        | Remote MCP server (Streamable HTTP, stateless, no auth)          |
| `/api/<tool>` | REST API: `GET` with query params or `POST` with a JSON body     |
| `/api/verify` | `POST` a receipt to check its signature                          |
| `/health`     | `{"ok":true}`                                                    |
| everything else | Landing page and site files from `public/` (static assets)     |

Results come from a cryptographically secure generator (`node:crypto`), and ranges use rejection sampling, so they're unbiased.

## Tools

| Tool       | Does                                       | Params                              |
| ---------- | ------------------------------------------ | ----------------------------------- |
| `int`      | Whole number in `[min, max]`               | `min=1`, `max=100`                  |
| `float`    | Decimal in `[min, max)`                    | `min=0`, `max=1`                    |
| `coin`     | heads / tails                              |                                     |
| `pick`     | One option from a list                     | `options`                           |
| `sample`   | `k` distinct options                       | `items`, `k`                        |
| `shuffle`  | Random order                               | `items`                             |
| `weighted` | One option, with relative weights          | `options`, `weights`                |
| `dice`     | e.g. 2d6                                   | `count=1`, `sides=6`                |
| `uuid`     | v4 UUID                                    |                                     |

Every tool also takes an optional `seed`. With a seed, results come from a deterministic HMAC-SHA256 stream, so they can be reproduced, and they're marked `"source": "seeded"`. Without one, results can't be predicted.

Every result is a receipt (`id`, `op`, `params`, `result`, `source`, `timestamp`). When `RANDOLLM_SECRET` is set, it also has a `signature`: an HMAC-SHA256 over the rest of the receipt.

All tools are annotated `readOnlyHint: true`, `destructiveHint: false` and `openWorldHint: false`. Clients use these annotations, and the Claude and ChatGPT directories require them. Results come back both as JSON text and as `structuredContent`.

## Code

- [src/random.js](src/random.js): the randomness, receipts and signing. Every operation draws bytes from one `bytes(n)` source. To use a hardware RNG or a beacon like drand, swap `systemSource()`.
- [src/tools.js](src/tools.js): MCP tool definitions and server instructions, shared by both servers.
- [src/worker.js](src/worker.js): the Cloudflare Worker (`/mcp`, `/api/*`, `/health`).
- [src/mcp.js](src/mcp.js): a local stdio MCP server with the same tools.
- [public/](public/): the landing page, privacy, terms and support pages, 404, `llms.txt`, `robots.txt`, sitemap, and the share image and icons. `icon.png` (512×512) is rendered from `icon.svg`.
- [site/die.js](site/die.js): the 3D die on the landing page (three.js). Tapping it rolls a real `/api/dice` result. Run `npm run build:site` to bundle it into `public/assets/die.js`, and commit both files: deploys have no build step, and CI checks they match. `public/die.png` is a still render of the same scene, shown until WebGL is ready.
- [server.json](server.json): the entry for the official MCP Registry.
- [chatgpt-plugin/](chatgpt-plugin/): the package for ChatGPT's plugin directory. `npm run plugin:zip` builds `dist/randollm-chatgpt.zip`.

## Directories

[docs/directories.md](docs/directories.md) has what's ready and the steps left for the Claude Connectors Directory, ChatGPT's plugin directory, the official MCP Registry, Glama and Smithery, plus the decisions to make first.

## Local development

```bash
npm install
```

```bash
npm run dev
```

This serves everything on http://localhost:3002 (port 3002 in infra's "Local ports" table). To sign results locally, copy `.env.example` to `.dev.vars` and set `RANDOLLM_SECRET`.

```bash
npm test
```

The tests cover the randomness (including a chi-square check), both MCP servers through the real MCP client, and the REST API.

To use the local stdio server from Claude Code:

```bash
claude mcp add randollm -- node "$(pwd)/src/mcp.js"
```

## Deploy

Hosting is a Cloudflare Worker with static assets. Workers Builds deploys every push to `main`, and other branches get a noindex Preview URL.

It's stateless, so it needs no database, Dockerfile or server of its own.

One-time setup:

1. Push the repo to GitHub.
2. In Cloudflare, go to **Workers & Pages → Create → Import a repository** and pick `randollm`. Keep the default commands: no build command, and `npx wrangler deploy` as the deploy command.
3. Under **Worker → Settings → Domains & Routes**, add the custom domain `randollm.glauser.com`.
4. Under **Worker → Settings → Variables and Secrets**, add a secret `RANDOLLM_SECRET`, generated with `openssl rand -base64 32`.
5. Turn on Cloudflare Web Analytics for the site. The privacy page says it's in use.
6. Check that `https://randollm.glauser.com/health` returns `{"ok":true}`, then add the connector in Claude and in ChatGPT (developer mode) and call a tool.

## Usage stats

Every tool call is counted anonymously in Workers Analytics Engine ([src/usage.js](src/usage.js)): the tool, the channel (`mcp`, `api`, or `site` for the landing page's own demos), the client's reported name or user agent, and the country. No IP addresses and no inputs or results are recorded. MCP clients are also counted when they connect, which shows which apps use randollm.

```bash
npm run usage
```

This prints the last 7 days (`npm run usage -- 30` for 30). It uses your Wrangler login (`npx wrangler login`), so there's nothing to set up. To use an API token instead, set `CLOUDFLARE_API_TOKEN` (with **Account Analytics: Read**) and `CLOUDFLARE_ACCOUNT_ID` in `.env`. Request totals and errors are also on the Worker's **Metrics** tab in Cloudflare, and the last 3 days of requests are under **Logs**.

### Appscope

Product analytics go to [Appscope](https://appscope.glauser.com). The script in each page's `<head>` records page views. These events are sent too:

| Event | Sent from | When |
| --- | --- | --- |
| `mcp_url_copied` | page (`public/index.html`) | The hero's Copy URL button worked |
| `setup_viewed` `{app}` | page (`public/index.html`) | A setup tab was clicked (claude, chatgpt, claude code, cursor, vs code, other) |
| `die_rolled` `{value}` | page (`site/die.js`) | The 3D die landed on a real roll |
| `mcp_connected` `{client}` | Worker (`src/usage.js`) | An MCP client connected (its reported name, like `claude-ai`) |
| `tool_called` `{tool, channel}` | Worker (`src/usage.js`) | A tool ran over `mcp` or `api`. The landing page's own demos are left out |

The Worker also reports requests from AI agents to Appscope's `/api/v1/agents` (`reportAgent()` in `src/appscope.js`), after the response.

Server events need the Worker secret `APPSCOPE_SECRET_KEY` (`npx wrangler secret put APPSCOPE_SECRET_KEY`). Without it they aren't sent. They go out after the response (`ctx.waitUntil`), so Appscope being slow or down never affects a request.

## Limits and cost

- **Every request runs the Worker** (`run_worker_first: true`) so it can report AI agents (ChatGPT-User, GPTBot, ClaudeBot…) to Appscope, which they'd otherwise never show up in: they don't run the page's script. Page views therefore count toward the request quota. The demos on the home page make one API request each.
- **Workers Free plan:** 100,000 Worker requests a day, with no bill. Past the limit, requests fail with error 1027 until midnight UTC.
- **Rate limits** (`ratelimits` in `wrangler.jsonc`): 60 requests a minute per IP on `/api/*` and 600 on `/mcp`. Claude and ChatGPT call remote MCP servers from shared IP ranges, so the `/mcp` limit is high on purpose. It only stops a single client from hammering the server. The limits are per Cloudflare location and approximate.
- **CPU:** about 0.1–0.3 ms per MCP request (measured locally), well under the free plan's 10 ms limit.

## License

[MIT](LICENSE)
