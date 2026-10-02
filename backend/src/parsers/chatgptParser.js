const cheerio = require("cheerio");
const { AppError } = require("../utils/validation");
const { ERROR_CODES, ROLES, PLATFORMS } = require("../utils/constants");
const { createDiagnostics, logDiagnostics } = require("../utils/diagnostics");
const { decodeTurboStreamText } = require("./turboStreamDecoder");
const debug = require("./chatgptStructuralDebug");

const REACT_ROUTER_MARKER = "streamController.enqueue(";
const NEXT_FLIGHT_MARKER = "self.__next_f.push(";

// ---------------------------------------------------------------------------
// Message normalization (shared by every strategy)
// ---------------------------------------------------------------------------

// Content types that are model/system context rather than visible chat.
const SKIPPED_CONTENT_TYPES = new Set([
  "model_editable_context",
  "user_editable_context",
  "thoughts",
  "reasoning_recap",
  "system_error",
]);

/**
 * Extracts visible text from a message `content` value without assuming it
 * is always `content.parts[0]`: a plain string, `parts` made of strings
 * and/or `{ text }` objects (non-text parts such as image pointers are
 * ignored), or a bare `content.text`. Text is returned untouched, so
 * Markdown, code fences, tables, LaTeX and line breaks survive.
 */
function extractContentText(content) {
  if (typeof content === "string") return content;
  if (!content || typeof content !== "object") return "";
  if (SKIPPED_CONTENT_TYPES.has(content.content_type)) return "";

  if (Array.isArray(content.parts)) {
    const texts = [];
    for (const part of content.parts) {
      if (typeof part === "string") {
        if (part) texts.push(part);
      } else if (part && typeof part === "object" && typeof part.text === "string" && part.text) {
        texts.push(part.text);
      }
    }
    return texts.join("\n\n");
  }

  if (typeof content.text === "string") return content.text;
  return "";
}

/** Messages ChatGPT itself hides, or that are addressed to a tool rather than the reader. */
function isNonVisibleMessage(message) {
  if (message.metadata && message.metadata.is_visually_hidden_from_conversation === true) return true;
  if (typeof message.recipient === "string" && message.recipient !== "all") return true;
  return false;
}

function safeIsoDate(epochSeconds) {
  try {
    const d = new Date(epochSeconds * 1000);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  } catch (err) {
    return null;
  }
}

/** Returns { role, text, timestamp } for a visible user/assistant message, else null. */
function normalizeMessageNode(messageNode, fallbackRole) {
  if (!messageNode || typeof messageNode !== "object") return null;

  const author = messageNode.author && typeof messageNode.author === "object" ? messageNode.author : messageNode;
  const roleRaw = String(author.role || messageNode.role || fallbackRole || "").toLowerCase();
  if (roleRaw !== "user" && roleRaw !== "assistant") return null;
  if (isNonVisibleMessage(messageNode)) return null;

  const text = extractContentText(messageNode.content ?? messageNode.text).trim();
  if (!text) return null;

  return {
    role: roleRaw === "user" ? ROLES.USER : ROLES.ASSISTANT,
    text,
    timestamp: messageNode.create_time ? safeIsoDate(messageNode.create_time) : null,
  };
}

function toNormalizedMessages(nodes) {
  const messages = [];
  let counter = 1;
  for (const n of nodes) {
    if (!n) continue;
    messages.push({
      id: String(counter++),
      role: n.role,
      sender: n.role === ROLES.USER ? "User" : "ChatGPT",
      content: n.text,
      timestamp: n.timestamp,
    });
  }
  return messages;
}

/**
 * Normalizes a `linear_conversation` array (or any array of message-like
 * items) from an already fully decoded object tree. An item may be a
 * `{ message: {...} }` wrapper or the message object itself.
 */
function normalizeLinearConversation(linear) {
  return toNormalizedMessages(
    linear.map((item) => {
      if (!item || typeof item !== "object") return null;
      const node = item.message && typeof item.message === "object" ? item.message : item;
      return normalizeMessageNode(node, item.role);
    })
  );
}

