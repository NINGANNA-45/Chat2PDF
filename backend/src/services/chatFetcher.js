const { detectPlatform, isPrivateChatgptConversationUrl } = require("./urlDetector");
const { PLATFORMS } = require("../utils/constants");
const { AppError } = require("../utils/validation");
const { ERROR_CODES } = require("../utils/constants");

const { fetchChatgptConversation } = require("../fetchers/chatgptFetcher");
const { fetchClaudeConversation } = require("../fetchers/claudeFetcher");
const { fetchWhatsappConversation } = require("../fetchers/whatsappFetcher");
const { fetchGenericConversation } = require("../fetchers/genericFetcher");

const FETCHERS = {
  [PLATFORMS.CHATGPT]: fetchChatgptConversation,
  [PLATFORMS.CLAUDE]: fetchClaudeConversation,
  [PLATFORMS.WHATSAPP]: fetchWhatsappConversation,
  [PLATFORMS.GENERIC]: fetchGenericConversation,
};

/**
 * Detects the platform for a URL and delegates to that platform's
 * fetcher, returning { platform, conversation } where conversation is
 * already in the normalized shape.
 */
async function fetchChat(rawUrl) {
  const { platform, parsedUrl } = detectPlatform(rawUrl);

  // Explicitly and immediately reject private/authenticated ChatGPT
  // conversation URLs (chatgpt.com/c/<id>) rather than letting them fall
  // through to the generic fetcher, which would waste a network round
  // trip before failing anyway. This is a deliberate, permanent rule -
  // there is no public way to view someone's private conversation.
  if (isPrivateChatgptConversationUrl(parsedUrl)) {
    throw new AppError(
      ERROR_CODES.NOT_PUBLIC,
      "This conversation cannot be accessed automatically. Please use a publicly accessible/shared conversation link."
    );
  }

  const fetcher = FETCHERS[platform];
  if (!fetcher) {
    throw new AppError(ERROR_CODES.INVALID_URL, "Unsupported platform.");
  }

  const conversation = await fetcher(parsedUrl);
  return { platform, conversation };
}

module.exports = { fetchChat };
