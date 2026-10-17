import { test } from "node:test";
import assert from "node:assert/strict";
import * as r from "../src/random.js";

const sys = () => r.makeSource();

test("int stays in range and hits both ends", () => {
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const v = r.randInt(sys(), 1, 10);
    assert.ok(Number.isInteger(v) && v >= 1 && v <= 10);
    seen.add(v);
  }
  assert.equal(seen.size, 10);
  assert.equal(r.randInt(sys(), 5, 5), 5);
  const big = r.randInt(sys(), -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  assert.ok(Number.isSafeInteger(big));
});

test("int is roughly uniform (chi-square, 1..10)", () => {
  const n = 50_000;
  const counts = new Array(10).fill(0);
  for (let i = 0; i < n; i++) counts[r.randInt(sys(), 1, 10) - 1]++;
  const expected = n / 10;
  const chi2 = counts.reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
  assert.ok(chi2 < 30, `chi2=${chi2.toFixed(2)} counts=${counts}`); // df=9, p≈0.0004
});

test("float range", () => {
  for (let i = 0; i < 1000; i++) {
    const v = r.randFloat(sys(), -2, 3);
    assert.ok(v >= -2 && v < 3);
  }
});

test("seed makes every operation reproducible", () => {
  for (const op of Object.keys(r.operations)) {
    const params = {
      pick: { options: ["a", "b", "c"] },
      shuffle: { items: ["a", "b", "c", "d"] },
      sample: { items: ["a", "b", "c", "d"], k: 2 },
      weighted: { options: ["a", "b"], weights: [1, 3] },
    }[op] ?? {};
    const a = r.run(op, { ...params, seed: "test" });
    const b = r.run(op, { ...params, seed: "test" });
    assert.deepEqual(a.result, b.result, op);
    assert.equal(a.source, "seeded");
  }
});

test("shuffle and sample keep items intact", () => {
  const items = ["a", "b", "c", "d", "e"];
  assert.deepEqual([...r.shuffle(sys(), items)].sort(), items);
  const s = r.sample(sys(), items, 3);
  assert.equal(new Set(s).size, 3);
  assert.ok(s.every((x) => items.includes(x)));
  assert.deepEqual(r.shuffle(sys(), []), []);
});

test("weighted respects zero weights and proportions", () => {
  const counts = { a: 0, b: 0, c: 0 };
  for (let i = 0; i < 20_000; i++) counts[r.weighted(sys(), ["a", "b", "c"], [1, 0, 3])]++;
  assert.equal(counts.b, 0);
  const ratio = counts.c / counts.a;
  assert.ok(ratio > 2.7 && ratio < 3.3, `ratio=${ratio}`);
  for (let i = 0; i < 1000; i++) assert.notEqual(r.weighted(sys(), ["x", "y"], [0.5, 0]), "y");
});

test("dice and uuid", () => {
  const { rolls, total } = r.dice(sys(), 3, 6);
  assert.equal(rolls.length, 3);
  assert.equal(total, rolls.reduce((a, b) => a + b));
  const re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  assert.match(r.uuid(sys()), re);
  assert.match(r.uuid(r.makeSource("s")), re);
});

test("bad input throws RandomError", () => {
  assert.throws(() => r.randInt(sys(), 5, 1), r.RandomError);
  assert.throws(() => r.randInt(sys(), 1.5, 3), r.RandomError);
  assert.throws(() => r.pick(sys(), []), r.RandomError);
  assert.throws(() => r.sample(sys(), ["a"], 2), r.RandomError);
  assert.throws(() => r.weighted(sys(), ["a"], [0]), r.RandomError);
  assert.throws(() => r.weighted(sys(), ["a", "b"], [1]), r.RandomError);
  assert.throws(() => r.run("nope"), r.RandomError);
});

test("receipts are signed and verifiable when a secret is set", () => {
  const src = sys();
  const unsigned = r.receipt("coin", {}, "heads", src);
  assert.equal(unsigned.signature, undefined);

  const signed = r.receipt("int", { min: 1, max: 10 }, 7, src, "s3cret");
  assert.ok(r.verify(signed, "s3cret"));
  assert.ok(!r.verify(signed, "wrong"));
  assert.ok(!r.verify({ ...signed, result: 3 }, "s3cret"));
  assert.ok(!r.verify({ ...signed, params: { max: 10, min: 1, extra: 1 } }, "s3cret"));
});