/** Converts a `mapping` tree (node-id -> { message, parent, children }) into ordered messages. */
function mappingToMessages(mapping) {
  const nodes = Object.values(mapping);
  nodes.sort((a, b) => (a?.message?.create_time ?? 0) - (b?.message?.create_time ?? 0));
  return toNormalizedMessages(nodes.map((node) => normalizeMessageNode(node && node.message)));
}

// ---------------------------------------------------------------------------
// Strategy 1 (legacy): __NEXT_DATA__ JSON blob with a `mapping` tree.
// ---------------------------------------------------------------------------

function tryExtractFromNextData($) {
  const script = $("#__NEXT_DATA__").first();
  if (!script.length) return null;

  let json;
  try {
    json = JSON.parse(script.contents().text());
  } catch (err) {
    return null;
  }

  const visited = new Set();
  const queue = [json];

  while (queue.length) {
    const node = queue.shift();
    if (!node || typeof node !== "object" || visited.has(node)) continue;
    visited.add(node);

    if (node.mapping && typeof node.mapping === "object") {
      const messages = mappingToMessages(node.mapping);
      if (messages.length > 0) return { title: node.title || null, messages };
    }

    for (const key of Object.keys(node)) {
      const val = node[key];
      if (val && typeof val === "object") queue.push(val);
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Strategy 2 (current ChatGPT share pages): React Router turbo-stream.
//
// The page inlines calls of the form
//     window.__reactRouterContext.streamController.enqueue("<json string>")
// The browser concatenates the chunks, splits on "\n", and decodes the
// first line as a flat slot table (see turboStreamDecoder.js). Steps here:
//   1. pull each enqueue() string literal out of the inline scripts,
//   2. concatenate them in document order (records may span chunks),
//   3. decode the table into a normal object graph,
//   4. search the WHOLE graph structurally for the conversation.
// ---------------------------------------------------------------------------

/**
 * Parses one JS string literal ("..." '...' or `...`) starting exactly at
 * `startIndex`, decoding standard escape sequences. React Router emits the
 * chunk with JSON.stringify (plus \u003c-style HTML escaping), which this
 * handles. Returns { value, endIndex } or null when unterminated.
 */
function parseJsStringLiteral(text, startIndex) {
  const quoteChar = text[startIndex];
  if (quoteChar !== '"' && quoteChar !== "'" && quoteChar !== "`") return null;

  let i = startIndex + 1;
  let out = "";

  while (i < text.length) {
    const ch = text[i];

    if (ch === "\\") {
      const next = text[i + 1];
      switch (next) {
        case "n": out += "\n"; i += 2; break;
        case "r": out += "\r"; i += 2; break;
        case "t": out += "\t"; i += 2; break;
        case "b": out += "\b"; i += 2; break;
        case "f": out += "\f"; i += 2; break;
        case "v": out += "\v"; i += 2; break;
        case "0": out += "\0"; i += 2; break;
        case "\\": out += "\\"; i += 2; break;
        case "'": out += "'"; i += 2; break;
        case '"': out += '"'; i += 2; break;
        case "`": out += "`"; i += 2; break;
        case "\n": i += 2; break; // line continuation
        case "\r":
          i += 2;
          if (text[i] === "\n") i += 1;
          break;
        case "x": {
          out += String.fromCharCode(parseInt(text.slice(i + 2, i + 4), 16));
          i += 4;
          break;
        }
        case "u": {
          if (text[i + 2] === "{") {
            const end = text.indexOf("}", i + 3);
            if (end === -1) return null;
            out += String.fromCodePoint(parseInt(text.slice(i + 3, end), 16));
            i = end + 1;
          } else {
            out += String.fromCharCode(parseInt(text.slice(i + 2, i + 6), 16));
            i += 6;
          }
          break;
        }
        default:
          out += next;
          i += 2;
      }
      continue;
    }

    if (ch === quoteChar) return { value: out, endIndex: i + 1 };

    out += ch;
    i += 1;
  }

  return null; // unterminated / truncated
}

/** Finds the next string literal within `maxLookahead` chars (e.g. inside `new TextEncoder().encode("...")`). */
function findAndParseNextStringLiteral(text, fromIndex, maxLookahead) {
  const limit = Math.min(text.length, fromIndex + maxLookahead);
  for (let i = fromIndex; i < limit; i++) {
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const result = parseJsStringLiteral(text, i);
      if (result) return result;
    }
  }
  return null;
}

/**
 * Collects every `marker(...)` string-literal argument from inline
 * <script> tags in document (= stream) order. `argKinds` records what the
 * argument actually was (string / array / template / other) so a page that
 * doesn't pass a plain string is visible in diagnostics instead of silent.
 */
function collectStreamedChunks($, marker, maxLookahead) {
  const chunks = [];
  const argKinds = { string: 0, array: 0, template: 0, other: 0 };
  let occurrences = 0;

  $("script").each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw || raw.indexOf(marker) === -1) return;

    let searchFrom = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const markerIdx = raw.indexOf(marker, searchFrom);
      if (markerIdx === -1) break;
      occurrences++;

      const argStart = markerIdx + marker.length;
      let k = argStart;
      while (k < raw.length && /\s/.test(raw[k])) k++;
      const first = raw[k];
      if (first === '"' || first === "'") argKinds.string++;
      else if (first === "`") argKinds.template++;
      else if (first === "[") argKinds.array++;
      else argKinds.other++;

      const literal = findAndParseNextStringLiteral(raw, argStart, maxLookahead);
      if (literal) {
        chunks.push(literal.value);
        searchFrom = literal.endIndex;
      } else {
        searchFrom = argStart + 1;
      }
    }
  });

  return { chunks, occurrences, argKinds };
}

