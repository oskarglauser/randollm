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
