const PDFDocument = require("pdfkit");
const { parseMarkdown } = require("./markdownRenderer");
const { renderCodeBlock } = require("./codeRenderer");
const {
  DEFAULT_PDF_SETTINGS,
  FONT_SIZE_MAP,
  THEMES,
  PLATFORM_LABELS,
} = require("../utils/constants");

const MARGIN = 50;

/**
 * Builds a PDF buffer from a normalized conversation + user settings.
 * Returns a Promise<Buffer>.
 */
function generatePdf(conversation, rawSettings = {}) {
  const settings = { ...DEFAULT_PDF_SETTINGS, ...rawSettings };
  const theme = THEMES[settings.theme] || THEMES.light;
  const fontSize = FONT_SIZE_MAP[settings.fontSize] || FONT_SIZE_MAP.medium;

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: settings.pageSize || "A4",
        layout: settings.orientation === "landscape" ? "landscape" : "portrait",
        margin: MARGIN,
        bufferPages: true,
        info: {
          Title: conversation.metadata.title || "Chat Conversation",
          Author: "Chat2PDF",
        },
      });

      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.rect(0, 0, doc.page.width, doc.page.height).fill(theme.background);
      doc.fillColor(theme.text);

      if (settings.showTitle) {
        renderCoverHeader(doc, conversation, theme, fontSize);
      }

      renderMessages(doc, conversation.messages, theme, fontSize);

      if (settings.showPageNumbers) {
        addPageNumbers(doc, theme);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function renderCoverHeader(doc, conversation, theme, fontSize) {
  const platformLabel = PLATFORM_LABELS[conversation.metadata.platform] || "Conversation";

  doc
    .fillColor(theme.accent)
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(platformLabel.toUpperCase() + " CONVERSATION", { align: "left" });

  doc.moveDown(0.3);

  doc
    .fillColor(theme.text)
    .font("Helvetica-Bold")
    .fontSize(fontSize.heading + 4)
    .text(conversation.metadata.title || "Untitled Conversation", { align: "left" });

  doc.moveDown(0.4);

  doc
    .fillColor(theme.subtleText)
    .font("Helvetica")
    .fontSize(9)
    .text(`Source: ${platformLabel}`, { align: "left" });

  if (conversation.metadata.url) {
    doc
      .fillColor(theme.subtleText)
      .fontSize(9)
      .text(`Original conversation: ${conversation.metadata.url}`, { align: "left" });
  }

  doc.moveDown(0.6);
  drawDivider(doc, theme);
  doc.moveDown(0.6);
  doc.fillColor(theme.text);
}

function renderMessages(doc, messages, theme, fontSize) {
  const contentWidth = doc.page.width - MARGIN * 2;

  messages.forEach((message, index) => {
    ensureSpaceForBlock(doc, 40);

    const isUser = message.role === "user";
    const bubbleColor = isUser ? theme.userBubble : theme.assistantBubble;
    const labelColor = isUser ? theme.userText : theme.assistantText;

    // Role label chip - capture the starting y explicitly rather than
    // relying on doc.y after a manually-positioned text() call, since
    // that call would otherwise leave the cursor in the wrong place and
    // cause the next block's content to overlap the chip.
    const chipTop = doc.y;
    const chipHeight = 20;
    doc.fillColor(bubbleColor).roundedRect(MARGIN, chipTop, 100, chipHeight, 4).fill();
    doc
      .fillColor(labelColor)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text((message.sender || message.role).toUpperCase(), MARGIN + 8, chipTop + 5, {
        width: 84,
        lineBreak: false,
      });

    doc.x = MARGIN;
    doc.y = chipTop + chipHeight + 10;
    doc.fillColor(theme.text);

    const blocks = parseMarkdown(message.content);
    for (const block of blocks) {
      doc.x = MARGIN; // each block starts flush against the left margin
      renderBlock(doc, block, theme, fontSize, contentWidth);
    }

    doc.moveDown(0.5);
    if (index < messages.length - 1) {
      drawDivider(doc, theme);
      doc.moveDown(0.5);
    }
  });
}

function renderBlock(doc, block, theme, fontSize, contentWidth) {
  switch (block.type) {
    case "heading":
      ensureSpaceForBlock(doc, 30);
      doc
        .font("Helvetica-Bold")
        .fontSize(Math.max(fontSize.body + (6 - block.level), fontSize.body))
        .fillColor(theme.text);
      renderSpansAsText(doc, block.spans, contentWidth);
      doc.moveDown(0.3);
      break;

    case "paragraph":
      doc.font("Helvetica").fontSize(fontSize.body).fillColor(theme.text);
      renderSpansAsText(doc, block.spans, contentWidth);
      doc.moveDown(0.4);
      break;

    case "list":
      renderList(doc, block, theme, fontSize, contentWidth);
      doc.moveDown(0.3);
      break;

    case "code":
      renderCodeBlock(doc, block, {
        theme,
        fontSize,
        margin: MARGIN,
        contentWidth,
      });
      break;

    case "table":
      renderTable(doc, block, theme, fontSize, contentWidth);
      doc.moveDown(0.4);
      break;

    case "hr":
      drawDivider(doc, theme);
      doc.moveDown(0.3);
      break;

    default:
      break;
  }
}

/**
 * Renders a list of inline spans as flowing text by switching pdfkit's
 * font per span and using `continued: true` so spans stay on the same
 * text flow (wrapping naturally across lines).
 */
function renderSpansAsText(doc, spans, width) {
  spans.forEach((span, i) => {
    const isLast = i === spans.length - 1;
    applySpanFont(doc, span.style, doc._fontSize || doc.currentLineHeight());
    doc.text(span.text, { continued: !isLast, width });
  });
  if (spans.length === 0) doc.text("");
}

function applySpanFont(doc, style, size) {
  const currentSize = doc._fontSize || size;
  switch (style) {
    case "bold":
      doc.font("Helvetica-Bold").fontSize(currentSize);
      break;
    case "italic":
      doc.font("Helvetica-Oblique").fontSize(currentSize);
      break;
    case "code":
      doc.font("Courier").fontSize(Math.max(currentSize - 1, 7));
      break;
    default:
      doc.font("Helvetica").fontSize(currentSize);
  }
}

function renderList(doc, block, theme, fontSize, contentWidth) {
  doc.font("Helvetica").fontSize(fontSize.body).fillColor(theme.text);
  const indent = 16;
  const textWidth = contentWidth - indent;

  block.items.forEach((spans, idx) => {
    ensureSpaceForBlock(doc, fontSize.body + 6);
    const bulletText = block.ordered ? `${idx + 1}. ` : "\u2022 ";
    // Prepend the bullet as a plain-style span so the whole line (bullet +
    // content) shares one consistent wrapping width - mixing an
    // independently-widthed leading fragment into a `continued` text run
    // would otherwise constrain every later fragment to that first width.
    const spansWithBullet = [{ text: bulletText, style: "normal" }, ...spans];
    doc.x = MARGIN + indent;
    renderSpansAsText(doc, spansWithBullet, textWidth);
  });

  doc.x = MARGIN;
}

function renderTable(doc, block, theme, fontSize, contentWidth) {
  const columns = block.header.length;
  if (columns === 0) return;
  const colWidth = contentWidth / columns;
  const rowHeight = fontSize.body + 12;

  ensureSpaceForBlock(doc, rowHeight * (block.rows.length + 1));

  const startY = doc.y;
  let y = startY;

  drawTableRow(doc, block.header, y, colWidth, rowHeight, theme, fontSize, true);
  y += rowHeight;

  for (const row of block.rows) {
    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.y;
    }
    drawTableRow(doc, row, y, colWidth, rowHeight, theme, fontSize, false);
    y += rowHeight;
  }

  doc.x = MARGIN;
  doc.y = y + 4;
}

