const cheerio = require("cheerio");
const { AppError } = require("../utils/validation");
const {
  ERROR_CODES,
  ROLES,
  PLATFORMS,
  WHATSAPP_PRIVATE_MESSAGE,
} = require("../utils/constants");

/**
 * A WhatsApp Channel page's post feed is rendered client-side by JS, so a
 * plain HTML fetch will typically only contain an empty shell + a
 * "install the app" prompt. We look for any server-rendered post text as
 * a best effort, but if nothing structured is found we fail closed with
 * the same honest message rather than fabricate content.
 */
function parseWhatsappHtml(html, sourceUrl) {
  const $ = cheerio.load(html);

  const postNodes = $('[class*="channel-post" i], [data-testid*="post" i]');

  if (!postNodes.length) {
    throw new AppError(ERROR_CODES.NOT_PUBLIC, WHATSAPP_PRIVATE_MESSAGE);
  }

  const messages = [];
  let counter = 1;

  postNodes.each((_, el) => {
    const text = $(el).text().trim();
    if (!text) return;
    messages.push({
      id: String(counter++),
      role: ROLES.ASSISTANT,
      sender: "Channel",
      content: text,
      timestamp: null,
    });
  });

  if (messages.length === 0) {
    throw new AppError(ERROR_CODES.NOT_PUBLIC, WHATSAPP_PRIVATE_MESSAGE);
  }

  return {
    metadata: {
      platform: PLATFORMS.WHATSAPP,
      title: $("title").first().text() || "WhatsApp Channel",
      url: sourceUrl,
      createdAt: null,
    },
    messages,
  };
}

module.exports = { parseWhatsappHtml };
