const test = require("node:test");
const assert = require("node:assert/strict");

const { redactStreamExpression, applyLeakGuard, shapeOf, safeKey } = require("../chatgptStructuralDebug");

test("redactStreamExpression hides ALL string contents (keys and values alike) but keeps structural characters", () => {
  // The function works on raw, unparsed text, so it has no way to tell a
  // devalue "key name" string apart from a value string - and erring
  // toward redacting too much (every quoted string, unconditionally) is
  // exactly the conservative behavior we want here.
  const raw = '[{"_1":2},"title","My Secret Title",{"_3":4},"linear_conversation",[5]]';
  const redacted = redactStreamExpression(raw, Infinity);

  assert.doesNotMatch(redacted, /My Secret Title/);
  assert.doesNotMatch(redacted, /linear_conversation/);
  assert.match(redacted, /\[5\]/); // non-string structural content survives
  assert.match(redacted, /<redacted:\d+>/);
});

test("REGRESSION: redacting the full reassembled stream survives a split that lands mid-string", () => {
  // This reproduces the exact bug found during live-page debugging: a
  // conversation line gets delivered across multiple enqueue() calls, and
  // the split point falls in the middle of a string value. Redacting each
  // fragment independently desyncs the in-string/out-of-string state and
  // lets the tail of the string leak through unredacted. Redacting the
  // full, reassembled text in one pass must not have this problem.
  const secretText = "PRIVATE-PROFILE-SHOULD-NEVER-EXPORT";
  const full = `[{"_1":2},"user_profile","${secretText}","_3",4]`;

  // Split at an arbitrary byte offset that lands inside the secret string.
  const cutPoint = full.indexOf(secretText) + 10;
  const fragmentA = full.slice(0, cutPoint);
  const fragmentB = full.slice(cutPoint);

  // The buggy approach: redact each fragment on its own.
  const buggyResult = redactStreamExpression(fragmentA, Infinity) + redactStreamExpression(fragmentB, Infinity);
  assert.match(buggyResult, new RegExp(secretText.slice(10)), "sanity check: demonstrates the bug exists in the naive approach");

  // The fixed approach: reassemble first, then redact the whole thing once.
  const reassembled = fragmentA + fragmentB;
  assert.equal(reassembled, full);
  const correctResult = redactStreamExpression(reassembled, Infinity);
  assert.doesNotMatch(correctResult, new RegExp(secretText));
  assert.doesNotMatch(correctResult, /PRIVATE-PROFILE/);
});

test("applyLeakGuard withholds free-form sections when a known secret appears in the report", () => {
  const report = {
    someCount: 3,
    redactedChunkPreviews: ["oops this contains MySecretValue123 somehow"],
    decodedKeyInventory: { a: 1 },
    selectedCandidateItemShape: { x: "string" },
  };

  const result = applyLeakGuard(report, ["MySecretValue123"]);
  assert.equal(result.leakGuardTriggered, true);
  assert.equal(result.redactedChunkPreviews, "withheld-by-leak-guard");
  assert.equal(result.decodedKeyInventory, "withheld-by-leak-guard");
  assert.equal(result.selectedCandidateItemShape, "withheld-by-leak-guard");
  assert.equal(result.someCount, 3); // non-free-form fields are untouched
});

test("applyLeakGuard passes through clean reports unchanged", () => {
  const report = { someCount: 3, redactedChunkPreviews: ["all clear"] };
  const result = applyLeakGuard(report, ["something-that-never-appears"]);
  assert.equal(result.leakGuardTriggered, false);
  assert.equal(result.redactedChunkPreviews[0], "all clear");
});

test("shapeOf never includes string/number VALUES, only types and identifier-like keys", () => {
  const shape = shapeOf({ title: "secret title text", count: 42, weird$key: "x", items: ["a", "b"] });
  const serialized = JSON.stringify(shape);
  assert.doesNotMatch(serialized, /secret title text/);
  assert.match(serialized, /"title":"string"/);
  assert.match(serialized, /"count":"number"/);
});

test("safeKey redacts non-identifier-like keys", () => {
  assert.equal(safeKey("normal_key"), "normal_key");
  assert.equal(safeKey("Some Secret Sentence Used As A Key"), "<other>");
});
