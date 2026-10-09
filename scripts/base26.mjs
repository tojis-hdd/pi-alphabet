import { openSync, readSync, writeFileSync, closeSync, mkdirSync } from "node:fs";

const [src, digitsArg = "100000000"] = process.argv.slice(2);
if (!src) {
  console.log('usage: node scripts/base26.mjs "build/yc/Pi - Dec - Chudnovsky.txt" [digits]');
  process.exit(1);
}

const DIGITS = Number(digitsArg);
const GUARD = 40;
const P = DIGITS + GUARD;
const LOG26 = Math.log(10) / Math.log(26);
const out = new URL("../build/", import.meta.url);

const started = Date.now();
const log = (msg) => console.log(`${((Date.now() - started) / 1000).toFixed(1).padStart(7)}s  ${msg}`);

const fd = openSync(src, "r");
const head = Buffer.alloc(P + 2);
readSync(fd, head, 0, head.length, 0);
closeSync(fd);
if (head.toString("latin1", 0, 2) !== "3.") throw new Error("expected the file to start with 3.");
const digits = head.toString("latin1", 2, 2 + P);
log(`read ${P.toLocaleString("en")} digits`);

const frac = BigInt(digits);
log("parsed");
const letters = Math.floor(DIGITS * LOG26) - 10;
const scaled = (frac * 26n ** BigInt(letters)) / 10n ** BigInt(P);
log("scaled");
const raw = scaled.toString(26).padStart(letters, "0");
log("converted");

const map = new Uint8Array(128);
"0123456789abcdefghijklmnop".split("").forEach((c, i) => (map[c.charCodeAt(0)] = 65 + i));
const buf = Buffer.allocUnsafe(raw.length);
for (let i = 0; i < raw.length; i++) buf[i] = map[raw.charCodeAt(i)];
mkdirSync(out, { recursive: true });
writeFileSync(new URL("pi-26.txt", out), buf);
log(`${letters.toLocaleString("en")} letters written, starts with ${buf.toString("latin1", 0, 12)}`);
