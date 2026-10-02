const test = require("node:test");
const assert = require("node:assert/strict");

const { fetchChat } = require("../chatFetcher");
const { AppError } = require("../../utils/validation");
const { ERROR_CODES } = require("../../utils/constants");

test("B. a private ChatGPT conversation URL is rejected immediately with NOT_PUBLIC", async () => {
  await assert.rejects(
    () => fetchChat("https://chatgpt.com/c/some-private-conversation-id"),
    (err) => err instanceof AppError && err.code === ERROR_CODES.NOT_PUBLIC
  );
});

test("an invalid URL is rejected with INVALID_URL before any fetcher runs", async () => {
  await assert.rejects(
    () => fetchChat("not-a-url-at-all"),
    (err) => err instanceof AppError && err.code === ERROR_CODES.INVALID_URL
  );
});