function isMessageLike(obj) {
  return Boolean(
    obj &&
      typeof obj === "object" &&
      !Array.isArray(obj) &&
      obj.author &&
      typeof obj.author === "object" &&
      typeof obj.author.role === "string" &&
      "content" in obj
  );
}

function isMessageLikeItem(item) {
  return isMessageLike(item) || (item && typeof item === "object" && isMessageLike(item.message));
}

/**
 * Walks the ENTIRE decoded graph (iteratively, cycle-safe) and gathers
 * structural conversation candidates - by shape, not by one fixed path:
 *   - an object with a non-empty `linear_conversation` array,
 *   - an object with a non-empty `mapping` object,
 *   - any other array made mostly of message-like items.
 * Also returns counts and (optionally) an object-key inventory.
 */
function analyzeDecodedGraph(root, { collectKeys = false, collectTextValues = false } = {}) {
  const candidates = [];
  const counts = {
    objectsWithLinearConversation: 0,
    objectsWithMapping: 0,
    messageCandidates: 0,
    messageArrayCandidates: 0,
    nodesVisited: 0,
  };
  const keyCounts = collectKeys ? new Map() : null;
  // Defense-in-depth for the debug report's leak guard: every string value
  // seen anywhere in the graph, INCLUDING inside messages that get
  // correctly filtered out of the final visible conversation (hidden
  // messages, tool calls, user context). The leak guard can only scrub
  // text it knows about, and it must know about this even though such
  // text never reaches `extracted.messages`.
  const textValues = collectTextValues ? new Set() : null;
  const MAX_TEXT_VALUES = 2000;
  const visited = new Set();
  const claimedArrays = new Set();
  const stack = [{ value: root, inheritedTitle: null, depth: 0 }];

  while (stack.length) {
    const { value, inheritedTitle, depth } = stack.pop();
    if (!value || typeof value !== "object" || visited.has(value) || depth > 80) continue;
    if (value instanceof Date || value instanceof Error) continue;
    visited.add(value);
    counts.nodesVisited++;

    if (Array.isArray(value)) {
      if (!claimedArrays.has(value)) {
        const messageLikeCount = value.filter(isMessageLikeItem).length;
        if (messageLikeCount >= 1 && messageLikeCount >= value.length * 0.5) {
          candidates.push({ kind: "message_array", data: value, title: inheritedTitle });
          counts.messageArrayCandidates++;
        }
      }
      for (const child of value) {
        if (child && typeof child === "object") {
          stack.push({ value: child, inheritedTitle, depth: depth + 1 });
        } else if (textValues && typeof child === "string" && child.length >= 6 && textValues.size < MAX_TEXT_VALUES) {
          textValues.add(child);
        }
      }
      continue;
    }

    const title = typeof value.title === "string" ? value.title : inheritedTitle;

    if (Array.isArray(value.linear_conversation) && value.linear_conversation.length > 0) {
      counts.objectsWithLinearConversation++;
      claimedArrays.add(value.linear_conversation);
      candidates.push({ kind: "linear_conversation", data: value.linear_conversation, title });
    }

    if (
      value.mapping &&
      typeof value.mapping === "object" &&
      !Array.isArray(value.mapping) &&
      Object.keys(value.mapping).length > 0
    ) {
      counts.objectsWithMapping++;
      candidates.push({ kind: "mapping", data: value.mapping, title });
    }

    if (isMessageLike(value)) counts.messageCandidates++;

    for (const key of Object.keys(value)) {
      if (keyCounts) keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
      const child = value[key];
      if (child && typeof child === "object") {
        stack.push({ value: child, inheritedTitle: title, depth: depth + 1 });
      } else if (textValues && typeof child === "string" && child.length >= 6 && textValues.size < MAX_TEXT_VALUES) {
        textValues.add(child);
      }
    }
  }

  return { candidates, counts, keyCounts, textValues };
}

