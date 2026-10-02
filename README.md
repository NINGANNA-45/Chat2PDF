# Chat2PDF

**Turn any shared chat into a beautiful PDF.**

Chat2PDF lets you paste a publicly shared conversation link (ChatGPT, Claude,
WhatsApp, or another supported chat URL) and turns it into a clean,
professionally formatted PDF — with headings, lists, tables, and code blocks
preserved.

```
USER PASTES A CHAT LINK
        ↓
WEBSITE FETCHES THE SHARED CHAT
        ↓
DETECTS THE PLATFORM
        ↓
EXTRACTS THE CONVERSATION
        ↓
FORMATS IT BEAUTIFULLY
        ↓
GENERATES A PDF
        ↓
USER PREVIEWS AND DOWNLOADS PDF
```

## Project structure

```
chat2pdf/
├── frontend/    React + Vite + Tailwind CSS SPA
├── backend/     Node.js + Express API
├── README.md
└── .gitignore
```

The frontend and backend are two independent applications that talk to each
other over HTTP — they are not bundled together.

## Important: what URLs this actually works on

Chat2PDF **only** processes conversations that are already publicly
accessible to a server-side request with no login, cookies, or credentials.

- ✅ Public ChatGPT share links (`https://chatgpt.com/share/...`)
- ✅ Public Claude share links (`https://claude.ai/share/...`)
- ✅ Public WhatsApp Channel posts (`https://whatsapp.com/channel/...`)
- ✅ Other pages whose HTML contains a clearly identifiable conversation
- ❌ Private conversations, DMs, or anything behind a login wall
- ❌ Anything requiring your ChatGPT / Claude / WhatsApp password

If a link isn't publicly accessible, the app tells you so directly instead of
pretending it worked or producing a broken PDF. **Chat2PDF will never ask you
for your ChatGPT, Claude, or WhatsApp credentials, and it never attempts to
bypass login, authentication, or CAPTCHA protections.**

A note on reliability: ChatGPT and Claude do not publish a stable public API
for their share pages, so extraction works by parsing the HTML/JSON those
pages currently ship. If OpenAI or Anthropic changes their page structure,
the relevant parser (`backend/src/parsers/`) may need a small update — this
is a normal, expected maintenance task for this kind of integration, not a
sign something is broken. Similarly, WhatsApp has no general mechanism for
exposing a private conversation's contents through a URL, so most WhatsApp
links will correctly be reported as not accessible.

### ChatGPT parser: legacy vs. modern share pages

ChatGPT share pages have shipped their conversation data in at least two
different transports over time, and `backend/src/parsers/chatgptParser.js`
supports both:

- **Legacy:** a single `<script id="__NEXT_DATA__">` tag containing parsed
  JSON with a `mapping` tree (node id → `{ message, parent, children }`).
- **Current (confirmed from live pages):** the conversation is delivered via
  React Router's **`turbo-stream`** wire format, inlined as one or more
  `window.__reactRouterContext.streamController.enqueue("...")` calls. This
  is a flat, reference-indexed slot table (not a simple `"<index>:<json>"`
  line map as initially assumed) — `backend/src/parsers/turboStreamDecoder.js`
  is a real decoder for it (negative sentinels for null/undefined/NaN/±Infinity/-0,
  one-letter type tags for Date/Map/Set/RegExp/BigInt/Error/Promise,
  `"_<index>"`-encoded object keys, memoized repeated references, deferred
  `P<id>:`/`E<id>:` lines for streamed-in values), verified by round-tripping
  real payloads through the actual `turbo-stream` npm package's encoder
  (`turbo-stream` is a devDependency; see
  `src/parsers/__tests__/turboStreamDecoder.test.js`). Once decoded, the
  parser searches the **entire** resulting object graph structurally (not by
  one fixed path) for a `linear_conversation` array or legacy `mapping`
  object, extracts visible `user`/`assistant` turns, and drops anything that
  is hidden, a tool call, or model-internal context.

If neither of those is found, a final DOM-based fallback looks for elements
carrying `data-message-author-role`, matching some historical page
revisions. A page using the *other* React/Next.js streaming format (Next.js
Flight, `self.__next_f.push(...)`) is detected and reported as such
(`next_flight_unsupported`) rather than silently mis-parsed — ChatGPT's
pages have been confirmed to use React Router's turbo-stream, not Flight.

**Status and how to verify against your real link:** the turbo-stream wire
format and decoder are verified against the real `turbo-stream` package, not
guessed. The specific *shape* of ChatGPT's loader data
(`linear_conversation`, message/author/content fields) is modelled on public
reverse-engineering, since this project's sandbox cannot reach chatgpt.com to
capture a live page directly. To verify or debug against your own real
share link:

