const CACHE_NAME = "pi-alphabet-v2";
const BINS = 480;
const MAX_HITS = 100000;
const LRU_SIZE = 8;
const PREFETCH = 3;

let meta = null;
let store;
let current = 0;
const decoded = new Map();
const loading = new Map();
const countCache = new Map();
let bytesLoaded = 0;

const TRIPLES = new Uint8Array(3000);
for (let v = 0; v < 1000; v++) {
  TRIPLES[v * 3] = 48 + Math.floor(v / 100);
  TRIPLES[v * 3 + 1] = 48 + (Math.floor(v / 10) % 10);
  TRIPLES[v * 3 + 2] = 48 + (v % 10);
}
const latin = new TextDecoder("latin1");

function decodeDigits(bytes, len) {
  const out = new Uint8Array(Math.ceil(len / 12) * 12);
  for (let o = 0, i = 0; o < bytes.length; o += 5, i += 12) {
    const b0 = bytes[o], b1 = bytes[o + 1], b2 = bytes[o + 2], b3 = bytes[o + 3], b4 = bytes[o + 4];
    let t = ((b0 << 2) | (b1 >> 6)) * 3;
    out[i] = TRIPLES[t];
    out[i + 1] = TRIPLES[t + 1];
    out[i + 2] = TRIPLES[t + 2];
    t = (((b1 & 63) << 4) | (b2 >> 4)) * 3;
    out[i + 3] = TRIPLES[t];
    out[i + 4] = TRIPLES[t + 1];
    out[i + 5] = TRIPLES[t + 2];
    t = (((b2 & 15) << 6) | (b3 >> 2)) * 3;
    out[i + 6] = TRIPLES[t];
    out[i + 7] = TRIPLES[t + 1];
    out[i + 8] = TRIPLES[t + 2];
    t = (((b3 & 3) << 8) | b4) * 3;
    out[i + 9] = TRIPLES[t];
    out[i + 10] = TRIPLES[t + 1];
    out[i + 11] = TRIPLES[t + 2];
  }
  return latin.decode(out.subarray(0, len));
}

function decodeLetters(bytes, len) {
  const out = new Uint8Array(Math.ceil(len / 8) * 8);
  for (let o = 0, i = 0; o < bytes.length; o += 5, i += 8) {
    const b0 = bytes[o], b1 = bytes[o + 1], b2 = bytes[o + 2], b3 = bytes[o + 3], b4 = bytes[o + 4];
    out[i] = 65 + (b0 >> 3);
    out[i + 1] = 65 + (((b0 & 7) << 2) | (b1 >> 6));
    out[i + 2] = 65 + ((b1 >> 1) & 31);
    out[i + 3] = 65 + (((b1 & 1) << 4) | (b2 >> 4));
    out[i + 4] = 65 + (((b2 & 15) << 1) | (b3 >> 7));
    out[i + 5] = 65 + ((b3 >> 2) & 31);
    out[i + 6] = 65 + (((b3 & 3) << 3) | (b4 >> 5));
    out[i + 7] = 65 + (b4 & 31);
  }
  return latin.decode(out.subarray(0, len));
}

const kinds = {
  10: { size: () => meta.decChunk, total: () => meta.digits, files: () => meta.decFiles, decode: decodeDigits },
  26: { size: () => meta.b26Chunk, total: () => meta.letters, files: () => meta.b26Files, decode: decodeLetters },
};

async function fetchBytes(url) {
  try {
    store ??= await caches.open(CACHE_NAME);
    const hit = await store.match(url);
    if (hit) return new Uint8Array(await hit.arrayBuffer());
  } catch {}
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const buf = await res.arrayBuffer();
  bytesLoaded += buf.byteLength;
  try {
    await store?.put(url, new Response(buf.slice(0)));
  } catch {}
  return new Uint8Array(buf);
}

