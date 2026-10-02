const cheerio = require("cheerio");
const { AppError } = require("../utils/validation");
const { ERROR_CODES, ROLES, PLATFORMS } = require("../utils/constants");

/**
 * Claude share pages embed a JSON state blob for the client app to
 * hydrate from (framework build data, e.g. a `<script>` tag holding
 * route/loader data). As with the ChatGPT parser, we walk any embedded
 * JSON defensively looking for a conversation-shaped array, and fall
 * back to DOM heuristics if that fails, since Anthropic can change the
 * exact bundling format at any time.
 */
function tryExtractFromEmbeddedJson($) {
  const candidates = [];

  $("script").each((_, el) => {
    const type = $(el).attr("type") || "";
    const id = $(el).attr("id") || "";
    if (
      type.includes("json") ||
      id.toLowerCase().includes("data") ||
      id.toLowerCase().includes("state")
    ) {
      candidates.push($(el).contents().text());
    }
  });

  for (const raw of candidates) {
    if (!raw || raw.length < 20) continue;
    let json;
    try {
      json = JSON.parse(raw);
    } catch (err) {
      continue;
    }

    const found = findMessageArray(json);
    if (found) return found;
  }

  return null;
}

/**
 * Breadth-first search for an array of objects that look like chat
 * messages (each having some text field and a role/sender-like field).
 */
function findMessageArray(root) {
  const visited = new Set();
  const queue = [root];

  while (queue.length) {
    const node = queue.shift();
    if (!node || typeof node !== "object" || visited.has(node)) continue;
    visited.add(node);

    if (Array.isArray(node) && node.length > 0 && looksLikeMessageArray(node)) {
      const messages = normalizeClaudeMessages(node);
      if (messages.length > 0) {
        return { title: null, messages };
      }
    }

    const children = Array.isArray(node) ? node : Object.values(node);
    for (const child of children) {
      if (child && typeof child === "object") queue.push(child);
    }
  }

  return null;
}

function looksLikeMessageArray(arr) {
  const sample = arr.slice(0, 3);
  return sample.every(
    (item) =>
      item &&
      typeof item === "object" &&
      (typeof item.text === "string" ||
        typeof item.content === "string" ||
        Array.isArray(item.content)) &&
      (item.sender || item.role || item.author)
  );
}

function normalizeClaudeMessages(arr) {
  const messages = [];
  let counter = 1;

  for (const item of arr) {
    const roleRaw = (item.sender || item.role || item.author || "").toString().toLowerCase();
    const role = roleRaw.includes("human") || roleRaw.includes("user") ? ROLES.USER : ROLES.ASSISTANT;

    let text = "";
    if (typeof item.text === "string") {
      text = item.text;
    } else if (typeof item.content === "string") {
      text = item.content;
    } else if (Array.isArray(item.content)) {
      text = item.content
        .map((c) => (typeof c === "string" ? c : c?.text || ""))
        .join("\n");
    }

    text = text.trim();
    if (!text) continue;

    messages.push({
      id: String(counter++),
      role,
      sender: role === ROLES.USER ? "User" : "Claude",
      content: text,
      timestamp: item.created_at || null,
    });
  }

  return messages;
}

/**
 * Fallback: DOM heuristic looking for Claude's known message-container
 * class naming conventions. This is inherently fragile since class names
 * are implementation details that change across deploys.
 */
function tryExtractFromDom($) {
  const humanNodes = $('[data-testid*="human" i], [class*="human-turn" i], [class*="user-message" i]');
  const assistantNodes = $('[data-testid*="assistant" i], [class*="claude-turn" i], [class*="assistant-message" i]');

  if (!humanNodes.length && !assistantNodes.length) return null;

  const all = [];
  humanNodes.each((_, el) => all.push({ role: ROLES.USER, el }));
  assistantNodes.each((_, el) => all.push({ role: ROLES.ASSISTANT, el }));

  // Preserve document order.
  all.sort((a, b) => {
    const pos = a.el.sourceCodeLocation?.startOffset ?? 0;
    const posB = b.el.sourceCodeLocation?.startOffset ?? 0;
    return pos - posB;
  });

  const messages = [];
  let counter = 1;
  for (const { role, el } of all) {
    const text = cheerio.load(el).root().text().trim();
    if (!text) continue;
    messages.push({
      id: String(counter++),
      role,
      sender: role === ROLES.USER ? "User" : "Claude",
      content: text,
      timestamp: null,
    });
  }

  return messages.length ? { title: null, messages } : null;
}

function parseClaudeHtml(html, sourceUrl) {
  const $ = cheerio.load(html);

  const pageTitle = $("title").first().text() || "";
  const looksLikeLoginWall = /log ?in|sign ?in/i.test(pageTitle);

  const extracted = tryExtractFromEmbeddedJson($) || tryExtractFromDom($);

  if (!extracted || extracted.messages.length === 0) {
    if (looksLikeLoginWall) {
      throw new AppError(
        ERROR_CODES.NOT_PUBLIC,
        "This conversation cannot be accessed automatically. Please use a publicly accessible/shared conversation link."
      );
    }
    throw new AppError(
      ERROR_CODES.UNRELIABLE_EXTRACTION,
      "We couldn't reliably identify a conversation on this Claude page. The link may not be a public share link, or Claude's page format has changed."
    );
  }

  return {
    metadata: {
      platform: PLATFORMS.CLAUDE,
      title: extracted.title || pageTitle || "Claude Conversation",
      url: sourceUrl,
      createdAt: null,
    },
    messages: extracted.messages,
  };
}

module.exports = { parseClaudeHtml };
