/**
 * Renders a fenced code block onto a pdfkit document as a rounded,
 * dark background box with a monospace font. This is deliberately not a
 * full syntax highlighter (that would require shipping a tokenizer per
 * language); instead it focuses on clean, readable monospace layout with
 * proper line-wrapping and page-break handling, plus an optional
 * language label in the top-right corner.
 */

const PADDING = 10;
const LINE_GAP = 3;

function renderCodeBlock(doc, block, { theme, fontSize, margin, contentWidth }) {
  const codeFontSize = fontSize.code;
  doc.font("Courier").fontSize(codeFontSize);

  const lines = block.code.split("\n");
  const usableWidth = contentWidth - PADDING * 2;

  // Pre-wrap lines to know the box height before drawing (pdfkit has no
  // built-in "measure wrapped height for monospace" helper).
  const wrappedLines = [];
  for (const line of lines) {
    wrappedLines.push(...wrapMonospaceLine(doc, line, usableWidth, codeFontSize));
  }

  const lineHeight = codeFontSize + LINE_GAP;
  const boxHeight = PADDING * 2 + wrappedLines.length * lineHeight + (block.lang ? 14 : 0);

  ensureSpace(doc, boxHeight, margin);

  const boxTop = doc.y;
  doc
    .roundedRect(margin, boxTop, contentWidth, boxHeight, 6)
    .fill(theme.codeBackground);

  let cursorY = boxTop + PADDING;

  if (block.lang) {
    doc
      .fillColor(theme.subtleText || "#94a3b8")
      .font("Helvetica-Oblique")
      .fontSize(8)
      .text(block.lang, margin + PADDING, cursorY, {
        width: usableWidth,
        align: "right",
      });
    cursorY += 14;
  }

  doc.font("Courier").fontSize(codeFontSize).fillColor(theme.codeText);
  for (const line of wrappedLines) {
    doc.text(line.length ? line : " ", margin + PADDING, cursorY, {
      width: usableWidth,
      lineBreak: false,
    });
    cursorY += lineHeight;
  }

  doc.y = boxTop + boxHeight + 8;
  doc.fillColor(theme.text);
}

/**
 * Wraps a single line of monospace text to fit within `maxWidth`,
 * preserving leading whitespace/indentation on the first wrapped segment.
 */
function wrapMonospaceLine(doc, line, maxWidth, fontSize) {
  if (line.length === 0) return [""];

  const charWidth = doc.widthOfString("M"); // Courier is fixed-width
  const maxChars = Math.max(10, Math.floor(maxWidth / charWidth));

  if (line.length <= maxChars) return [line];

  const segments = [];
  let remaining = line;
  while (remaining.length > maxChars) {
    segments.push(remaining.slice(0, maxChars));
    remaining = "    " + remaining.slice(maxChars); // indent continuation
  }
  if (remaining.length) segments.push(remaining);
  return segments;
}

function ensureSpace(doc, neededHeight, margin) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + neededHeight > bottom) {
    doc.addPage();
  }
}

module.exports = { renderCodeBlock };
