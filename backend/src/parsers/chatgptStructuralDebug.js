/**
 * Privacy-safe structural diagnostics for ChatGPT share pages.
 *
 * Purpose: when a real share page can be fetched (HTTP 200) but the
 * conversation can't be found, we need to see the SHAPE of what came back
 * without ever recording what the conversation says.
 *
 * What may appear in a report: counts, lengths, booleans, enum labels,
 * object KEY names (only identifier-like ones, see safeKey), value TYPES,
 * and previews in which every string literal has been replaced by a
 * length marker. What must never appear: message text, titles, cookies,
 * authorization headers, credentials, personal data. As a last line of
 * defence `applyLeakGuard` withholds every free-form section if any known
 * message/title text is found inside the serialized report.
 *
 * Only active when DEBUG_CHAT2PDF=true AND the source host is chatgpt.com
 * (see isStructuralDebugEnabled). Output goes to
 * backend/debug/chatgpt-structure.json (override: CHAT2PDF_DEBUG_DIR).
 */

const fs = require("fs");
const path = require("path");

const SAFE_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;
const CHATGPT_HOST = /(^|\.)(chatgpt\.com|chat\.openai\.com)$/i;

function isStructuralDebugEnabled(diag) {
  return process.env.DEBUG_CHAT2PDF === "true" && CHATGPT_HOST.test((diag && diag.SOURCE_HOST) || "");
}

function safeKey(key) {
  return SAFE_KEY.test(key) ? key : "<other>";
}

/**
 * Replaces the contents of every string literal ("...", '...', `...`) with
 * a length marker, keeping every other character. Scans only as far as
 * needed to fill `maxLength` output characters, so it is cheap on a
 * multi-hundred-KB script. An unterminated literal is redacted too - it
 * never leaks its partial content.
 */
function redactStreamExpression(raw, maxLength = 400) {
  let out = "";
  let i = 0;

  while (i < raw.length && out.length < maxLength) {
    const ch = raw[i];

    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      let closed = false;
      while (j < raw.length) {
        if (raw[j] === "\\") {
          j += 2;
          continue;
        }
        if (raw[j] === ch) {
          closed = true;
          break;
        }
        j++;
      }
      const consumed = Math.min(j, raw.length) - (i + 1);
      out += `${ch}<redacted:${consumed}${closed ? "" : ",unterminated"}>${ch}`;
      i = closed ? j + 1 : raw.length;
      continue;
    }

    out += ch;
    i++;
  }

  return i < raw.length || out.length > maxLength ? out.slice(0, maxLength) + "...(truncated)" : out;
}

/** Type-only description of a value: keys are kept (if identifier-like), values never are. */
function shapeOf(value, depth = 0) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (value instanceof Date) return "date";
  const type = typeof value;
  if (type !== "object") return type; // string | number | boolean | bigint ...

  if (Array.isArray(value)) {
    if (depth >= 5) return `array(${value.length})`;
    return { "<array>": value.length, item: value.length ? shapeOf(value[0], depth + 1) : null };
  }

  if (depth >= 5) return "object";
  const out = {};
  let count = 0;
  for (const key of Object.keys(value)) {
    if (count++ >= 40) {
      out["<more-keys>"] = true;
      break;
    }
    out[safeKey(key)] = shapeOf(value[key], depth + 1);
  }
  return out;
}

