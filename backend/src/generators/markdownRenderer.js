/**
 * A lightweight markdown -> block-token parser purpose-built for chat
 * message content (not a full CommonMark implementation). It recognizes
 * headings, fenced code blocks, ordered/unordered lists, simple pipe
 * tables, horizontal rules, and paragraphs with inline bold/italic/
 * inline-code spans. pdfGenerator.js consumes the resulting tokens.
 */

function parseMarkdown(rawText) {
  const text = String(rawText).replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const blocks = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fenceMatch = line.match(/^```(\w*)\s*$/);
    if (fenceMatch) {
      const lang = fenceMatch[1] || "";
      const codeLines = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push({ type: "code", lang, code: codeLines.join("\n") });
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        spans: parseInlineSpans(headingMatch[2].trim()),
      });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // Table (a line containing pipes, followed by a separator row of ---|---)
    if (line.includes("|") && lines[i + 1] && /^[\s|:-]+$/.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      const headerCells = splitTableRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      blocks.push({ type: "table", header: headerCells, rows });
      continue;
    }

    // Unordered / ordered list (consume consecutive list lines as one block)
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
    const olMatch = line.match(/^(\s*)\d+[.)]\s+(.*)$/);
    if (ulMatch || olMatch) {
      const ordered = !!olMatch;
      const items = [];
      while (i < lines.length) {
        const m = ordered
          ? lines[i].match(/^(\s*)\d+[.)]\s+(.*)$/)
          : lines[i].match(/^(\s*)[-*+]\s+(.*)$/);
        if (!m) break;
        items.push(parseInlineSpans(m[2].trim()));
        i++;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    // Blank line -> paragraph separator
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph: consume until a blank line or a line that starts a new block type
    const paraLines = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^```/.test(lines[i]) &&
      !/^#{1,6}\s+/.test(lines[i]) &&
      !/^(\s*)[-*+]\s+/.test(lines[i]) &&
      !/^(\s*)\d+[.)]\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: "paragraph", spans: parseInlineSpans(paraLines.join(" ").trim()) });
  }

  return blocks;
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

/**
 * Parses a single line/paragraph of text into inline spans: plain text,
 * bold, italic, and inline code, so the PDF renderer can apply the right
 * font per span without a full rich-text engine.
 */
function parseInlineSpans(text) {
  const spans = [];
  // Order matters: inline code first (so ** inside code isn't treated as bold),
  // then bold, then italic.
  const tokenRegex = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*]+\*)|(_[^_]+_)/g;

  let lastIndex = 0;
  let match;
  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      spans.push({ text: text.slice(lastIndex, match.index), style: "normal" });
    }
    const token = match[0];
    if (token.startsWith("`")) {
      spans.push({ text: token.slice(1, -1), style: "code" });
    } else if (token.startsWith("**") || token.startsWith("__")) {
      spans.push({ text: token.slice(2, -2), style: "bold" });
    } else {
      spans.push({ text: token.slice(1, -1), style: "italic" });
    }
    lastIndex = tokenRegex.lastIndex;
  }
  if (lastIndex < text.length) {
    spans.push({ text: text.slice(lastIndex), style: "normal" });
  }

  return spans.length ? spans : [{ text, style: "normal" }];
}

module.exports = { parseMarkdown, parseInlineSpans };
