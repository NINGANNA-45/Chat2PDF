const { generatePdf } = require("../generators/pdfGenerator");
const { validateNormalizedConversation, AppError } = require("../utils/validation");
const { ERROR_CODES, DEFAULT_PDF_SETTINGS } = require("../utils/constants");

const ALLOWED_PAGE_SIZES = ["A4", "LETTER", "LEGAL"];
const ALLOWED_ORIENTATIONS = ["portrait", "landscape"];
const ALLOWED_THEMES = ["light", "dark"];
const ALLOWED_FONT_SIZES = ["small", "medium", "large"];

function sanitizeSettings(rawSettings = {}) {
  const settings = { ...DEFAULT_PDF_SETTINGS, ...rawSettings };

  if (!ALLOWED_PAGE_SIZES.includes(settings.pageSize)) settings.pageSize = "A4";
  if (!ALLOWED_ORIENTATIONS.includes(settings.orientation)) settings.orientation = "portrait";
  if (!ALLOWED_THEMES.includes(settings.theme)) settings.theme = "light";
  if (!ALLOWED_FONT_SIZES.includes(settings.fontSize)) settings.fontSize = "medium";
  settings.showPageNumbers = Boolean(settings.showPageNumbers);
  settings.showTitle = Boolean(settings.showTitle);

  return settings;
}

async function buildConversationPdf(conversation, rawSettings) {
  try {
    validateNormalizedConversation(conversation);
  } catch (err) {
    throw err;
  }

  const settings = sanitizeSettings(rawSettings);

  try {
    return await generatePdf(conversation, settings);
  } catch (err) {
    throw new AppError(ERROR_CODES.PARSE_FAILED, "Failed to generate the PDF.", 500);
  }
}

module.exports = { buildConversationPdf, sanitizeSettings };
