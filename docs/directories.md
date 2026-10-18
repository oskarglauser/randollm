# Listing randollm in directories

What's ready, what's left to do by hand, and the decisions that come first.
Requirements were checked against the official docs on 2026-10-18; they
change often, so re-read the linked page before each submission.

## Decisions

Decided on 2026-10-18:

1. **Support contact: `oskar@glauser.com`**, your existing mailbox, for
   now. A dedicated address can come later as a Loopia alias. Not Cloudflare
   Email Routing: glauser.com's mail is hosted at Loopia, and Email Routing
   would have to take over the domain's MX records, even for a subdomain.
   Bugs and questions go to GitHub issues, security reports to GitHub's
   private vulnerability reporting (`public/support.html`,
   `.github/SECURITY.md`).
2. **ChatGPT category: Productivity.** People use it for everyday
   decisions (picks, draws, turn order). `Entertainment` would invite the
   gambling question in review, and `Developer Tools` hides it from the
   people who use it.
3. **Terms: no governing law.** `public/terms.html` stays a short as-is,
   no-warranty text.

4. **Registry name: `com.glauser/randollm`** (already in `server.json`),
   proven with a DNS TXT record on glauser.com. It matches the server's
   domain. A URL can belong to only one registry name, so it stays this.

Nothing is left open.

## What's in place

| Requirement | Where |
| --- | --- |
| Streamable HTTP, no auth, stateless | `/mcp` |
| `title`, `readOnlyHint`, `destructiveHint`, `openWorldHint` on every tool | `src/tools.js` |
| Server icons (`serverInfo.icons`), `websiteUrl`, instructions | `src/tools.js` |
| `structuredContent` plus text on every result | `src/tools.js` |
| ChatGPT status lines (`openai/toolInvocation/*`) | `src/tools.js` |
| Privacy policy (incl. user choices) | https://randollm.glauser.com/privacy |
| Terms of use | https://randollm.glauser.com/terms |
| Support page | https://randollm.glauser.com/support |
| Square icon: 512×512 PNG and SVG | `public/icon.png`, `public/icon.svg` |
| MCP Registry entry | `server.json` |
| ChatGPT plugin package (manifest, MCP, skill, logo, test cases) | `chatgpt-plugin/`, built with `npm run plugin:zip` |
| Verification tokens served as plain text, never cached | `public/_headers` (`/.well-known/...`) |

`test/listing.test.js` fails if `server.json` or the plugin drift from the
server (version, URL, length limits, test cases naming real tools). Bump
`VERSION` in `src/tools.js`, `server.json` and `chatgpt-plugin/plugin.json`
together.

Merge and deploy this branch before submitting anywhere: the directories
fetch the icon, pages and server from production.

## Claude: Connectors Directory

