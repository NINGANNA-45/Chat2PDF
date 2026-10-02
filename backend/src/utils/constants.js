/**
 * Central place for enums / constant values used across the backend.
 */

const PLATFORMS = {
  CHATGPT: "chatgpt",
  CLAUDE: "claude",
  WHATSAPP: "whatsapp",
  GENERIC: "generic",
};

const ROLES = {
  USER: "user",
  ASSISTANT: "assistant",
  SYSTEM: "system",
};

const ERROR_CODES = {
  INVALID_URL: "INVALID_URL",
  UNSUPPORTED_PROTOCOL: "UNSUPPORTED_PROTOCOL",
  NOT_PUBLIC: "NOT_PUBLIC",
  FETCH_FAILED: "FETCH_FAILED",
  PARSE_FAILED: "PARSE_FAILED",
  EMPTY_CONVERSATION: "EMPTY_CONVERSATION",
  TIMEOUT: "TIMEOUT",
  UNRELIABLE_EXTRACTION: "UNRELIABLE_EXTRACTION",
};

const FRIENDLY_ERRORS = {
  [ERROR_CODES.NOT_PUBLIC]:
    "This conversation cannot be accessed automatically. Please use a publicly accessible/shared conversation link.",
  [ERROR_CODES.UNRELIABLE_EXTRACTION]:
    "We couldn't reliably identify a conversation on this page.",
  [ERROR_CODES.INVALID_URL]:
    "That doesn't look like a valid URL. Please check it and try again.",
  [ERROR_CODES.TIMEOUT]:
    "The chat page took too long to respond. Please try again in a moment.",
  [ERROR_CODES.EMPTY_CONVERSATION]:
    "We reached the page but couldn't find any messages to convert.",
  [ERROR_CODES.WHATSAPP_PRIVATE]:
    "WhatsApp does not expose this private conversation through this link. Please provide a publicly accessible conversation or use a supported export.",
};

const DEFAULT_PDF_SETTINGS = {
  pageSize: "A4",
  orientation: "portrait",
  theme: "light",
  fontSize: "medium",
  showPageNumbers: true,
  showTitle: true,
};

const FONT_SIZE_MAP = {
  small: { body: 9, heading: 14, code: 8 },
  medium: { body: 11, heading: 16, code: 9.5 },
  large: { body: 13, heading: 19, code: 11 },
};

const THEMES = {
  light: {
    background: "#ffffff",
    text: "#1f2430",
    subtleText: "#6b7280",
    userBubble: "#eef2ff",
    userText: "#3730a3",
    assistantBubble: "#f3f4f6",
    assistantText: "#111827",
    codeBackground: "#0f172a",
    codeText: "#e2e8f0",
    divider: "#e5e7eb",
    accent: "#4f46e5",
  },
  dark: {
    background: "#111827",
    text: "#f3f4f6",
    subtleText: "#9ca3af",
    userBubble: "#312e81",
    userText: "#e0e7ff",
    assistantBubble: "#1f2937",
    assistantText: "#f3f4f6",
    codeBackground: "#000000",
    codeText: "#d1fae5",
    divider: "#374151",
    accent: "#818cf8",
  },
};

const WHATSAPP_PRIVATE_MESSAGE =
  "WhatsApp does not expose this private conversation through this link. Please provide a publicly accessible conversation or use a supported export.";

const PLATFORM_LABELS = {
  [PLATFORMS.CHATGPT]: "ChatGPT",
  [PLATFORMS.CLAUDE]: "Claude",
  [PLATFORMS.WHATSAPP]: "WhatsApp",
  [PLATFORMS.GENERIC]: "Conversation",
};

module.exports = {
  PLATFORMS,
  ROLES,
  ERROR_CODES,
  FRIENDLY_ERRORS,
  DEFAULT_PDF_SETTINGS,
  FONT_SIZE_MAP,
  THEMES,
  PLATFORM_LABELS,
  WHATSAPP_PRIVATE_MESSAGE,
};
