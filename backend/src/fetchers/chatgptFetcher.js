const { safeGet } = require("../services/httpClient");
const { AppError } = require("../utils/validation");
const { ERROR_CODES } = require("../utils/constants");
const { createDiagnostics, logDiagnostics } = require("../utils/diagnostics");
const { parseChatgptHtml } = require("../parsers/chatgptParser");

/**
 * Fetches a publicly shared ChatGPT conversation page and hands the raw
 * HTML off to chatgptParser for extraction.
 *
 * IMPORTANT: this only ever requests the public share URL as-is. No
 * cookies, sessions, or credentials are attached, and no login flow is
 * ever attempted. If OpenAI requires authentication for a given link
 * (e.g. it's not actually a public share, or it has expired), the
 * request will come back as an HTML page that doesn't contain the
 * conversation, and the parser will surface that as NOT_PUBLIC /
 * UNRELIABLE_EXTRACTION with diagnostics attached.
 */
async function fetchChatgptConversation(parsedUrl) {
  const sourceUrl = parsedUrl.toString();
  const diagnostics = createDiagnostics(sourceUrl);

  let response;
  try {
    response = await safeGet(parsedUrl);
  } catch (err) {
    diagnostics.PARSE_STAGE = "fetch_failed";
    logDiagnostics("chatgptFetcher: fetch failed", diagnostics, {
      code: err instanceof AppError ? err.code : "UNKNOWN",
    });
    throw err;
  }

  diagnostics.FETCH_STATUS = response.status;
  diagnostics.CONTENT_TYPE = response.headers["content-type"] || null;
  diagnostics.HTML_LENGTH = typeof response.data === "string" ? response.data.length : null;
  diagnostics.PARSE_STAGE = "fetched";

  if (response.status === 401 || response.status === 403) {
    logDiagnostics("chatgptFetcher: auth wall", diagnostics);
    throw new AppError(
      ERROR_CODES.NOT_PUBLIC,
      "This conversation cannot be accessed automatically. Please use a publicly accessible/shared conversation link."
    );
  }

  if (response.status === 404) {
    logDiagnostics("chatgptFetcher: not found", diagnostics);
    throw new AppError(
      ERROR_CODES.FETCH_FAILED,
      "This shared conversation could not be found. The link may be broken or removed."
    );
  }

  if (response.status >= 400) {
    logDiagnostics("chatgptFetcher: unexpected status", diagnostics);
    throw new AppError(
      ERROR_CODES.FETCH_FAILED,
      `The ChatGPT share page returned an unexpected status (${response.status}).`
    );
  }

  if (typeof response.data !== "string") {
    logDiagnostics("chatgptFetcher: non-text response", diagnostics);
    throw new AppError(
      ERROR_CODES.UNRELIABLE_EXTRACTION,
      "We couldn't reliably identify a conversation on this ChatGPT page."
    );
  }

  return parseChatgptHtml(response.data, sourceUrl, diagnostics);
}

module.exports = { fetchChatgptConversation };
