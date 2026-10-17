// Core randomness. Everything draws bytes from a "source": the OS CSPRNG by
// default, or a deterministic HMAC-SHA256 stream when a seed is given (for
// reproducible tests). Sampling uses rejection so ranges are never biased.
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export class RandomError extends Error {}

function systemSource() {
  return { kind: "system", bytes: (n) => randomBytes(n) };
}

function seededSource(seed) {
  const key = Buffer.from(String(seed), "utf8");
  let counter = 0n;
  let pool = Buffer.alloc(0);
  return {
    kind: "seeded",
    bytes(n) {
      while (pool.length < n) {
        const block = Buffer.alloc(8);
        block.writeBigUInt64BE(counter++);
        pool = Buffer.concat([pool, createHmac("sha256", key).update(block).digest()]);
      }
      const out = pool.subarray(0, n);
      pool = pool.subarray(n);
      return out;
    },
  };
}

export function makeSource(seed) {
  return seed === undefined || seed === null || seed === "" ? systemSource() : seededSource(seed);
}

// Uniform integer in [0, n) for any positive BigInt n.
function belowBig(src, n) {
  if (n <= 0n) throw new RandomError("range must be non-empty");
  if (n === 1n) return 0n;
  const bits = (n - 1n).toString(2).length;
  const nbytes = Math.ceil(bits / 8);
  const mask = (1n << BigInt(bits)) - 1n;
  for (;;) {
    const v = BigInt("0x" + src.bytes(nbytes).toString("hex")) & mask;
    if (v < n) return v;
  }
}

function below(src, n) {
  return Number(belowBig(src, BigInt(n)));
}

function requireInt(name, v) {
  if (!Number.isSafeInteger(v)) throw new RandomError(`${name} must be a safe integer`);
}

function requireList(name, items, min = 1) {
  if (!Array.isArray(items) || items.length < min) {
    throw new RandomError(`${name} must be a list with at least ${min} item(s)`);
  }
}

export function randInt(src, min, max) {
  requireInt("min", min);
  requireInt("max", max);
  if (min > max) throw new RandomError("min must be <= max");
  return Number(BigInt(min) + belowBig(src, BigInt(max) - BigInt(min) + 1n));
}

// 53 random bits -> float in [min, max).
export function randFloat(src, min = 0, max = 1) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
    throw new RandomError("need finite min < max");
  }
  const u = Number(belowBig(src, 1n << 53n)) / 2 ** 53;
  const v = min + u * (max - min);
  return v < max ? v : min; // guard against rounding up to max
}

export function coin(src) {
  return below(src, 2) === 0 ? "heads" : "tails";
}

export function pick(src, options) {
  requireList("options", options);
  return options[below(src, options.length)];
}

// Fisher-Yates.
export function shuffle(src, items) {
  requireList("items", items, 0);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = below(src, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// k distinct items, in random order.
export function sample(src, items, k) {
  requireList("items", items);
  requireInt("k", k);
  if (k < 0 || k > items.length) throw new RandomError("k must be between 0 and the number of items");
  const pool = [...items];
  for (let i = 0; i < k; i++) {
    const j = i + below(src, pool.length - i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, k);
}

export function weighted(src, options, weights) {
  requireList("options", options);
  if (!Array.isArray(weights) || weights.length !== options.length) {
    throw new RandomError("weights must have the same length as options");
  }
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) {
    throw new RandomError("weights must be finite and >= 0");
  }
  const total = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0)) throw new RandomError("weights must not all be zero");
  // Integer weights are sampled exactly; others fall back to a 53-bit float.
  if (weights.every(Number.isSafeInteger) && Number.isSafeInteger(total)) {
    let r = below(src, total);
    for (let i = 0; i < options.length; i++) {
      if ((r -= weights[i]) < 0) return options[i];
    }
  }
  let r = randFloat(src, 0, total);
  for (let i = 0; i < options.length; i++) {
    if ((r -= weights[i]) < 0 && weights[i] > 0) return options[i];
  }
  return options[weights.findLastIndex((w) => w > 0)];
}

export function dice(src, count = 1, sides = 6) {
  requireInt("count", count);
  requireInt("sides", sides);
  if (count < 1 || count > 1000) throw new RandomError("count must be 1..1000");
  if (sides < 2) throw new RandomError("sides must be >= 2");
  const rolls = Array.from({ length: count }, () => 1 + below(src, sides));
  return { rolls, total: rolls.reduce((a, b) => a + b, 0) };
}

export function uuid(src) {
  if (src.kind === "system") return randomUUID();
  const b = Buffer.from(src.bytes(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// --- Receipts --------------------------------------------------------------
// Every result is wrapped with an id, timestamp and source. Given a secret
// (RANDOLLM_SECRET), the receipt is HMAC-signed so results can be audited later.

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sign(body, secret) {
  return createHmac("sha256", secret).update(canonical(body)).digest("hex");
}

export function receipt(op, params, result, src, secret) {
  const body = {
    id: randomUUID(),
    op,
    params,
    result,
    source: src.kind,
    timestamp: new Date().toISOString(),
  };
  return secret ? { ...body, signature: sign(body, secret) } : body;
}

export function verify(signed, secret) {
  if (!secret || typeof signed?.signature !== "string") return false;
  const { signature, ...body } = signed;
  const expected = Buffer.from(sign(body, secret), "hex");
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// --- Operation table shared by the MCP server and the HTTP API --------------

export const operations = {
  int: (src, p) => randInt(src, p.min ?? 1, p.max ?? 100),
  float: (src, p) => randFloat(src, p.min ?? 0, p.max ?? 1),
  coin: (src) => coin(src),
  pick: (src, p) => pick(src, p.options),
  shuffle: (src, p) => shuffle(src, p.items),
  sample: (src, p) => sample(src, p.items, p.k),
  weighted: (src, p) => weighted(src, p.options, p.weights),
  dice: (src, p) => dice(src, p.count ?? 1, p.sides ?? 6),
  uuid: (src) => uuid(src),
};

export function run(op, params = {}, { secret } = {}) {
  const fn = Object.hasOwn(operations, op) && operations[op];
  if (!fn) throw new RandomError(`unknown operation: ${op}`);
  const { seed, ...rest } = params;
  const src = makeSource(seed);
  return receipt(op, seed === undefined ? rest : { ...rest, seed }, fn(src, rest), src, secret);
}