```bash
cd backend
cp .env.example .env
# edit .env: set DEBUG_CHAT2PDF=true
npm install && npm run dev
# in another terminal:
curl -X POST http://localhost:5000/api/fetch-chat \
  -H "Content-Type: application/json" \
  -d '{"url":"https://chatgpt.com/share/<your-real-id>"}'
```

With `DEBUG_CHAT2PDF=true` and a `chatgpt.com` source host, every parse
(success or failure) writes `backend/debug/chatgpt-structure.json` — a
**structural-only** report (slot/reference counts, candidate counts,
redacted shapes/previews with all string *contents* replaced by length
markers) with a leak guard that withholds any free-form section if it finds
known message text inside it. It never contains message text, titles,
cookies, or credentials. If extraction still fails on a real link, that file
is normally enough to see exactly what's different (e.g. a renamed field,
an extra wrapper object, or a genuinely different transport) without ever
needing to share the conversation's actual content.

## Getting started

### Prerequisites

- Node.js 18+
- npm

### 1. Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev      # starts on http://localhost:5000
```

### 2. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev       # starts on http://localhost:5173
```

Open `http://localhost:5173` in your browser. The Vite dev server proxies
`/api` requests to the backend automatically (see `frontend/vite.config.js`).

### 3. Running tests

```bash
cd backend
npm test
```

Uses Node's built-in test runner (`node --test`, Node 18+). The only test
dependency is `turbo-stream` itself (used as the reference encoder to
generate fixtures and round-trip-verify the decoder — see
`backend/scripts/build-react-router-fixtures.js`). 37 tests cover: URL
detection (public share links, private `/c/` links, lookalike domains), the
ChatGPT parser against legacy `__NEXT_DATA__` and real turbo-stream-encoded
fixtures (including a value delivered on a deferred line, and messages that
must be filtered out: system/tool/hidden), the turbo-stream decoder itself
(primitives, repeated references, Dates, cycles, malformed input), the
structural debug report's redaction and leak-guard logic (including a
regression test for a chunk-boundary redaction bug found and fixed during
this work), and a PDF-generation smoke test.

### 4. Production build

```bash
cd frontend
npm run build      # outputs static files to frontend/dist
```

Serve `frontend/dist` with any static file host, and run the backend
(`npm start` inside `backend/`) behind it or on its own domain — just point
`VITE_API_BASE_URL` at wherever the backend is deployed.

## API reference

### `POST /api/fetch-chat`

Request:

```json
{ "url": "https://chatgpt.com/share/..." }
```

Success response:

```json
{
  "success": true,
  "platform": "chatgpt",
  "conversation": {
    "metadata": { "platform": "chatgpt", "title": "...", "url": "...", "createdAt": null },
    "messages": [
      { "id": "1", "role": "user", "sender": "User", "content": "Hello", "timestamp": null }
    ]
  }
}
```

Error response:

```json
{ "success": false, "error": "This conversation cannot be accessed automatically. Please use a publicly accessible/shared conversation link." }
```

### `POST /api/generate-pdf`

Request:

```json
{
  "conversation": { "metadata": { "...": "..." }, "messages": [] },
  "settings": {
    "pageSize": "A4",
    "orientation": "portrait",
    "theme": "light",
    "fontSize": "medium",
    "showPageNumbers": true,
    "showTitle": true
  }
}
```

Response: a binary `application/pdf` stream (or a JSON error body).

## Adding a new platform

The fetcher/parser architecture is modular by design:

1. Add a detection rule to `backend/src/services/urlDetector.js`.
2. Add `backend/src/fetchers/<platform>Fetcher.js` (fetch the public page).
3. Add `backend/src/parsers/<platform>Parser.js` (extract + normalize).
4. Register the fetcher in `backend/src/services/chatFetcher.js`.
5. Add a badge/icon for it in `frontend/src/components/PlatformBadge.jsx`.

Every parser must return the same normalized shape described in
`backend/src/utils/constants.js` and above — the PDF generator only ever
consumes that normalized structure, regardless of source platform.

## Tech stack

- **Frontend:** React, Vite, Tailwind CSS, React Router, Lucide React
- **Backend:** Node.js, Express, Axios, Cheerio, PDFKit

## License

This project is provided as-is for personal/educational use. It is not
affiliated with or endorsed by OpenAI, Anthropic, or WhatsApp/Meta.
