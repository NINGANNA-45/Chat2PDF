const { fetchChat } = require("../services/chatFetcher");
const { AppError } = require("../utils/validation");
const { FRIENDLY_ERRORS } = require("../utils/constants");

const DEBUG_ENABLED = process.env.DEBUG_CHAT2PDF === "true";

async function fetchChatHandler(req, res) {
  const { url } = req.body || {};

  try {
    const { platform, conversation } = await fetchChat(url);

    return res.status(200).json({
      success: true,
      platform,
      conversation,
    });
  } catch (err) {
    const body = {
      success: false,
      error: friendlyMessage(err),
    };

    // Diagnostics are never included by default - only when the operator
    // has explicitly opted in via DEBUG_CHAT2PDF=true (see .env.example).
    // They never contain message content, cookies, or credentials (see
    // utils/diagnostics.js), but are still kept out of normal responses.
    if (DEBUG_ENABLED && err instanceof AppError && err.diagnostics) {
      body.diagnostics = err.diagnostics;
    }

    return res.status(errorStatus(err)).json(body);
  }
}

function errorStatus(err) {
  if (err instanceof AppError) {
    return err.statusCode || 400;
  }
  return 500;
}

function friendlyMessage(err) {
  if (err instanceof AppError) {
    return FRIENDLY_ERRORS[err.code] || err.message;
  }
  return "Something went wrong while processing that link. Please try again.";
}

module.exports = { fetchChatHandler };
