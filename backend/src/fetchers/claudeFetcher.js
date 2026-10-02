const { safeGet } = require("../services/httpClient");
const { AppError } = require("../utils/validation");
const { ERROR_CODES } = require("../utils/constants");
const { parseClaudeHtml } = require("../parsers/claudeParser");

/**
 * Fetches a publicly shared claude.ai/share/... page. Same rules as the
 * ChatGPT fetcher: no auth, no cookies, no bypass attempts. If Anthropic's
 * server declines to serve the page without a session, that is treated as
 * "not publicly accessible" rather than something to work around.
 */
async function fetchClaudeConversation(parsedUrl) {
  const response = await safeGet(parsedUrl);

  if (response.status === 401 || response.status === 403) {
    throw new AppError(
      ERROR_CODES.NOT_PUBLIC,
      "This conversation cannot be accessed automatically. Please use a publicly accessible/shared conversation link."
    );
  }

  if (response.status === 404) {
    throw new AppError(
      ERROR_CODES.FETCH_FAILED,
      "This shared conversation could not be found. The link may be broken or removed."
    );
  }

  if (response.status >= 400) {
    throw new AppError(
      ERROR_CODES.FETCH_FAILED,
      `The Claude share page returned an unexpected status (${response.status}).`
    );
  }

  return parseClaudeHtml(response.data, parsedUrl.toString());
}

module.exports = { fetchClaudeConversation };