function chunk(kind, i) {
  const key = `${kind}/${i}`;
  if (decoded.has(key)) {
    const s = decoded.get(key);
    decoded.delete(key);
    decoded.set(key, s);
    return Promise.resolve(s);
  }
  if (loading.has(key)) return loading.get(key);
  const k = kinds[kind];
  const len = Math.min(k.size(), k.total() - i * k.size());
  const p = fetchBytes(`data/${kind}/${String(i).padStart(4, "0")}.bin`)
    .then((bytes) => {
      const s = k.decode(bytes, len);
      decoded.set(key, s);
      while (decoded.size > LRU_SIZE) decoded.delete(decoded.keys().next().value);
      return s;
    })
    .finally(() => loading.delete(key));
  loading.set(key, p);
  return p;
}

function countChunk(kind, i, s, upto) {
  const key = `${kind}/${i}`;
  const full = upto >= s.length;
  if (full && countCache.has(key)) return countCache.get(key);
  let counts;
  if (kind === "26") {
    counts = new Float64Array(26);
    for (let j = 0; j < upto; j++) counts[s.charCodeAt(j) - 65]++;
  } else {
    counts = new Float64Array(110);
    for (let j = 0; j < upto; j++) counts[s.charCodeAt(j) - 48]++;
    for (let j = 0; j + 1 < upto; j += 2) counts[10 + (s.charCodeAt(j) - 48) * 10 + s.charCodeAt(j + 1) - 48]++;
  }
  if (full) countCache.set(key, counts);
  return counts;
}

async function search({ id, kind, pattern, step, limit }) {
  const k = kinds[kind];
  const size = k.size();
  const end = Math.min(limit, k.total());
  const n = Math.ceil(end / size);
  const bins = new Float64Array(BINS);
  const counts = new Float64Array(kind === "26" ? 26 : 110);
  const fresh = [];
  let stored = 0;
  let total = 0;
  let carry = "";
  let lastPost = 0;
  const started = performance.now();
  const startBytes = bytesLoaded;

  const post = (done, scanned) => {
    postMessage({
      type: "progress",
      id,
      done,
      scanned,
      end,
      total,
      hits: fresh.splice(0),
      bins,
      counts,
      bytes: bytesLoaded - startBytes,
      ms: performance.now() - started,
    });
  };

  for (let c = 0; c < n; c++) {
    if (id !== current) return;
    for (let a = 1; a <= PREFETCH && c + a < n; a++) chunk(kind, c + a).catch(() => {});
    let s;
    try {
      s = await chunk(kind, c);
    } catch (err) {
      postMessage({ type: "error", id, message: String(err.message || err) });
      return;
    }
    if (id !== current) return;
    const base = c * size;
    const upto = Math.min(s.length, end - base);
    const cc = countChunk(kind, c, s, upto);
    for (let j = 0; j < counts.length; j++) counts[j] += cc[j];

    if (pattern) {
      const text = carry + s;
      const offset = base - carry.length;
      let i = text.indexOf(pattern);
      while (i !== -1) {
        const g = offset + i;
        if (g + pattern.length > end) break;
        if (step === 1 || g % 2 === 0) {
          total++;
          bins[Math.min(BINS - 1, Math.floor((g / end) * BINS))]++;
          if (stored < MAX_HITS) {
            fresh.push(g);
            stored++;
          }
        }
        i = text.indexOf(pattern, i + 1);
      }
      carry = pattern.length > 1 ? s.slice(s.length - (pattern.length - 1)) : "";
    }

    const now = performance.now();
    if (now - lastPost > 80 || c === n - 1) {
      lastPost = now;
      post(c === n - 1, base + upto);
    }
  }
}

async function slice({ id, kind, start, len }) {
  const k = kinds[kind];
  const size = k.size();
  const from = Math.max(0, start);
  const to = Math.min(k.total(), start + len);
  let out = "";
  for (let c = Math.floor(from / size); c * size < to; c++) {
    const s = await chunk(kind, c);
    out += s.slice(Math.max(0, from - c * size), Math.min(size, to - c * size));
  }
  postMessage({ type: "slice", id, kind, start: from, text: out });
}

onmessage = async ({ data }) => {
  if (data.type === "init") {
    meta = data.meta;
    return;
  }
  if (data.type === "search") {
    current = data.id;
    search(data);
    return;
  }
  if (data.type === "slice") {
    try {
      await slice(data);
    } catch (err) {
      postMessage({ type: "error", id: data.id, message: String(err.message || err) });
    }
  }
};