function countOccurrences(haystack, needle) {
  if (!haystack) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

/** Script-tag level facts about the raw HTML (no content). */
function computePageStats($, markers) {
  let scriptTagCount = 0;
  let enqueueCount = 0;
  let nextFPushCount = 0;
  const relevantScriptLengths = [];

  $("script").each((_, el) => {
    scriptTagCount++;
    const raw = $(el).contents().text() || "";
    const enq = countOccurrences(raw, markers.reactRouter);
    const push = countOccurrences(raw, markers.nextFlight);
    enqueueCount += enq;
    nextFPushCount += push;
    if (enq || push) relevantScriptLengths.push(raw.length);
  });

  return { scriptTagCount, enqueueCount, nextFPushCount, relevantScriptLengths: relevantScriptLengths.slice(0, 30) };
}

function topKeys(keyCounts, limit = 80) {
  if (!keyCounts) return null;
  return [...keyCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .reduce((acc, [key, n]) => {
      acc[safeKey(key)] = (acc[safeKey(key)] || 0) + n;
      return acc;
    }, {});
}

/**
 * Assembles the flat structural report. `sink` is filled in by the parser
 * as it runs (see tryExtractFromStreamingPayload); every field is optional
 * because extraction can fail at any stage.
 */
function buildStructuralReport({ html, $, diag, sink, outcome, markers }) {
  const page = computePageStats($, markers);
  const chunks = (sink && sink.chunks) || [];
  const decode = (sink && sink.decodeStats) || {};
  const graph = (sink && sink.graphCounts) || {};
  const joined = (sink && sink.joinedText) || "";
  const lines = joined ? joined.split("\n") : [];

  // IMPORTANT: a chunk boundary can land in the middle of a string or an
  // escape sequence (enqueue() calls split the stream at arbitrary byte
  // offsets, not at JSON-token boundaries), so redacting each raw chunk
  // independently would start each fragment's quote-tracking state machine
  // from "outside a string" even when it is really midway through one -
  // that desync can let private content leak through unredacted. The fix
  // is to redact the FULLY REASSEMBLED stream text in one continuous pass
  // (correct state throughout), and only slice preview windows out of the
  // result afterward, once it is already safe.
  // Infinity, not joined.length: the redacted placeholder (e.g.
  // "<redacted:0>") can be LONGER than the string it replaces, so capping
  // the output length at the INPUT length can stop the pass early and
  // mark it "...(truncated)" before the input is actually fully consumed.
  // That's still privacy-safe (everything already emitted is redacted),
  // but it isn't actually "the whole thing", which is what a correctness
  // check - and a useful end-of-stream preview window - both need.
  const redactedFull = joined ? redactStreamExpression(joined, Infinity) : "";
  const previewWindowSize = 400;
  const redactedPreviews = [];
  if (redactedFull) {
    redactedPreviews.push(redactedFull.slice(0, previewWindowSize));
    if (redactedFull.length > previewWindowSize * 2) {
      const mid = Math.floor(redactedFull.length / 2);
      redactedPreviews.push(redactedFull.slice(mid, mid + previewWindowSize));
    }
    if (redactedFull.length > previewWindowSize) {
      redactedPreviews.push(redactedFull.slice(-previewWindowSize));
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    sourceHost: diag.SOURCE_HOST,
    outcome,
    parseStage: diag.PARSE_STAGE,
    finalStageReached: diag.FINAL_STAGE_REACHED || null,
    payloadType: diag.DETECTED_PAYLOAD_TYPE,

    htmlLength: html.length,
    scriptTagCount: page.scriptTagCount,
    relevantScriptLengths: page.relevantScriptLengths,
    enqueueCount: page.enqueueCount,
    nextFPushCount: page.nextFPushCount,

    enqueueArgumentKinds: (sink && sink.argKinds) || {},
    extractedStringLiterals: chunks.length,
    chunkLengths: chunks.slice(0, 30).map((c) => c.length),
    extractedLines: lines.filter((l) => l.length > 0).length,
    linesMatchingIntColonValue: lines.filter((l) => /^\d+:/.test(l)).length,
    linesMatchingDeferredPrefix: lines.filter((l) => /^[PE]\d+:/.test(l)).length,
    firstLineStartsWith: lines.length ? lines[0].slice(0, 1) : null,

    jsonParseSuccesses: decode.jsonParseSuccesses ?? 0,
    jsonParseFailures: decode.jsonParseFailures ?? 0,
    slotCount: decode.slotsCreated ?? 0,
    slotIndexMin: decode.slotIndexMin ?? null,
    slotIndexMax: decode.slotIndexMax ?? null,
    integerReferenceCount: decode.integerReferences ?? 0,
    resolvedReferenceCount: decode.resolvedReferences ?? 0,
    unresolvedReferenceCount: decode.unresolvedReferences ?? 0,
    sentinelReferenceCount: decode.sentinelReferences ?? 0,
    memoHitCount: decode.memoHits ?? 0,
    promiseSlotCount: decode.promiseSlots ?? 0,
    deferredLineCount: decode.deferredLinesFound ?? 0,

    objectsWithLinearConversation: graph.objectsWithLinearConversation ?? 0,
    objectsWithMapping: graph.objectsWithMapping ?? 0,
    conversationCandidatesFound: (sink && sink.candidateTotals && sink.candidateTotals.all) ?? 0,
    linearConversationCandidates: (sink && sink.candidateTotals && sink.candidateTotals.linear) ?? 0,
    mappingCandidates: (sink && sink.candidateTotals && sink.candidateTotals.mapping) ?? 0,
    messageArrayCandidates: (sink && sink.candidateTotals && sink.candidateTotals.messageArray) ?? 0,
    messageCandidates: graph.messageCandidates ?? 0,
    decodedNodesVisited: graph.nodesVisited ?? 0,

    selectedCandidateKind: (sink && sink.selected && sink.selected.kind) || null,
    selectedCandidateItemCount: (sink && sink.selected && sink.selected.itemCount) ?? null,
    extractedMessageCount: (sink && sink.extractedMessageCount) ?? 0,

    // Free-form sections (previews / names / shapes) - subject to the leak guard.
    // Built from the fully-redacted, correctly-reassembled stream (see above) -
    // never from individual raw chunks, which can split mid-string.
    redactedChunkPreviews: redactedPreviews,
    decodedKeyInventory: topKeys(sink && sink.keyCounts),
    selectedCandidateItemShape: (sink && sink.selected && sink.selected.itemShape) || null,
  };
}

const FREE_FORM_FIELDS = ["redactedChunkPreviews", "decodedKeyInventory", "selectedCandidateItemShape"];

/**
 * If any known private text (message bodies, title) appears anywhere in
 * the serialized report, withhold every free-form section and say so.
 * `secrets` shorter than 4 characters are ignored (they would match
 * ordinary key names by coincidence).
 */
function applyLeakGuard(report, secrets) {
  const serialized = JSON.stringify(report);
  const leaked = (secrets || []).some((s) => typeof s === "string" && s.length >= 4 && serialized.includes(s));
  if (!leaked) return { ...report, leakGuardTriggered: false };

  const cleaned = { ...report, leakGuardTriggered: true };
  for (const field of FREE_FORM_FIELDS) cleaned[field] = "withheld-by-leak-guard";
  return cleaned;
}

function debugDir() {
  return process.env.CHAT2PDF_DEBUG_DIR || path.join(__dirname, "..", "..", "debug");
}

function writeStructuralArtifact(report) {
  try {
    const dir = debugDir();
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "chatgpt-structure.json");
    fs.writeFileSync(file, JSON.stringify(report, null, 2));
    return file;
  } catch (err) {
    // Debug output must never break the request it is describing.
    // eslint-disable-next-line no-console
    console.error("[chat2pdf] could not write structural debug artifact:", err.message);
    return null;
  }
}

module.exports = {
  isStructuralDebugEnabled,
  redactStreamExpression,
  shapeOf,
  safeKey,
  countOccurrences,
  computePageStats,
  buildStructuralReport,
  applyLeakGuard,
  writeStructuralArtifact,
  debugDir,
};