function drawTableRow(doc, cells, y, colWidth, rowHeight, theme, fontSize, isHeader) {
  doc
    .rect(MARGIN, y, colWidth * cells.length, rowHeight)
    .strokeColor(theme.divider)
    .lineWidth(0.5)
    .stroke();

  doc
    .font(isHeader ? "Helvetica-Bold" : "Helvetica")
    .fontSize(Math.max(fontSize.body - 1, 7))
    .fillColor(theme.text);

  cells.forEach((cell, i) => {
    doc.text(cell, MARGIN + i * colWidth + 5, y + 4, {
      width: colWidth - 10,
      height: rowHeight - 6,
      ellipsis: true,
    });
  });

  doc.y = y;
}

function drawDivider(doc, theme) {
  const y = doc.y;
  doc
    .moveTo(MARGIN, y)
    .lineTo(doc.page.width - MARGIN, y)
    .strokeColor(theme.divider)
    .lineWidth(1)
    .stroke();
  doc.moveDown(0.3);
}

function ensureSpaceForBlock(doc, neededHeight) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + neededHeight > bottom) {
    doc.addPage();
  }
}

function addPageNumbers(doc, theme) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const pageNum = i - range.start + 1;
    doc
      .fillColor(theme.subtleText)
      .font("Helvetica")
      .fontSize(8)
      .text(`Page ${pageNum} of ${range.count}`, 0, doc.page.height - 35, {
        align: "center",
        width: doc.page.width,
      });
  }
}

module.exports = { generatePdf };
