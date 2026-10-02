const test = require("node:test");
const assert = require("node:assert/strict");

const { detectPlatform, isPrivateChatgptConversationUrl } = require("../urlDetector");

test("A. a valid public ChatGPT share URL is detected as chatgpt", () => {
  const { platform } = detectPlatform("https://chatgpt.com/share/67eaea40-0f84-8008-b312-352dbf78b5c4");
  assert.equal(platform, "chatgpt");
});

test("A. a valid public ChatGPT share URL (legacy chat.openai.com host) is detected as chatgpt", () => {
  const { platform } = detectPlatform("https://chat.openai.com/share/67eaea40-0f84-8008-b312-352dbf78b5c4");
  assert.equal(platform, "chatgpt");
});

test("B. a private ChatGPT conversation URL (/c/<id>) is NOT detected as chatgpt", () => {
  const { platform } = detectPlatform("https://chatgpt.com/c/67eaea40-0f84-8008-b312-352dbf78b5c4");
  assert.notEqual(platform, "chatgpt");
});

test("B. isPrivateChatgptConversationUrl flags /c/<id> URLs for explicit rejection", () => {
  const { parsedUrl } = detectPlatform("https://chatgpt.com/c/some-private-id");
  assert.equal(isPrivateChatgptConversationUrl(parsedUrl), true);
});

test("B. isPrivateChatgptConversationUrl does not flag public /share/ URLs", () => {
  const { parsedUrl } = detectPlatform("https://chatgpt.com/share/some-public-id");
  assert.equal(isPrivateChatgptConversationUrl(parsedUrl), false);
});

test("C. a lookalike domain (example.com/share/<id>) is NOT detected as chatgpt", () => {
  const { platform } = detectPlatform("https://example.com/share/67eaea40-0f84-8008-b312-352dbf78b5c4");
  assert.notEqual(platform, "chatgpt");
  assert.equal(platform, "generic");
});

test("C. isPrivateChatgptConversationUrl ignores non-ChatGPT hosts entirely", () => {
  const { parsedUrl } = detectPlatform("https://example.com/c/some-id");
  assert.equal(isPrivateChatgptConversationUrl(parsedUrl), false);
});

test("a public Claude share URL is detected as claude", () => {
  const { platform } = detectPlatform("https://claude.ai/share/some-id");
  assert.equal(platform, "claude");
});

test("a whatsapp.com URL is detected as whatsapp", () => {
  const { platform } = detectPlatform("https://whatsapp.com/channel/some-id");
  assert.equal(platform, "whatsapp");
});
