/**
 * Structured diagnostics for chat-fetching/parsing failures.
 *
 * These are meant to answer "what did the page actually look like when
 * we tried to parse it" without ever capturing anything sensitive or any
 * actual conversation content: no cookies, no authorization headers, no
 * message text, no HTML bodies. Only shapes, lengths, booleans, and enum
 * labels are recorded.
 */

function createDiagnostics(sourceUrl) {
  return {
    SOURCE_HOST: safeHostname(sourceUrl),
    FETCH_STATUS: null,
    CONTENT_TYPE: null,
    HTML_LENGTH: null,
    DETECTED_PAYLOAD_TYPE: "unknown",
    PARSE_STAGE: "init",
  };
}

function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch (err) {
    return null;
  }
}

/**
 * Logs diagnostics to the server console (never to the HTTP response
 * unless the caller explicitly opts in via DEBUG_CHAT2PDF). Accepts an
 * optional `extra` object for additional non-sensitive fields (e.g. an
 * error code) - callers must not pass message content, cookies, or
 * auth headers here.
 */
function logDiagnostics(label, diagnostics, extra = {}) {
  const safeExtra = { ...extra };
  delete safeExtra.content;
  delete safeExtra.messages;
  delete safeExtra.html;
  delete safeExtra.cookies;
  delete safeExtra.authorization;

  // eslint-disable-next-line no-console
  console.error(`[chat2pdf] ${label}`, JSON.stringify({ ...diagnostics, ...safeExtra }));
}

module.exports = { createDiagnostics, logDiagnostics };
