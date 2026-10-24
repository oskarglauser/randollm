// Server-side product events for Appscope (https://appscope.glauser.com).
// Only sent when APPSCOPE_SECRET_KEY is set, after the response, and never
// allowed to fail a request. Appscope stores no IP addresses or user agents.
const ENDPOINT = "https://appscope.glauser.com/api/v1/events";

export function sendEvent(env, ctx, name, props = {}) {
  const key = env.APPSCOPE_SECRET_KEY;
  if (!key) return;
  const send = fetch(ENDPOINT, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ name, id: crypto.randomUUID(), props }),
  })
    .then((res) => {
      if (!res.ok) console.error(`appscope: ${name} returned ${res.status}`);
    })
    .catch((err) => console.error(`appscope: ${name} failed: ${err.message}`));
  if (ctx?.waitUntil) ctx.waitUntil(send);
}

// AI agents (ChatGPT-User, GPTBot, ClaudeBot…) don't run the page's script,
// so the Worker reports them. Only user agents that look like a bot are
// sent; Appscope keeps the known AI agents and checks their IP against the
// operator's published ranges (the IP is never stored).
const AGENTS_ENDPOINT = "https://appscope.glauser.com/api/v1/agents";
const AI_AGENT =
  /bot|crawl|spider|gpt|claude|anthropic|perplexity|openai|cohere|mistral|duckassist|meta-external|bytespider|diffbot/i;

export function reportAgent(request, response, env, ctx) {
  const key = env.APPSCOPE_SECRET_KEY;
  const ua = request.headers.get("user-agent") || "";
  if (!key || !AI_AGENT.test(ua)) return;
  const send = fetch(AGENTS_ENDPOINT, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      ua,
      path: new URL(request.url).pathname,
      status: response.status,
      ip: request.headers.get("cf-connecting-ip"),
    }),
  })
    .then((res) => {
      if (!res.ok) console.error(`appscope: agent report returned ${res.status}`);
    })
    .catch((err) => console.error(`appscope: agent report failed: ${err.message}`));
  if (ctx?.waitUntil) ctx.waitUntil(send);
}
