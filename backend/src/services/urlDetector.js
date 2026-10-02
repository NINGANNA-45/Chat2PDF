const { parseAndValidateUrl } = require("../utils/validation");
const { PLATFORMS } = require("../utils/constants");

/**
 * Rules are evaluated in order. Each rule inspects the parsed URL
 * (hostname + pathname) rather than doing naive substring checks on
 * the raw string, so it isn't fooled by query params or lookalike domains.
 */
const PLATFORM_RULES = [
  {
    platform: PLATFORMS.CHATGPT,
    test: (parsed) =>
      /(^|\.)chatgpt\.com$/i.test(parsed.hostname) &&
      /^\/share\//i.test(parsed.pathname),
  },
  {
    platform: PLATFORMS.CHATGPT,
    // Legacy/alternate share path some OpenAI links have used.
    test: (parsed) =>
      /(^|\.)chat\.openai\.com$/i.test(parsed.hostname) &&
      /^\/share\//i.test(parsed.pathname),
  },
  {
    platform: PLATFORMS.CLAUDE,
    test: (parsed) =>
      /(^|\.)claude\.ai$/i.test(parsed.hostname) &&
      /^\/share\//i.test(parsed.pathname),
  },
  {
    platform: PLATFORMS.WHATSAPP,
    test: (parsed) =>
      /(^|\.)whatsapp\.com$/i.test(parsed.hostname) ||
      /(^|\.)wa\.me$/i.test(parsed.hostname),
  },
];

/**
 * Detects which platform a given raw URL string belongs to.
 * Returns { platform, parsedUrl }.
 */
function detectPlatform(rawUrl) {
  const parsedUrl = parseAndValidateUrl(rawUrl);

  for (const rule of PLATFORM_RULES) {
    if (rule.test(parsedUrl)) {
      return { platform: rule.platform, parsedUrl };
    }
  }

  return { platform: PLATFORMS.GENERIC, parsedUrl };
}

/**
 * Recognizes ChatGPT/chat.openai.com URLs that point at a private,
 * authenticated conversation (e.g. https://chatgpt.com/c/<id>) rather
 * than a public share link. This lets calling code reject them
 * immediately and explicitly, with a ChatGPT-specific explanation,
 * instead of silently falling through to the generic fetcher and
 * failing there instead.
 */
function isPrivateChatgptConversationUrl(parsedUrl) {
  const isChatgptHost =
    /(^|\.)chatgpt\.com$/i.test(parsedUrl.hostname) ||
    /(^|\.)chat\.openai\.com$/i.test(parsedUrl.hostname);

  if (!isChatgptHost) return false;

  // Anything under /c/ is a private authenticated conversation view.
  // Anything under /share/ is (potentially) public and handled separately.
  return /^\/c\//i.test(parsedUrl.pathname);
}

module.exports = { detectPlatform, isPrivateChatgptConversationUrl };
