/**
 * Regenerates the React Router share-page fixtures used by the parser tests.
 *
 *   node scripts/build-react-router-fixtures.js
 *
 * The loader data is serialized with the REAL `turbo-stream` encoder (the
 * library React Router uses), then embedded the way React Router embeds
 * it: `window.__reactRouterContext.streamController.enqueue(<JSON string>)`
 * with HTML-significant characters escaped as \uXXXX.
 *
 * HONESTY NOTE: the wire format is real (produced by the real encoder), but
 * the *shape of the loader data* (route key, `linear_conversation`, message
 * fields) is modelled on public reverse-engineering of ChatGPT share pages,
 * not captured from a live page. These fixtures prove the decoder/search/
 * normalization logic; they do not prove what ChatGPT serves today.
 */
const fs = require("node:fs");
const path = require("node:path");
const { encode } = require("turbo-stream");

const OUT_DIR = path.join(__dirname, "..", "src", "parsers", "__fixtures__");

async function encodeToChunks(value) {
  const reader = encode(value).getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  for (;;) {
    const { done, value: v } = await reader.read();
    if (done) break;
    chunks.push(typeof v === "string" ? v : decoder.decode(v));
  }
  return chunks;
}

// Same escaping React Router applies to the JSON string it inlines in a <script>.
function escapeForScript(chunk) {
  return JSON.stringify(chunk)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

// Split a string into n pieces at arbitrary positions (mid-record, mid-string),
// never between the halves of a surrogate pair.
function splitArbitrarily(text, n) {
  const cuts = [];
  for (let i = 1; i < n; i++) {
    let at = Math.floor((text.length * i) / n) + 7 * i;
    const code = text.charCodeAt(at - 1);
    if (code >= 0xd800 && code <= 0xdbff) at += 1;
    cuts.push(at);
  }
  const pieces = [];
  let prev = 0;
  for (const at of [...cuts, text.length]) {
    pieces.push(text.slice(prev, at));
    prev = at;
  }
  return pieces;
}

function pageHtml({ title, enqueueChunks }) {
  const enqueueScripts = enqueueChunks
    .map((c) => `  <script>window.__reactRouterContext.streamController.enqueue(${escapeForScript(c)});</script>`)
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>ChatGPT - ${title}</title>
  <meta property="og:title" content="ChatGPT - ${title}" />
  <meta name="robots" content="noindex,nofollow" />
</head>
<body>
  <div id="root"></div>
  <script>window.__reactRouterContext = {"basename":"/","future":{"unstable_middleware":false},"isSpaMode":false,"stream":null,"state":null};window.__reactRouterContext.stream = new ReadableStream({start(controller){window.__reactRouterContext.streamController = controller;}}).pipeThrough(new TextEncoderStream());</script>
${enqueueScripts}
  <script>window.__reactRouterContext.streamController.close();</script>
</body>
</html>
`;
}

const LONG_MARKDOWN = [
  "# Gradient descent",
  "",
  "Gradient descent minimises a loss $L(\\theta)$ by repeatedly stepping *against* the gradient.",
  "",
  "1. Pick a learning rate `eta`",
  "2. Compute the gradient",
  "3. Update the parameters",
  "",
  "- **Batch** uses every example",
  "- *Stochastic* uses one",
  "",
  "| Variant | Cost per step |",
  "| --- | --- |",
  "| Batch | O(n) |",
  "| SGD | O(1) |",
  "",
  "```python",
  "def step(theta, grad, eta):",
  "",
  "    return theta - eta * grad  # blank line above is intentional",
  "```",
  "",
  "Unicode check: é 你好 ✨ – done.",
].join("\n");

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const sharedAssistant = { role: "assistant", name: null, metadata: {} };
  const conversation = [
    { id: "client-created-root", message: null, parent: null, children: ["sys"] },
    {
      id: "sys",
      message: {
        id: "m0",
        author: { role: "system", name: null, metadata: {} },
        content: { content_type: "text", parts: [""] },
        metadata: { is_visually_hidden_from_conversation: true },
      },
    },
    {
      id: "ctx",
      message: {
        id: "mctx",
        author: { role: "user", name: null, metadata: {} },
        content: { content_type: "user_editable_context", user_profile: "PRIVATE-PROFILE-SHOULD-NEVER-EXPORT" },
        metadata: { is_visually_hidden_from_conversation: true },
      },
    },
    {
      id: "u1",
      message: {
        id: "m1",
        author: { role: "user", name: null, metadata: {} },
        content: {
          content_type: "text",
          parts: ["Explain gradient descent. Use LaTeX: $$\\theta_{t+1} = \\theta_t - \\eta \\nabla L$$\n\nAnd keep line breaks."],
        },
        metadata: {},
        create_time: 1750000000.25,
        recipient: "all",
      },
    },
    {
      id: "a1",
      message: {
        id: "m2",
        author: sharedAssistant,
        content: { content_type: "text", parts: [LONG_MARKDOWN] },
        metadata: {},
        create_time: 1750000010.5,
        recipient: "all",
      },
    },
    {
      id: "tool",
      message: {
        id: "mtool",
        author: sharedAssistant,
        content: { content_type: "code", text: "print('TOOL-CALL-SHOULD-NEVER-EXPORT')" },
        metadata: {},
        recipient: "python",
      },
    },
    {
      id: "a2",
      message: {
        id: "m3",
        author: sharedAssistant,
        content: {
          content_type: "multimodal_text",
          parts: [
            { content_type: "image_asset_pointer", asset_pointer: "file-service://not-text" },
            "Caption text that follows an image.",
            { text: "A structured text part." },
          ],
        },
        metadata: {},
        create_time: 1750000020,
        recipient: "all",
      },
    },
  ];

  const loaderData = {
    root: { locale: "en-US", flags: { a: true, b: false }, nothing: undefined },
    "routes/share.$shareId": {
      sharedConversationId: "fixture-share-id",
      serverResponse: {
        type: "data",
        data: {
          title: "Gradient descent notes ✨",
          conversation_id: "fixture-conversation-id",
          is_public: true,
          moderation_state: { has_been_moderated: false },
          update_time: 1750000100.5,
          linear_conversation: conversation,
        },
      },
    },
  };

  // Fixture 1: one encoded line, delivered across THREE arbitrary enqueue() calls.
  const chunks = await encodeToChunks(loaderData);
  const text = chunks.join("");
  const pieces = splitArbitrarily(text, 3);
  fs.writeFileSync(
    path.join(OUT_DIR, "chatgpt-react-router-share.html"),
    pageHtml({ title: "Gradient descent notes ✨", enqueueChunks: pieces })
  );

  // Fixture 2: conversation delivered as a DEFERRED value (P<id>:<table> line).
  const deferredData = {
    routeTitle: "Deferred delivery ✨",
    conversationPromise: Promise.resolve({
      linear_conversation: [
        { id: "u", message: { author: { role: "user" }, content: { content_type: "text", parts: ["Deferred question?"] }, metadata: {}, create_time: 1, recipient: "all" } },
        { id: "a", message: { author: { role: "assistant" }, content: { content_type: "text", parts: ["Deferred answer."] }, metadata: {}, create_time: 2, recipient: "all" } },
      ],
    }),
  };
  const deferredChunks = await encodeToChunks(deferredData);
  fs.writeFileSync(
    path.join(OUT_DIR, "chatgpt-react-router-deferred.html"),
    pageHtml({ title: "Deferred delivery ✨", enqueueChunks: deferredChunks })
  );

  console.log(`share fixture: ${chunks.length} encoder chunk(s), ${text.length} chars, split into ${pieces.length} enqueue calls`);
  console.log(`deferred fixture: ${deferredChunks.length} encoder chunk(s)`);
  console.log("first line starts with:", JSON.stringify(text.slice(0, 20)), "| matches ^\\d+: ?", /^\d+:/.test(text));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
