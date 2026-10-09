import { writeFileSync } from "node:fs";

const DIGITS = Number(process.argv[2] ?? 1_000_000);
const GUARD = 30;
const P = DIGITS + GUARD;

const C3_24 = 640320n ** 3n / 24n;

function split(a, b) {
  if (b - a === 1n) {
    if (a === 0n) return [1n, 1n, 13591409n];
    const p = (6n * a - 5n) * (2n * a - 1n) * (6n * a - 1n);
    const q = a * a * a * C3_24;
    const t = (a & 1n ? -p : p) * (13591409n + 545140134n * a);
    return [p, q, t];
  }
  const m = (a + b) / 2n;
  const [p1, q1, t1] = split(a, m);
  const [p2, q2, t2] = split(m, b);
  return [p1 * p2, q1 * q2, t1 * q2 + p1 * t2];
}

function isqrt(n) {
  const bits = BigInt(n.toString(2).length);
  let x = 1n << ((bits + 1n) / 2n);
  while (true) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

const t0 = Date.now();
const terms = BigInt(Math.ceil(P / 14.18) + 2);
const [, q, t] = split(0n, terms);
const one = 10n ** BigInt(P);
const sqrt = isqrt(10005n * one * one);
const pi = (q * 426880n * sqrt) / t;
console.log(`pi computed in ${(Date.now() - t0) / 1000}s`);

const full = pi.toString();
const decimals = full.slice(1, 1 + DIGITS);
writeFileSync(new URL("../data/pi-10.txt", import.meta.url), decimals);

const letters = Math.floor((DIGITS * Math.log(10)) / Math.log(26)) - 8;
const frac = pi - 3n * one;
const scaled = (frac * 26n ** BigInt(letters)) / one;
const raw = scaled.toString(26).padStart(letters, "0");
const map = "0123456789abcdefghijklmnop";
const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
let b26 = "";
for (const ch of raw) b26 += alpha[map.indexOf(ch)];
writeFileSync(new URL("../data/pi-26.txt", import.meta.url), b26);

console.log(`done in ${(Date.now() - t0) / 1000}s`);
console.log("start", decimals.slice(0, 20), "end", decimals.slice(-10));
console.log("base26 start", b26.slice(0, 20), "length", b26.length);
