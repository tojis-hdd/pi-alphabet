import { createReadStream, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, v, i, all) => (v.startsWith("--") ? [...acc, [v.slice(2), all[i + 1]]] : acc), [])
);
if (!args.dec || !args.b26) {
  console.log('usage: node scripts/pack.mjs --dec "Pi - Dec - Chudnovsky.txt" --b26 build/pi-26.txt [--digits 1000000000]');
  process.exit(1);
}

const DEC_CHUNK = 6_000_000;
const B26_CHUNK = 4_000_000;
const LIMIT = Number(args.digits ?? Infinity);
const root = new URL("../data/", import.meta.url);

function prepare(dir) {
  const out = new URL(`${dir}/`, root);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  return (n, bytes) => writeFileSync(new URL(`${String(n).padStart(4, "0")}.bin`, out), bytes);
}

function packDigits(src, len) {
  const groups = Math.ceil(len / 12);
  const out = new Uint8Array(groups * 5);
  const d = (i) => (i < len ? src[i] - 48 : 0);
  for (let g = 0, i = 0, o = 0; g < groups; g++, i += 12, o += 5) {
    const v0 = d(i) * 100 + d(i + 1) * 10 + d(i + 2);
    const v1 = d(i + 3) * 100 + d(i + 4) * 10 + d(i + 5);
    const v2 = d(i + 6) * 100 + d(i + 7) * 10 + d(i + 8);
    const v3 = d(i + 9) * 100 + d(i + 10) * 10 + d(i + 11);
    out[o] = v0 >> 2;
    out[o + 1] = ((v0 & 3) << 6) | (v1 >> 4);
    out[o + 2] = ((v1 & 15) << 4) | (v2 >> 6);
    out[o + 3] = ((v2 & 63) << 2) | (v3 >> 8);
    out[o + 4] = v3 & 255;
  }
  return out;
}

function packLetters(src, len) {
  const groups = Math.ceil(len / 8);
  const out = new Uint8Array(groups * 5);
  const l = (i) => (i < len ? src[i] - 65 : 0);
  for (let g = 0, i = 0, o = 0; g < groups; g++, i += 8, o += 5) {
    const a = [l(i), l(i + 1), l(i + 2), l(i + 3), l(i + 4), l(i + 5), l(i + 6), l(i + 7)];
    out[o] = (a[0] << 3) | (a[1] >> 2);
    out[o + 1] = ((a[1] & 3) << 6) | (a[2] << 1) | (a[3] >> 4);
    out[o + 2] = ((a[3] & 15) << 4) | (a[4] >> 1);
    out[o + 3] = ((a[4] & 1) << 7) | (a[5] << 2) | (a[6] >> 3);
    out[o + 4] = ((a[6] & 7) << 5) | a[7];
  }
  return out;
}

async function packDecimal() {
  const write = prepare("10");
  const buf = Buffer.alloc(DEC_CHUNK);
  let fill = 0;
  let total = 0;
  let files = 0;
  let started = false;
  let tail = "";
  const flush = () => {
    write(files++, packDigits(buf, fill));
    fill = 0;
  };
  for await (const part of createReadStream(args.dec, { highWaterMark: 1 << 22 })) {
    let i = 0;
    if (!started) {
      const dot = part.indexOf(46);
      if (dot < 0) continue;
      i = dot + 1;
      started = true;
    }
    for (; i < part.length && total < LIMIT; i++) {
      const c = part[i];
      if (c < 48 || c > 57) continue;
      buf[fill++] = c;
      total++;
      if (fill === DEC_CHUNK) {
        tail = buf.toString("latin1", DEC_CHUNK - 10);
        flush();
      }
    }
    if (total >= LIMIT) break;
  }
  if (fill) {
    tail = buf.toString("latin1", Math.max(0, fill - 10), fill);
    flush();
  }
  console.log(`decimal: ${total.toLocaleString("en")} digits in ${files} files, ends with ${tail}`);
  return { digits: total, files };
}

function packBase26() {
  const write = prepare("26");
  const src = readFileSync(args.b26);
  let files = 0;
  for (let i = 0; i < src.length; i += B26_CHUNK) {
    const part = src.subarray(i, Math.min(src.length, i + B26_CHUNK));
    write(files++, packLetters(part, part.length));
  }
  console.log(`base 26: ${src.length.toLocaleString("en")} letters in ${files} files`);
  return { letters: src.length, files };
}

const dec = await packDecimal();
const b26 = packBase26();
writeFileSync(
  new URL("meta.json", root),
  JSON.stringify(
    { digits: dec.digits, letters: b26.letters, decChunk: DEC_CHUNK, b26Chunk: B26_CHUNK, decFiles: dec.files, b26Files: b26.files },
    null,
    2
  ) + "\n"
);
