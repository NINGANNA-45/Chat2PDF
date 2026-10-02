/**
 * Decoder for the `turbo-stream` wire format that React Router uses for
 * `window.__reactRouterContext.streamController.enqueue(...)` (and which
 * ChatGPT's public share pages use to ship the conversation).
 *
 * Ported from the decode side of `turbo-stream` 2.4.1 (unflatten.js /
 * turbo-stream.js / utils.js). What has actually been checked against the
 * real package (not just written from memory):
 *   - the negative sentinels (-1 hole ... -7 undefined) and the one-letter
 *     type tags (B D E M N P R S Y U Z) are identical;
 *   - object keys are `_<index>` where <index> points at the key string;
 *   - the browser side concatenates raw enqueued chunks, splits on "\n"
 *     and keeps a trailing partial line for the next chunk (real
 *     `createLineSplittingTransform`) - `decodeTurboStreamText` receives
 *     that concatenated text and splits it the same way;
 *   - `__tests__/turboStreamDecoder.test.js` round-trips data through the
 *     REAL `turbo-stream` encoder (devDependency) into this decoder.
 * What is deliberately different: the real library returns Promises for
 * deferred values; this port has no async machinery, so a `["P", id]`
 * slot becomes a `{ __type: "Promise", pending, resolved }` placeholder and
 * `resolved` is filled in when the matching `P<id>:` line is decoded.
 *
 * Wire format summary:
 *   - FIRST line: a JSON array, a flat table of "slots". Each slot is a
 *     JSON primitive (used as-is), or an array/object whose elements /
 *     property values are integer INDICES into the same table. Slot 0 is
 *     the root.
 *   - Object keys look like "_7": the digits are a table index of the real
 *     (string) key.
 *   - Later lines (deferred data) are `P<id>:<json table>` / `E<id>:...`.
 */

const HOLE = -1;
const NAN = -2;
const NEGATIVE_INFINITY = -3;
const NEGATIVE_ZERO = -4;
const NULL = -5;
const POSITIVE_INFINITY = -6;
const UNDEFINED = -7;

const TYPE_BIGINT = "B";
const TYPE_DATE = "D";
const TYPE_ERROR = "E";
const TYPE_MAP = "M";
const TYPE_NULL_OBJECT = "N";
const TYPE_PROMISE = "P";
const TYPE_REGEXP = "R";
const TYPE_SET = "S";
const TYPE_SYMBOL = "Y";
const TYPE_URL = "U";
const TYPE_PREVIOUS_RESOLVED = "Z";

/**
 * Creates a fresh decode state. `values`/`hydrated` are shared across every
 * line decoded in one logical stream, matching the real library's `this`
 * context, so cross-line references resolve correctly.
 */
function createDecodeState() {
  return {
    values: [],
    hydrated: [],
    deferred: {},
    stats: {
      slotsCreated: 0,
      integerReferences: 0, // every reference followed while hydrating (root excluded)
      resolvedReferences: 0, // reference pointed at a real slot
      unresolvedReferences: 0, // reference pointed outside the table
      sentinelReferences: 0, // -1..-7 special values (undefined/null/NaN/...)
      memoHits: 0, // repeated reference to an already-hydrated slot
      promiseSlots: 0,
    },
  };
}

/**
 * Appends one parsed line's flat value table to the shared state and
 * hydrates (fully resolves) whichever index that line's root corresponds
 * to. Mirrors turbo-stream's `unflatten()` exactly.
 */
function unflatten(state, parsed) {
  if (typeof parsed === "number") return hydrate(state, parsed);
  if (!Array.isArray(parsed) || !parsed.length) {
    throw new SyntaxError("turboStreamDecoder: expected a non-empty array");
  }

  const startIndex = state.values.length;
  for (const value of parsed) {
    state.values.push(value);
  }
  state.stats.slotsCreated += parsed.length;
  state.hydrated.length = state.values.length;

  return hydrate(state, startIndex);
}

