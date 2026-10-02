const axios = require("axios");
const { AppError, parseAndValidateUrl } = require("../utils/validation");
const { ERROR_CODES } = require("../utils/constants");

const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS) || 15000;
const MAX_RESPONSE_BYTES = Number(process.env.MAX_RESPONSE_BYTES) || 8 * 1024 * 1024; // 8MB
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0.0.0 Safari/537.36 Chat2PDF/1.0 (+https://chat2pdf.example.com/bot)";

/**
 * A single shared "fetch a public page safely" helper used by every
 * platform fetcher. Centralizing this means the SSRF/timeout/size
 * protections only need to be gotten right once.
 *
 * - Enforces a request timeout.
 * - Enforces a maximum response size (`maxContentLength`/`maxBodyLength`),
 *   aborting the download rather than buffering an unbounded response.
 * - Validates the final URL after redirects against the same
 *   localhost/private-IP blocklist used for the original URL, so a
 *   malicious redirect can't be used to reach internal services.
 * - Never attaches cookies, session tokens, or credentials - this is a
 *   plain, unauthenticated GET, matching what a logged-out visitor would
 *   see.
 */
async function safeGet(parsedUrl, { acceptHeader = "text/html,application/xhtml+xml" } = {}) {
  let response;

  try {
    response = await axios.get(parsedUrl.toString(), {
      timeout: FETCH_TIMEOUT_MS,
      maxRedirects: 5,
      maxContentLength: MAX_RESPONSE_BYTES,
      maxBodyLength: MAX_RESPONSE_BYTES,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: acceptHeader,
      },
      validateStatus: (status) => status < 500,
      // Explicitly do not send cookies / credentials of any kind.
      withCredentials: false,
    });
  } catch (err) {
    if (err.code === "ECONNABORTED") {
      throw new AppError(ERROR_CODES.TIMEOUT, "The page took too long to respond.");
    }
    if (err.message && /maxContentLength|maxBodyLength/i.test(err.message)) {
      throw new AppError(
        ERROR_CODES.FETCH_FAILED,
        "That page's response was too large to process safely."
      );
    }
    throw new AppError(
      ERROR_CODES.FETCH_FAILED,
      "Could not reach that URL. It may be invalid, offline, or blocking automated requests."
    );
  }

  // Validate the URL actually landed on after following redirects, so a
  // redirect chain can't be used to smuggle us into a private network.
  const finalUrlString = response.request?.res?.responseUrl || response.request?.responseURL;
  if (finalUrlString) {
    try {
      parseAndValidateUrl(finalUrlString);
    } catch (err) {
      throw new AppError(
        ERROR_CODES.INVALID_URL,
        "This link redirected to a URL that cannot be processed."
      );
    }
  }

  return response;
}

module.exports = { safeGet, MAX_RESPONSE_BYTES, FETCH_TIMEOUT_MS };
