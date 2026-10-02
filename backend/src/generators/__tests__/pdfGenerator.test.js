const test = require("node:test");
const assert = require("node:assert/strict");

const { generatePdf } = require("../pdfGenerator");

const sampleConversation = {
  metadata: {
    platform: "chatgpt",
    title: "Test Conversation",
    url: "https://chatgpt.com/share/test",
    createdAt: null,
  },
  messages: [
    { id: "1", role: "user", sender: "User", content: "Hello", timestamp: null },
    {
      id: "2",
      role: "assistant",
      sender: "ChatGPT",
      content: "Hi there! Here's some **bold** text and a list:\n\n- one\n- two",
      timestamp: null,
    },
  ],
};

test("generatePdf produces a valid, non-trivial PDF buffer", async () => {
  const buffer = await generatePdf(sampleConversation, {
    pageSize: "A4",
    orientation: "portrait",
    theme: "light",
    fontSize: "medium",
    showPageNumbers: true,
    showTitle: true,
  });

  assert.ok(Buffer.isBuffer(buffer));
  assert.ok(buffer.length > 500, "expected a non-trivial PDF buffer");
  assert.equal(buffer.subarray(0, 5).toString("utf8"), "%PDF-");
});

test("generatePdf works with the dark theme and landscape orientation too", async () => {
  const buffer = await generatePdf(sampleConversation, {
    pageSize: "LETTER",
    orientation: "landscape",
    theme: "dark",
    fontSize: "small",
    showPageNumbers: false,
    showTitle: false,
  });

  assert.ok(Buffer.isBuffer(buffer));
  assert.equal(buffer.subarray(0, 5).toString("utf8"), "%PDF-");
});