function hydrate(state, index) {
  const { hydrated, values } = state;
  let result;

  const stack = [[index, (v) => (result = v)]];
  let postRun = [];
  const stats = state.stats;
  let isRoot = true;

  while (stack.length > 0) {
    const [idx, set] = stack.pop();
    const isRef = !isRoot;
    isRoot = false;
    if (isRef) stats.integerReferences++;

    switch (idx) {
      case UNDEFINED:
        if (isRef) stats.sentinelReferences++;
        set(undefined);
        continue;
      case NULL:
        if (isRef) stats.sentinelReferences++;
        set(null);
        continue;
      case NAN:
        if (isRef) stats.sentinelReferences++;
        set(NaN);
        continue;
      case POSITIVE_INFINITY:
        if (isRef) stats.sentinelReferences++;
        set(Infinity);
        continue;
      case NEGATIVE_INFINITY:
        if (isRef) stats.sentinelReferences++;
        set(-Infinity);
        continue;
      case NEGATIVE_ZERO:
        if (isRef) stats.sentinelReferences++;
        set(-0);
        continue;
    }

    if (typeof idx !== "number" || idx < 0 || idx >= values.length) {
      // Reference points outside the known table - a malformed or
      // truncated stream. Fail this one slot closed rather than throwing,
      // so the rest of the structure can still be recovered.
      stats.unresolvedReferences++;
      set(undefined);
      continue;
    }

    if (isRef) stats.resolvedReferences++;

    if (hydrated[idx] !== undefined) {
      stats.memoHits++;
      set(hydrated[idx]);
      continue;
    }

    const value = values[idx];

    if (!value || typeof value !== "object") {
      hydrated[idx] = value;
      set(value);
      continue;
    }

    if (Array.isArray(value)) {
      if (typeof value[0] === "string") {
        const [type, b, c] = value;
        switch (type) {
          case TYPE_DATE:
            set((hydrated[idx] = new Date(b)));
            continue;
          case TYPE_URL:
            set((hydrated[idx] = { __type: "URL", href: b }));
            continue;
          case TYPE_BIGINT:
            set((hydrated[idx] = { __type: "BigInt", value: b }));
            continue;
          case TYPE_REGEXP:
            set((hydrated[idx] = { __type: "RegExp", source: b, flags: c }));
            continue;
          case TYPE_SYMBOL:
            set((hydrated[idx] = { __type: "Symbol", key: b }));
            continue;
          case TYPE_SET: {
            const arr = [];
            hydrated[idx] = arr;
            for (let i = 1; i < value.length; i++) {
              stack.push([value[i], (v) => arr.push(v)]);
            }
            set(arr);
            continue;
          }
          case TYPE_MAP: {
            const map = {};
            hydrated[idx] = map;
            for (let i = 1; i < value.length; i += 2) {
              const r = [];
              stack.push([value[i + 1], (v) => (r[1] = v)]);
              stack.push([value[i], (k) => (r[0] = k)]);
              postRun.push(() => {
                map[r[0]] = r[1];
              });
            }
            set(map);
            continue;
          }
          case TYPE_NULL_OBJECT: {
            const obj = Object.create(null);
            hydrated[idx] = obj;
            const b2 = value[1];
            for (const key of Object.keys(b2).reverse()) {
              const r = [];
              stack.push([b2[key], (v) => (r[1] = v)]);
              stack.push([Number(key.slice(1)), (k) => (r[0] = k)]);
              postRun.push(() => {
                obj[r[0]] = r[1];
              });
            }
            set(obj);
            continue;
          }
          case TYPE_PROMISE: {
            // No async machinery in this port: a placeholder object is
            // returned, and `resolved` is filled in once the matching
            // `P<id>:` line is decoded (see decodeTurboStreamText).
            const placeholder = { __type: "Promise", pending: true, resolved: undefined };
            stats.promiseSlots++;
            state.deferred[b] = placeholder;
            set((hydrated[idx] = placeholder));
            continue;
          }
          case TYPE_ERROR: {
            const [, message, errorType] = value;
            const error = new Error(message);
            if (errorType) error.name = errorType;
            hydrated[idx] = error;
            set(error);
            continue;
          }
          case TYPE_PREVIOUS_RESOLVED:
            set((hydrated[idx] = hydrated[b]));
            continue;
          default:
            // Unknown/plugin type tag - keep the raw tuple rather than
            // throwing, so callers can still see it exists.
            set((hydrated[idx] = value));
            continue;
        }
      } else {
        const array = [];
        hydrated[idx] = array;
        for (let i = 0; i < value.length; i++) {
          const n = value[i];
          if (n !== HOLE) {
            stack.push([n, (v) => (array[i] = v)]);
          }
        }
        set(array);
        continue;
      }
    } else {
      const object = {};
      hydrated[idx] = object;
      for (const key of Object.keys(value).reverse()) {
        const r = [];
        stack.push([value[key], (v) => (r[1] = v)]);
        stack.push([Number(key.slice(1)), (k) => (r[0] = k)]);
        postRun.push(() => {
          object[r[0]] = r[1];
        });
      }
      set(object);
      continue;
    }
  }

  while (postRun.length > 0) {
    postRun.pop()();
  }

  return result;
}

/**
 * Decodes a full reconstructed turbo-stream text blob (already
 * newline-joined - see collectStreamedChunks in chatgptParser.js for how
 * the browser-side text is recovered from `enqueue()` calls).
 *
 * Returns { root, deferredValues, stats } - `root` is the fully hydrated
 * first line's value (the vast majority of what we need), and
 * `deferredValues` holds anything resolved from later P#:/E#: lines, in
 * case the target data was itself deferred.
 */
function decodeTurboStreamText(fullText) {
  const state = createDecodeState();
  const lines = fullText.split("\n").filter((l) => l.length > 0);

  const stats = {
    totalLines: lines.length,
    rootLineFound: false,
    jsonParseSuccesses: 0,
    jsonParseFailures: 0,
    deferredLinesFound: 0,
  };

  if (lines.length === 0) {
    return { root: null, deferredValues: [], stats: { ...stats, ...state.stats } };
  }

  let root = null;
  let firstParsed;
  try {
    firstParsed = JSON.parse(lines[0]);
    stats.jsonParseSuccesses++;
    stats.rootLineFound = true;
    root = unflatten(state, firstParsed);
  } catch (err) {
    stats.jsonParseFailures++;
  }

  const deferredValues = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const typeChar = line[0];
    if (typeChar !== TYPE_PROMISE && typeChar !== TYPE_ERROR) continue;

    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    stats.deferredLinesFound++;
    const deferredId = Number(line.slice(1, colonIndex));
    const payloadText = line.slice(colonIndex + 1);
    try {
      const parsed = JSON.parse(payloadText);
      stats.jsonParseSuccesses++;
      const value = unflatten(state, parsed);
      deferredValues.push(value);
      if (typeChar === TYPE_PROMISE && state.deferred[deferredId]) {
        state.deferred[deferredId].pending = false;
        state.deferred[deferredId].resolved = value;
      }
    } catch (err) {
      stats.jsonParseFailures++;
    }
  }

  return {
    root,
    deferredValues,
    stats: {
      ...stats,
      ...state.stats,
      valuesTableSize: state.values.length,
      slotIndexMin: state.values.length ? 0 : null,
      slotIndexMax: state.values.length ? state.values.length - 1 : null,
    },
  };
}

module.exports = {
  decodeTurboStreamText,
  // exported for unit tests
  __internal: { unflatten, hydrate, createDecodeState },
};
