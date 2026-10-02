const { buildConversationPdf } = require("../services/pdfService");
const { AppError } = require("../utils/validation");
const { FRIENDLY_ERRORS, PLATFORM_LABELS } = require("../utils/constants");

async function generatePdfHandler(req, res) {
  const { conversation, settings } = req.body || {};

  try {
    const pdfBuffer = await buildConversationPdf(conversation, settings);

    const platformLabel = PLATFORM_LABELS[conversation?.metadata?.platform] || "chat";
    const safeTitle = (conversation?.metadata?.title || "conversation")
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60);
    const filename = `${platformLabel.toLowerCase()}-${safeTitle || "conversation"}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    return res.status(200).send(pdfBuffer);
  } catch (err) {
    return res.status(errorStatus(err)).json({
      success: false,
      error: friendlyMessage(err),
    });
  }
}

function errorStatus(err) {
  if (err instanceof AppError) return err.statusCode || 400;
  return 500;
}

function friendlyMessage(err) {
  if (err instanceof AppError) {
    return FRIENDLY_ERRORS[err.code] || err.message;
  }
  return "Something went wrong while generating the PDF. Please try again.";
}

module.exports = { generatePdfHandler };
