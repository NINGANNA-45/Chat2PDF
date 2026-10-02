const { safeGet } = require("../services/httpClient");
const { AppError } = require("../utils/validation");
const { ERROR_CODES } = require("../utils/constants");
const { parseGenericHtml } = require("../parsers/genericParser");

/**
 * Best-effort fetcher for any other publicly reachable URL. It fetches
 * the raw HTML and hands off to genericParser, which uses heuristics to
 * look for conversation-like structures (alternating speaker blocks,
 * common chat-export class names, etc). If nothing reliable is found we
 * fail closed rather than emit a broken/garbled PDF.
 */
async function fetchGenericConversation(parsedUrl) {
  const response = await safeGet(parsedUrl);

  if (response.status === 401 || response.status === 403) {
    throw new AppError(
      ERROR_CODES.NOT_PUBLIC,
      "This conversation cannot be accessed automatically. Please use a publicly accessible/shared conversation link."
    );
  }

  if (response.status >= 400) {
    throw new AppError(
      ERROR_CODES.FETCH_FAILED,
      `That page returned an unexpected status (${response.status}).`
    );
  }

  const contentType = response.headers["content-type"] || "";
  if (!contentType.includes("text/html")) {
    throw new AppError(
      ERROR_CODES.UNRELIABLE_EXTRACTION,
      "We couldn't reliably identify a conversation on this page."
    );
  }

  return parseGenericHtml(response.data, parsedUrl.toString());
}

module.exports = { fetchGenericConversation };