Docs: [submission](https://claude.com/docs/connectors/building/submission),
[review criteria](https://claude.com/docs/connectors/building/review-criteria),
[directory policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy).
Needs a Pro, Max, Team or Enterprise plan.

1. Go to https://claude.ai/directory/manage → **Submit new** → **MCP connector**.
2. **Connection:** `https://randollm.glauser.com/mcp`. **Authentication:** none.
3. **Tools:** synced from the server. All nine should show titles and annotations.
4. **Listing:**
   - Name: `randollm`.
   - One-liner (≤ 200 characters): "Real randomness for Claude: random numbers, coin flips, picks, shuffles, dice and UUIDs from a secure generator."
   - Description (≤ 2,000 characters): adapt `longDescription` in `chatgpt-plugin/plugin.json`.
   - Categories: 1–5.
   - Documentation: `https://randollm.glauser.com/#setup`.
   - Privacy: `https://randollm.glauser.com/privacy`.
   - Support contact: `oskar@glauser.com`.
   - Icon: `public/icon.png`.
   - The slug can't be changed after publishing.
5. **Data handling:** randollm receives only each tool's inputs (a range,
   a list of options) and stores no inputs or results. It counts tool calls
   anonymously (tool, channel, the client's reported name, country; no IP
   addresses), kept up to three months in Workers Analytics Engine.
   Appscope (run by Oskar Glauser) gets the website's page views and events
   (`mcp_url_copied`, `setup_viewed`, `die_rolled`) and, from the Worker,
   `mcp_connected` and `tool_called`, with no IP addresses, browser details
   or visitor identifiers stored. Cloudflare keeps operational logs for up
   to 7 days. No conversation data, no accounts, no cookies.
6. **Use cases:** at least three example prompts. Use the five positive test
   cases in `chatgpt-plugin/plugin.json`. Nothing is needed before
   connecting. The connector reads only (it doesn't write data).
7. **Company:** Oskar Glauser, `https://www.glauser.com/`, and a primary contact for review emails.
8. **Test & launch:** run every tool once through the custom connector in
   Claude (or MCP Inspector) and confirm. There's no test account: say "no
   authentication; connect by URL".
9. **Compliance:** the seven acknowledgments. randollm moves no money,
   generates no media and collects no conversation data.
10. Submit. After approval, press **Publish**. Questions go to
   mcp-review@anthropic.com.

If a WAF rule is ever added in front of `/mcp`, allow Anthropic's range `160.79.104.0/21`.

## ChatGPT: plugin directory

Docs: [submission](https://developers.openai.com/plugins/deploy/submission),
[submission errors](https://developers.openai.com/plugins/deploy/submission-errors),
[review](https://developers.openai.com/plugins/deploy/app-review),
[guidelines](https://developers.openai.com/apps-sdk/app-submission-guidelines).
Since July 2026 apps are submitted as plugin ZIPs. A submission needs a
verified individual or business on the OpenAI platform organization, and a
project with global (not EU) data residency.

1. **Verify identity** under platform.openai.com → organization settings.
   `developerName` in the plugin must match the verified name; an
   unverified name is rejected.
2. **Record a demo video:** a short screen recording of ChatGPT using
   randollm (for example the starter prompts) on web and mobile. Upload it
   somewhere reviewers can open, and add
   `"demo_recording_url": "<url>"` to `extensions.com.openai.review` in
   `chatgpt-plugin/plugin.json`.
3. `npm run plugin:zip`, then upload `dist/randollm-chatgpt.zip` at
   https://platform.openai.com/plugins → **Upload new or existing plugin**
   → **With MCP**.
4. **Domain verification:** the portal shows a token. Save it, with no
   newline, as `public/.well-known/openai-apps-challenge`, then commit,
   deploy and press **Verify Domain**:
   `printf '%s' '<token>' > public/.well-known/openai-apps-challenge`
5. **Auth:** none. Run the tool scan.
6. **Annotation justifications**, if the portal asks for them (the docs
   disagree on whether they're still required). The same for every tool:
   - Read-only: "Only computes and returns a random value. It changes no data anywhere."
   - Not destructive: "Nothing is created, changed or deleted, and inputs aren't stored."
   - Not open-world: "Talks to no outside system. The result comes from a local cryptographic generator."
7. Submit for review and accept the attestations. Feedback arrives by
   email; after approval, press **Publish plugin**.

Risks to address in the review notes:
- **"Adds value beyond ChatGPT":** ChatGPT can already run code to make a
  random number. The listing leans on what randollm adds: unbiased results
  from a secure generator in every chat (including ones without code
  execution), and signed receipts that can be checked later.
- **Extra fields in results:** the guidelines discourage returning IDs and
  timestamps "unless needed". They make up the receipt, which is the
  verifiable part, so say so if a reviewer asks.
- **Gambling:** keep dice and coins framed as games and decisions, not betting.
- **Screenshots:** don't add any. They're only allowed for plugins with a UI.

### Demo recording (about 60 seconds)

OpenAI's reviewers want to see the real thing: ChatGPT calling randollm,
on the web and on a phone. Record it yourself; no voice-over needed.

1. **Set up (not recorded):** add randollm in ChatGPT under
   chatgpt.com/plugins → **+** → **Add custom MCP server**, as on the
   landing page. Start a new chat.
2. **Web, about 40 s** (macOS: Cmd+Shift+5 → Record Selected Portion,
   around the ChatGPT window):
   - "Pick a random number from 1 to 10." Show the randollm tool call and
     its status line ("Picked a number"), then the answer.
   - "Shuffle the speaking order for standup: Anna, Ben, Cleo, Dev."
   - "Pick 3 winners from: Ada, Bo, Cy, Di, Eve, Flo." Expand the tool
     result once so the receipt (result, source, signature) is visible.
3. **Phone, about 20 s** (iPhone: Control Center → Screen Recording, in
   the ChatGPT app with the same account): "Flip a coin: do I go out
   tonight?" Show the tool call and answer.
4. Trim the two clips, put them one after the other, and upload the result
   unlisted (YouTube unlisted or a shared Drive/Dropbox link). That URL is
   `demo_recording_url`.

## Official MCP Registry

Docs: [quickstart](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx),
[authentication](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/authentication.mdx),
[remote servers](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/remote-servers.mdx).
The registry is still in preview. It doesn't check that the URL is reachable.

With the `com.glauser/randollm` name:

1. Install the CLI with `brew install mcp-publisher`. Install
   `brew install openssl@3` too, because macOS's own openssl can't make
   Ed25519 keys.
2. Make a key outside the repo, and keep `key.pem` out of git:
   ```bash
   cd ~ && /opt/homebrew/opt/openssl@3/bin/openssl genpkey -algorithm Ed25519 -out randollm-registry-key.pem
   ```
3. In Cloudflare DNS for glauser.com, add a TXT record on the apex `@`. Its
   value is `v=MCPv1; k=ed25519; p=<public key>`. Print the public key with:
   ```bash
   /opt/homebrew/opt/openssl@3/bin/openssl pkey -in ~/randollm-registry-key.pem -pubout -outform DER | tail -c 32 | base64
   ```
4. Log in, then publish from the repo root:
   ```bash
   mcp-publisher login dns --domain glauser.com --private-key "$(/opt/homebrew/opt/openssl@3/bin/openssl pkey -in ~/randollm-registry-key.pem -noout -text | grep -A3 'priv:' | tail -n +2 | tr -d ' :\n')"
   ```
   ```bash
   mcp-publisher publish
   ```
5. Each publish needs a new version, and published versions can't be
   changed. Only `server.json` changed? Use a prerelease such as `1.0.0-1`.

## Glama

Glama imports everything in the official registry, so publishing there
should get randollm listed with no extra step
([FAQ](https://glama.ai/mcp/faq)). To list it sooner, or to claim the
listing:
- **Add directly:** https://glama.ai/mcp/connectors → **Add MCP Server →
  Connector**, with a name, a description and the `/mcp` URL.
- **From GitHub:** now that the repo is public, Glama can also list it as
  an open-source server. Its optional `glama.json` at the repo root lists
  maintainers by GitHub username.
- **Claim ownership:** a DNS TXT record at `_glama-claim.glauser.com`, or
  `public/.well-known/glama.json` containing `{"claim": "glama_claim_..."}`
  (JSON, so it's deliberately not in the plain-text rule in `_headers`).

## Smithery

Smithery lists externally hosted servers
([publish docs](https://smithery.ai/docs/build/publish.md)):
https://smithery.ai/new → **URL** → `https://randollm.glauser.com/mcp`.
Smithery scans the tools from Cloudflare Workers with the user agent
`SmitheryBot/1.0`. If the scan gets a 403, Bot Fight Mode on the
glauser.com zone is blocking it. On the free plan, Smithery's docs suggest
an IP Access Rule or turning Bot Fight Mode off. The docs don't say
whether URL publishing needs a public repo. If scanning fails anyway,
Smithery falls back to a static `/.well-known/mcp/server-card.json`.