/** Back-compat helper: just the candidate list. */
function findConversationCandidates(root) {
  return analyzeDecodedGraph(root).candidates;
}

const KIND_PRIORITY = { linear_conversation: 3, mapping: 2, message_array: 1 };

function candidateToMessages(candidate) {
  return candidate.kind === "mapping" ? mappingToMessages(candidate.data) : normalizeLinearConversation(candidate.data);
}

/**
 * Decodes the React Router stream and returns { title, messages } or null.
 * Populates `diag` (numbers/labels only) and, when given, `sink` (heavier
 * structural material for the opt-in debug report).
 */
function tryExtractFromStreamingPayload($, diag, sink) {
  const reactRouter = collectStreamedChunks($, REACT_ROUTER_MARKER, 80);
  const pushCount = debug.computePageStats($, { reactRouter: REACT_ROUTER_MARKER, nextFlight: NEXT_FLIGHT_MARKER })
    .nextFPushCount;

  diag.enqueueOccurrences = reactRouter.occurrences;
  diag.pushOccurrences = pushCount;
  diag.extractedStringLiterals = reactRouter.chunks.length;
  diag.enqueueArgumentKinds = reactRouter.argKinds;
  if (sink) {
    sink.chunks = reactRouter.chunks;
    sink.argKinds = reactRouter.argKinds;
  }

  if (reactRouter.chunks.length === 0) {
    // A Next.js Flight page (self.__next_f.push) is a different, unsupported
    // wire format - report it honestly rather than pretending to decode it.
    if (pushCount > 0) diag.DETECTED_PAYLOAD_TYPE = "next_flight_unsupported";
    return null;
  }

  diag.DETECTED_PAYLOAD_TYPE = "react_router_stream";
  diag.PARSE_STAGE = "decoding_turbo_stream";

  // Reconstruct the stream the way the browser does: raw concatenation.
  const joinedText = reactRouter.chunks.join("");
  if (sink) sink.joinedText = joinedText;

  let decoded;
  try {
    decoded = decodeTurboStreamText(joinedText);
  } catch (err) {
    diag.decode = { threw: true };
    return null;
  }

  diag.decode = decoded.stats;
  if (sink) sink.decodeStats = decoded.stats;
  if (!decoded.stats.rootLineFound) return null;

  diag.PARSE_STAGE = "searching_decoded_graph";

  const graphCounts = {
    objectsWithLinearConversation: 0,
    objectsWithMapping: 0,
    messageCandidates: 0,
    messageArrayCandidates: 0,
    nodesVisited: 0,
  };
  const keyCounts = sink ? new Map() : null;
  const allTextValues = sink ? new Set() : null;
  const candidates = [];

  for (const rootValue of [decoded.root, ...decoded.deferredValues]) {
    if (rootValue === null || rootValue === undefined) continue;
    const analysis = analyzeDecodedGraph(rootValue, { collectKeys: Boolean(sink), collectTextValues: Boolean(sink) });
    candidates.push(...analysis.candidates);
    for (const k of Object.keys(graphCounts)) graphCounts[k] += analysis.counts[k];
    if (keyCounts && analysis.keyCounts) {
      for (const [k, n] of analysis.keyCounts) keyCounts.set(k, (keyCounts.get(k) || 0) + n);
    }
    if (allTextValues && analysis.textValues) {
      for (const t of analysis.textValues) allTextValues.add(t);
    }
  }

  const totals = {
    all: candidates.length,
    linear: candidates.filter((c) => c.kind === "linear_conversation").length,
    mapping: candidates.filter((c) => c.kind === "mapping").length,
    messageArray: candidates.filter((c) => c.kind === "message_array").length,
  };

  diag.graph = graphCounts;
  diag.candidates = totals;
  if (sink) {
    sink.graphCounts = graphCounts;
    sink.candidateTotals = totals;
    sink.keyCounts = keyCounts;
    sink.allTextValues = allTextValues;
  }

  // Pick the candidate that yields the most visible messages.
  let best = null;
  for (const candidate of candidates) {
    const messages = candidateToMessages(candidate);
    if (messages.length === 0) continue;
    const better =
      !best ||
      messages.length > best.messages.length ||
      (messages.length === best.messages.length && KIND_PRIORITY[candidate.kind] > KIND_PRIORITY[best.candidate.kind]);
    if (better) best = { candidate, messages };
  }

  if (!best) return null;

  diag.PARSE_STAGE = "found_conversation_container";
  if (sink) {
    const firstItem = Array.isArray(best.candidate.data)
      ? best.candidate.data[0]
      : Object.values(best.candidate.data)[0];
    sink.selected = {
      kind: best.candidate.kind,
      itemCount: Array.isArray(best.candidate.data) ? best.candidate.data.length : Object.keys(best.candidate.data).length,
      itemShape: debug.shapeOf(firstItem),
    };
  }

  return { title: best.candidate.title, messages: best.messages };
}

