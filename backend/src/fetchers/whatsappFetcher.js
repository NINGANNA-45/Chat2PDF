const { safeGet } = require("../services/httpClient");
const { AppError } = require("../utils/validation");
const { ERROR_CODES, WHATSAPP_PRIVATE_MESSAGE } = require("../utils/constants");
const { parseWhatsappHtml } = require("../parsers/whatsappParser");

/**
 * WhatsApp does not have a general mechanism for exposing a private
 * conversation's content through a plain URL the way ChatGPT/Claude
 * "share" links do. A wa.me/<number> link only opens a chat composer
 * with a contact - it carries no message history at all. A
 * whatsapp.com/channel/... link *can* be a public broadcast channel, so
 * that's the only case worth attempting a real fetch for; everything
 * else is rejected immediately and honestly rather than pretending to
 * extract something.
 */
async function fetchWhatsappConversation(parsedUrl) {
  const isChannelLink = /^\/channel\//i.test(parsedUrl.pathname);

  if (!isChannelLink) {
    throw new AppError(ERROR_CODES.NOT_PUBLIC, WHATSAPP_PRIVATE_MESSAGE);
  }

  let response;
  try {
    response = await safeGet(parsedUrl);
  } catch (err) {
    throw new AppError(ERROR_CODES.NOT_PUBLIC, WHATSAPP_PRIVATE_MESSAGE);
  }

  if (response.status >= 400) {
    throw new AppError(ERROR_CODES.NOT_PUBLIC, WHATSAPP_PRIVATE_MESSAGE);
  }

  // WhatsApp Channel pages render their post feed client-side via JS, so a
  // plain HTML fetch will almost never contain readable message content.
  // We still try (in case a lightweight server-rendered fallback exists),
  // but parseWhatsappHtml is expected to fail closed rather than guess.
  return parseWhatsappHtml(response.data, parsedUrl.toString());
}

module.exports = { fetchWhatsappConversation };
