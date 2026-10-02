const test = require("node:test");
const assert = require("node:assert/strict");

const { encode } = require("turbo-stream"); // the REAL library, devDependency
const { decodeTurboStreamText } = require("../turboStreamDecoder");

async function encodeToText(value) {
  const reader = encode(value).getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  for (;;) {
    const { done, value: v } = await reader.read();
    if (done) break;
    chunks.push(typeof v === "string" ? v : decoder.decode(v));
  }
  return chunks.join("");
}

test("decodes primitives, repeated references, Dates, and undefined via the real encoder", async () => {
  const shared = { tag: "shared-object" };
  const value = {
    str: "hello",
    num: 1750000000.5,
    neg: -0,
    nil: null,
    missing: undefined,
    nan: NaN,
    inf: Infinity,
    negInf: -Infinity,
    when: new Date("2026-01-02T03:04:05.000Z"),
    a: shared,
    b: shared, // same object referenced twice - must decode to the SAME object
  };

  const text = await encodeToText(value);
  const { root, stats } = decodeTurboStreamText(text);

  assert.equal(root.str, "hello");
  assert.equal(root.num, 1750000000.5);
  assert.ok(Object.is(root.neg, -0));
  assert.equal(root.nil, null);
  assert.equal(root.missing, undefined);
  assert.ok(Number.isNaN(root.nan));
  assert.equal(root.inf, Infinity);
  assert.equal(root.negInf, -Infinity);
  assert.ok(root.when instanceof Date);
  assert.equal(root.when.toISOString(), "2026-01-02T03:04:05.000Z");
  assert.equal(root.a, root.b); // reference identity preserved
  assert.ok(stats.rootLineFound);
  assert.ok(stats.resolvedReferences > 0);
  assert.equal(stats.unresolvedReferences, 0);
});

test("decodes nested arrays/objects at depth with unicode and special characters intact", async () => {
  const value = {
    rows: [
      { name: "Row é 你好", tags: ["a", "b", { note: "quote \" and newline \n here" }] },
      { name: "Row 2", tags: [] },
    ],
  };

  const text = await encodeToText(value);
  const { root } = decodeTurboStreamText(text);

  assert.equal(root.rows.length, 2);
  assert.equal(root.rows[0].name, "Row é 你好");
  assert.equal(root.rows[0].tags[2].note, 'quote " and newline \n here');
  assert.deepEqual(root.rows[1].tags, []);
});

test("resolves a value delivered on a deferred (Promise) line", async () => {
  const value = {
    immediate: "now",
    later: Promise.resolve({ nested: ["async", "value"] }),
  };

  const text = await encodeToText(value);
  const { root, deferredValues, stats } = decodeTurboStreamText(text);

  assert.equal(root.immediate, "now");
  assert.ok(root.later && root.later.__type === "Promise");
  assert.equal(stats.promiseSlots, 1);
  assert.equal(stats.deferredLinesFound, 1);
  assert.equal(deferredValues.length, 1);
  assert.deepEqual(deferredValues[0], { nested: ["async", "value"] });
  // The placeholder itself is also updated once its line is decoded.
  assert.equal(root.later.pending, false);
  assert.deepEqual(root.later.resolved, { nested: ["async", "value"] });
});

test("malformed/truncated input fails closed instead of throwing", () => {
  const { root, stats } = decodeTurboStreamText("not valid json at all");
  assert.equal(root, null);
  assert.equal(stats.jsonParseFailures, 1);
  assert.equal(stats.rootLineFound, false);
});

test("out-of-range reference indices are reported as unresolved rather than throwing", () => {
  // Slot 0 is an object whose only property points at index 99, which does not exist.
  const { root, stats } = decodeTurboStreamText('[{"_1":99},"key"]');
  assert.equal(root.key, undefined);
  assert.equal(stats.unresolvedReferences, 1);
});
