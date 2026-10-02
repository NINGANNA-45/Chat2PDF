const { ERROR_CODES } = require("./constants");

class AppError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message || code);
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Parses and validates a URL string.
 * Throws AppError(INVALID_URL) if malformed, or AppError(UNSUPPORTED_PROTOCOL)
 * if the protocol isn't http/https.
 */
function parseAndValidateUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") {
    throw new AppError(ERROR_CODES.INVALID_URL, "A URL string is required.");
  }

  const trimmed = rawUrl.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) {
    throw new AppError(ERROR_CODES.INVALID_URL, "URL is empty or too long.");
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (err) {
    throw new AppError(ERROR_CODES.INVALID_URL, "That doesn't look like a valid URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new AppError(
      ERROR_CODES.UNSUPPORTED_PROTOCOL,
      "Only http/https URLs are supported."
    );
  }

  // Block obviously private / local network hosts to avoid SSRF against internal services.
  const hostname = parsed.hostname.toLowerCase();
  const blockedHosts = ["localhost", "127.0.0.1", "0.0.0.0", "::1"];
  const isPrivateIp =
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) ||
    /^169\.254\./.test(hostname);

  if (blockedHosts.includes(hostname) || isPrivateIp) {
    throw new AppError(
      ERROR_CODES.INVALID_URL,
      "This URL points to a local/private address and cannot be processed."
    );
  }

  return parsed;
}

/**
 * Validates that a normalized conversation object has the expected shape
 * and at least one message, before it's handed to the PDF generator.
 */
function validateNormalizedConversation(conversation) {
  if (!conversation || typeof conversation !== "object") {
    throw new AppError(ERROR_CODES.EMPTY_CONVERSATION, "No conversation data provided.");
  }

  if (!conversation.metadata || !Array.isArray(conversation.messages)) {
    throw new AppError(
      ERROR_CODES.EMPTY_CONVERSATION,
      "Conversation is missing metadata or messages."
    );
  }

  if (conversation.messages.length === 0) {
    throw new AppError(
      ERROR_CODES.EMPTY_CONVERSATION,
      "We reached the page but couldn't find any messages to convert."
    );
  }

  for (const msg of conversation.messages) {
    if (typeof msg.content !== "string") {
      throw new AppError(ERROR_CODES.PARSE_FAILED, "A message is missing text content.");
    }
  }

  return true;
}

module.exports = {
  AppError,
  parseAndValidateUrl,
  validateNormalizedConversation,
};