// ---------------------------------------------------------------------------
// Strategy 3 (legacy fallback): elements carrying data-message-author-role.
// ---------------------------------------------------------------------------

function tryExtractFromDom($) {
  const nodes = $("[data-message-author-role]");
  if (!nodes.length) return null;

  const normalized = [];
  nodes.each((_, el) => {
    const role = $(el).attr("data-message-author-role");
    if (role !== "user" && role !== "assistant") return;
    const text = $(el).text().trim();
    if (!text) return;
    normalized.push({ role: role === "user" ? ROLES.USER : ROLES.ASSISTANT, text, timestamp: null });
  });

  const messages = toNormalizedMessages(normalized);
  return messages.length ? { title: $("title").first().text() || null, messages } : null;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function stripChatgptPrefix(title) {
  return typeof title === "string" ? title.replace(/^\s*ChatGPT\s*[-\u2013\u2014:]\s*/i, "").trim() : title;
}

function finishStructuralDebug({ html, $, diag, sink, outcome, extracted }) {
  const report = debug.buildStructuralReport({
    html,
    $,
    diag,
    sink,
    outcome,
    markers: { reactRouter: REACT_ROUTER_MARKER, nextFlight: NEXT_FLIGHT_MARKER },
  });
  if (extracted) report.extractedMessageCount = extracted.messages.length;

  // Secrets checked by the leak guard include every text value seen
  // ANYWHERE in the decoded graph (sink.allTextValues) - not just the
  // final visible messages - so content from hidden/tool/system turns
  // that was correctly excluded from the conversation still can't slip
  // through in a "redacted" preview if redaction ever regresses.
  const secrets = extracted ? [extracted.title, ...extracted.messages.map((m) => m.content)] : [];
  if (sink && sink.allTextValues) secrets.push(...sink.allTextValues);
  const safeReport = debug.applyLeakGuard(report, secrets);
  const file = debug.writeStructuralArtifact(safeReport);

  // eslint-disable-next-line no-console
  console.error("[chat2pdf] structural debug report written:", file || "(write failed)", JSON.stringify({
    outcome,
    payloadType: safeReport.payloadType,
    slotCount: safeReport.slotCount,
    integerReferenceCount: safeReport.integerReferenceCount,
    unresolvedReferenceCount: safeReport.unresolvedReferenceCount,
    conversationCandidatesFound: safeReport.conversationCandidatesFound,
    extractedMessageCount: safeReport.extractedMessageCount,
    leakGuardTriggered: safeReport.leakGuardTriggered,
  }));
}

function parseChatgptHtml(html, sourceUrl, diagnostics) {
  const diag = diagnostics || createDiagnostics(sourceUrl);
  const $ = cheerio.load(html);

  if (diag.HTML_LENGTH == null) diag.HTML_LENGTH = html.length;

  const debugOn = debug.isStructuralDebugEnabled(diag);
  const sink = debugOn ? {} : null;

  const pageTitle = $("title").first().text() || "";
  const ogTitle =
    $('meta[property="og:title"]').attr("content") || $('meta[name="og:title"]').attr("content") || null;

  diag.PARSE_STAGE = "searching_next_data";
  let extracted = tryExtractFromNextData($);
  if (extracted) diag.DETECTED_PAYLOAD_TYPE = "next_data";

  if (!extracted) {
    diag.PARSE_STAGE = "searching_stream_payload";
    extracted = tryExtractFromStreamingPayload($, diag, sink);
  }

  if (!extracted) {
    diag.PARSE_STAGE = "searching_dom";
    extracted = tryExtractFromDom($);
    if (extracted) diag.DETECTED_PAYLOAD_TYPE = "dom_data_attr";
  }

  if (!extracted || extracted.messages.length === 0) {
    diag.FINAL_STAGE_REACHED = diag.PARSE_STAGE; // preserved, unlike PARSE_STAGE below
    diag.PARSE_STAGE = "failed";

    const looksLikeLoginWall =
      /log ?in|sign ?in|authentication required/i.test(pageTitle) && diag.DETECTED_PAYLOAD_TYPE === "unknown";

    logDiagnostics("chatgptParser: extraction failed", diag, { looksLikeLoginWall });
    if (debugOn) finishStructuralDebug({ html, $, diag, sink, outcome: "failed", extracted: null });

    const err = looksLikeLoginWall
      ? new AppError(
          ERROR_CODES.NOT_PUBLIC,
          "This conversation cannot be accessed automatically. Please use a publicly accessible/shared conversation link."
        )
      : new AppError(
          ERROR_CODES.UNRELIABLE_EXTRACTION,
          "We couldn't reliably identify a conversation on this ChatGPT page. The link may not be a public share link, or ChatGPT's page format has changed."
        );
    err.diagnostics = diag;
    throw err;
  }

  diag.PARSE_STAGE = "normalized";
  const title = extracted.title || stripChatgptPrefix(ogTitle) || stripChatgptPrefix(pageTitle) || "ChatGPT Conversation";
  if (sink) sink.extractedMessageCount = extracted.messages.length;
  if (debugOn) finishStructuralDebug({ html, $, diag, sink, outcome: "success", extracted: { title, messages: extracted.messages } });

  return {
    metadata: { platform: PLATFORMS.CHATGPT, title, url: sourceUrl, createdAt: null },
    messages: extracted.messages,
  };
}

module.exports = {
  parseChatgptHtml,
  // Exposed for focused unit testing only - not part of the public API.
  __internal: {
    parseJsStringLiteral,
    findAndParseNextStringLiteral,
    collectStreamedChunks,
    analyzeDecodedGraph,
    findConversationCandidates,
    normalizeLinearConversation,
    mappingToMessages,
    extractContentText,
    isNonVisibleMessage,
    tryExtractFromStreamingPayload,
    tryExtractFromNextData,
    tryExtractFromDom,
  },
};
