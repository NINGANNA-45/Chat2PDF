const cheerio = require("cheerio");
const { AppError } = require("../utils/validation");
const { ERROR_CODES, ROLES, PLATFORMS } = require("../utils/constants");

// Minimum number of alternating speaker turns we require before we trust
// that a page actually contains a rendered conversation, rather than e.g.
// a blog post with a couple of quoted lines.
const MIN_MESSAGES_REQUIRED = 2;

const CANDIDATE_SELECTORS = [
  '[class*="message" i]',
  '[class*="chat-bubble" i]',
  '[class*="chat-turn" i]',
  '[data-testid*="message" i]',
  '[role="listitem"][class*="chat" i]',
];

/**
 * Attempts to identify conversation-like structure using common markup
 * conventions (message/bubble/turn class names, alternating
 * user/assistant-ish labeling). This is inherently best-effort for
 * arbitrary sites; if confidence is low we refuse to fabricate a result.
 */
function parseGenericHtml(html, sourceUrl) {
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim() || "Conversation";

  let nodes = $();
  for (const selector of CANDIDATE_SELECTORS) {
    const found = $(selector);
    if (found.length >= MIN_MESSAGES_REQUIRED) {
      nodes = found;
      break;
    }
  }

  if (nodes.length < MIN_MESSAGES_REQUIRED) {
    throw new AppError(
      ERROR_CODES.UNRELIABLE_EXTRACTION,
      "We couldn't reliably identify a conversation on this page."
    );
  }

  const messages = [];
  let counter = 1;
  let lastRole = null;

  nodes.each((_, el) => {
    const text = $(el).text().trim().replace(/\s+\n/g, "\n");
    if (!text || text.length < 1) return;

    const classAndAttrs = ($(el).attr("class") || "") + " " + ($(el).attr("data-testid") || "");
    const lower = classAndAttrs.toLowerCase();

    let role;
    if (/user|human|sender|outgoing|me\b/.test(lower)) {
      role = ROLES.USER;
    } else if (/assistant|bot|reply|incoming|other/.test(lower)) {
      role = ROLES.ASSISTANT;
    } else {
      // No clear signal from markup - alternate as a reasonable guess so
      // the document at least visually separates turns.
      role = lastRole === ROLES.USER ? ROLES.ASSISTANT : ROLES.USER;
    }

    lastRole = role;

    messages.push({
      id: String(counter++),
      role,
      sender: role === ROLES.USER ? "User" : "Assistant",
      content: text,
      timestamp: null,
    });
  });

  if (messages.length < MIN_MESSAGES_REQUIRED) {
    throw new AppError(
      ERROR_CODES.UNRELIABLE_EXTRACTION,
      "We couldn't reliably identify a conversation on this page."
    );
  }

  return {
    metadata: {
      platform: PLATFORMS.GENERIC,
      title,
      url: sourceUrl,
      createdAt: null,
    },
    messages,
  };
}

module.exports = { parseGenericHtml };
