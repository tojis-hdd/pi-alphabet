import { startBackdrop } from "./backdrop.js";

const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GAP = "·";
const LOG26 = Math.log(10) / Math.log(26);
const MIN_EXP = 2;
const GALAXY_POINTS = 5000;
const fmt = new Intl.NumberFormat("de-DE");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

const MODES = {
  b26: { hint: "A = 0 … Z = 25", letters: 26 },
  pairs: { hint: "01 = A … 26 = Z", letters: 26 },
  digits: { hint: "0 = A … 9 = J", letters: 10 },
};

const CHIPS = ["PI", "OK", "TEE", "WOW", "ZEIT", "GOTT", "JAZZ", "SONNE", "MATHE", "BACH", "999999", "31415926"];

const $ = (id) => document.getElementById(id);
const el = Object.fromEntries(
  [
    "loader", "loader-fill", "loader-text", "badge-text", "hero-stream", "search-form", "query", "chips", "places",
    "places-out", "ticks", "modes", "mode-hint", "mode-note", "verdict-word", "verdict-text", "scan", "scan-fill",
    "scan-text", "scan-rate", "s-count", "s-first", "s-expect", "s-chance", "tape", "hit-label", "hit-prev", "hit-next",
    "map", "map-end", "hits", "galaxy", "galaxy-tip", "galaxy-hint", "freq", "freq-hint", "freq-foot", "foot-text",
  ].map((id) => [id.replace(/-(\w)/g, (_, c) => c.toUpperCase()), $(id)])
);

const state = {
  meta: null,
  head: { 10: "", 26: "" },
  mode: "b26",
  places: 1_000_000,
  query: "",
  kind: "word",
  job: 0,
  hits: [],
  total: 0,
  scanned: 0,
  scanEnd: 0,
  done: true,
  bins: null,
  counts: null,
  active: -1,
  focus: 0,
};

const worker = new Worker("worker.js");
const sliceWaiters = new Map();
let sliceId = 0;

worker.onmessage = ({ data }) => {
  if (data.type === "progress" && data.id === state.job) onProgress(data);
  if (data.type === "slice") {
    sliceWaiters.get(data.id)?.(data.text);
    sliceWaiters.delete(data.id);
  }
  if (data.type === "error") {
    sliceWaiters.get(data.id)?.("");
    sliceWaiters.delete(data.id);
    if (data.id === state.job) {
      state.done = true;
      el.scanText.textContent = `Fehler beim Laden: ${data.message}`;
    }
  }
};

function slice(kind, start, len) {
  const id = ++sliceId;
  return new Promise((resolve) => {
    sliceWaiters.set(id, resolve);
    worker.postMessage({ type: "slice", id, kind, start, len });
  });
}

const maxPlaces = () => state.meta.digits;
const maxExp = () => Math.log10(maxPlaces());
const b26Places = () => Math.ceil((state.meta.letters + 16) / LOG26);

function rawKind() {
  return state.kind === "word" && state.mode === "b26" ? "26" : "10";
}

function unitsPerRaw() {
  return state.kind === "word" && state.mode === "pairs" ? 2 : 1;
}

function rawLimit() {
  if (rawKind() === "26") return Math.min(state.meta.letters, Math.floor(state.places * LOG26));
  return state.places;
}

function unitCount() {
  return Math.floor(rawLimit() / unitsPerRaw());
}

function placeOfUnit(u) {
  if (rawKind() === "26") return u + 1;
  return u * unitsPerRaw() + 1;
}

function unitOfRaw(g) {
  return Math.floor(g / unitsPerRaw());
}

function normalize(raw) {
  const s = raw
    .toUpperCase()
    .replace(/Ä/g, "AE")
    .replace(/Ö/g, "OE")
    .replace(/Ü/g, "UE")
    .replace(/ß/g, "SS")
    .normalize("NFD")
    .replace(/[^A-Z0-9]/g, "");
  if (/^\d+$/.test(s)) return { kind: "num", q: s };
  return { kind: "word", q: s.replace(/\d/g, "") };
}

function invalidLetters() {
  if (state.kind === "num" || state.mode !== "digits") return "";
  return [...new Set(state.query.replace(/[A-J]/g, ""))].join("");
}

function rawPattern() {
  const q = state.query;
  if (!q) return "";
  if (state.kind === "num" || state.mode === "b26") return q;
  if (state.mode === "digits") return invalidLetters() ? "" : [...q].map((c) => c.charCodeAt(0) - 65).join("");
  return [...q].map((c) => String(c.charCodeAt(0) - 64).padStart(2, "0")).join("");
}

function placesFromSlider(v) {
  const exp = MIN_EXP + ((maxExp() - MIN_EXP) * v) / 1000;
  const raw = Math.pow(10, exp);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)) - 1);
  return Math.min(maxPlaces(), Math.max(10 ** MIN_EXP, Math.round(raw / mag) * mag));
}

function sliderFromPlaces(p) {
  return Math.round(((Math.log10(p) - MIN_EXP) / (maxExp() - MIN_EXP)) * 1000);
}

function expectedPlace(len) {
  if (state.kind === "num") return Math.pow(10, len);
  if (state.mode === "b26") return Math.pow(26, len) / LOG26;
  if (state.mode === "pairs") return 2 * Math.pow(100, len);
  return Math.pow(10, len);
}

function compact(n) {
  if (!isFinite(n)) return "∞";
  if (n < 1e6) return fmt.format(Math.round(n));
  if (n >= 1e15) return `10${superscript(Math.floor(Math.log10(n)))}`;
  for (const [v, u] of [[1e12, "Bio."], [1e9, "Mrd."], [1e6, "Mio."]]) {
    if (n >= v) return `${(n / v).toLocaleString("de-DE", { maximumFractionDigits: 1 })} ${u}`;
  }
  return fmt.format(n);
}

function superscript(n) {
  return String(n).split("").map((c) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[c]).join("");
}

function bytes(n) {
  if (n < 1e6) return `${Math.round(n / 1e3)} KB`;
  return `${(n / 1e6).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`;
}

function run({ animate = true } = {}) {
  state.job++;
  state.hits = [];
  state.total = 0;
  state.scanned = 0;
  state.active = -1;
  state.bins = null;
  state.counts = null;
  state.done = false;
  state.focus = 0;
  state.animate = animate;

  const pattern = rawPattern();
  const limit = state.query && pattern ? rawLimit() : Math.min(rawLimit(), rawKind() === "26" ? state.meta.b26Chunk : state.meta.decChunk);
  state.scanEnd = limit;
  state.searching = Boolean(pattern);
  worker.postMessage({ type: "search", id: state.job, kind: rawKind(), pattern, step: unitsPerRaw(), limit });

  renderModeNote();
  renderVerdict();
  renderStats();
  renderScan();
  renderTape();
  renderHits();
  drawMap();
  galaxy.refresh();
  writeHash();
}

let frameQueued = false;
function onProgress(data) {
  const hadHit = state.hits.length > 0;
  for (const g of data.hits) state.hits.push(g);
  state.total = data.total;
  state.scanned = data.scanned;
  state.scanEnd = data.end;
  state.done = data.done;
  state.bins = data.bins;
  state.counts = data.counts;
  state.bytes = data.bytes;
  state.ms = data.ms;
  if (!hadHit && state.hits.length) {
    state.active = 0;
    state.focus = unitOfRaw(state.hits[0]);
    renderVerdict();
    renderTape();
    galaxy.refresh();
  }
  const paint = () => {
    frameQueued = false;
    if (state.done || !hadHit) renderVerdict();
    renderStats();
    renderScan();
    renderHits();
    drawMap();
    renderFreq();
    if (state.done) galaxy.refresh();
  };
  if (state.done) return paint();
  if (frameQueued) return;
  frameQueued = true;
  setTimeout(paint, 60);
}

function renderModeNote() {
  if (state.kind === "word" && state.mode === "b26" && state.places > b26Places()) {
    el.modeNote.innerHTML = `Basis 26 liegt bis <b>${compact(b26Places())}</b> Stellen vor, darüber wird abgeschnitten.`;
  } else if (state.kind === "num") {
    el.modeNote.innerHTML = `Zahlen werden direkt in den Dezimalstellen gesucht.`;
  } else {
    el.modeNote.textContent = "";
  }
}

function renderVerdict() {
  const q = state.query;
  const word = el.verdictWord;
  if (!q) {
    word.className = "verdict-word";
    word.innerHTML = "";
    el.verdictText.innerHTML = `Tippe ein Wort ein oder klick dich durch <b>${compact(maxPlaces())}</b> Stellen von π.`;
    return;
  }
  const found = state.hits.length > 0;
  const status = found ? "found" : state.done || !state.searching ? "missing" : "pending";
  const html = [...q].map((c, i) => `<span style="animation-delay:${state.animate ? i * 50 : 0}ms">${c}</span>`).join("");
  if (word.dataset.q !== q || word.dataset.status !== status) {
    word.innerHTML = html;
    word.dataset.q = q;
    word.dataset.status = status;
  }
  word.className = `verdict-word ${status}`;

  const bad = invalidLetters();
  if (bad) {
    el.verdictText.innerHTML = `Im Alphabet <b>A–J</b> gibt es kein <b>${bad.split("").join(", ")}</b>. Probier Basis 26 oder Paare.`;
  } else if (found) {
    const label = rawKind() === "26" ? "Basis-26-Stelle" : "Nachkommastelle";
    el.verdictText.innerHTML = `steht in π, zum ersten Mal ab der <b>${fmt.format(placeOfUnit(unitOfRaw(state.hits[0])))}.</b> ${label}.`;
  } else if (status === "pending") {
    el.verdictText.innerHTML = `wird gesucht …`;
  } else {
    el.verdictText.innerHTML = `kommt in den ersten <b>${fmt.format(state.places)}</b> Nachkommastellen nicht vor. Zieh den Regler weiter auf.`;
  }
}

function renderStats() {
  const q = state.query;
  if (!q) {
    for (const k of ["sCount", "sFirst", "sExpect", "sChance"]) el[k].textContent = "–";
    return;
  }
  el.sCount.textContent = fmt.format(state.total) + (state.done ? "" : "+");
  el.sFirst.textContent = state.hits.length ? fmt.format(placeOfUnit(unitOfRaw(state.hits[0]))) : "–";
  const exp = expectedPlace(q.length);
  el.sExpect.textContent = compact(exp);
  const range = rawKind() === "26" ? Math.min(state.places, b26Places()) : state.places;
  const p = invalidLetters() ? 0 : 1 - Math.exp(-range / exp);
  el.sChance.textContent = p > 0.9995 ? "≈ 100 %" : p < 0.0005 && p > 0 ? "< 0,1 %" : `${(p * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`;
}

function renderScan() {
  const active = state.searching;
  el.scan.classList.toggle("on", active);
  if (!active) return;
  const frac = state.scanEnd ? state.scanned / state.scanEnd : 0;
  el.scanFill.style.width = `${(frac * 100).toFixed(2)}%`;
  const unit = rawKind() === "26" ? "Buchstaben" : "Stellen";
  el.scanText.textContent = state.done
    ? `${compact(state.scanEnd)} ${unit} durchsucht`
    : `durchsuche ${compact(state.scanned)} / ${compact(state.scanEnd)} ${unit}`;
  const rate = state.ms ? state.scanned / (state.ms / 1000) : 0;
  el.scanRate.textContent = state.ms ? `${compact(rate)}/s${state.bytes ? ` · ${bytes(state.bytes)} geladen` : " · aus dem Cache"}` : "";
}

function tapeWidth() {
  const cell = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cell")) || 44;
  const n = Math.floor(el.tape.clientWidth / (cell + 3));
  return Math.max(7, n % 2 ? n : n - 1);
}

let tapeToken = 0;
async function renderTape() {
  const token = ++tapeToken;
  const n = tapeWidth();
  const units = unitCount();
  const qlen = state.query.length;
  const centre = Math.min(Math.max(0, state.focus + Math.floor(qlen / 2)), Math.max(0, units - 1));
  const start = centre - Math.floor(n / 2);
  const per = unitsPerRaw();
  const kind = rawKind();
  const from = Math.max(0, start);
  const text = await slice(kind, from * per, (n + 1) * per);
  if (token !== tapeToken) return;

  const activeStart = state.active >= 0 ? unitOfRaw(state.hits[state.active]) : -1;
  const nearby = new Set();
  if (qlen) {
    for (const h of state.hits) {
      const u = unitOfRaw(h);
      if (u + qlen < start) continue;
      if (u > start + n) break;
      for (let k = 0; k < qlen; k++) nearby.add(u + k);
    }
  }

  const html = [];
  for (let j = 0; j < n; j++) {
    const u = start + j;
    if (u < 0 || u >= units) {
      html.push(`<div class="cell blank"><span class="cell-ch">·</span></div>`);
      continue;
    }
    const off = (u - from) * per;
    let ch;
    let src = "";
    if (kind === "26") ch = text[off];
    else if (state.kind === "num") ch = text[off];
    else if (state.mode === "digits") {
      src = text[off];
      ch = ALPHA[src.charCodeAt(0) - 48];
    } else {
      src = text.substr(off, 2);
      const v = Number(src);
      ch = v >= 1 && v <= 26 ? ALPHA[v - 1] : GAP;
    }
    if (ch === undefined) ch = "";
    const cls = ["cell"];
    if (ch === GAP) cls.push("gap");
    const isHit = activeStart >= 0 && u >= activeStart && u < activeStart + qlen;
    if (isHit) cls.push("hit", "shimmer");
    else if (nearby.has(u)) cls.push("other");
    const delay = reduced ? 0 : Math.abs(j - (n >> 1)) * 16;
    const idx = u % 10 === 0 || isHit ? fmt.format(placeOfUnit(u)) : "";
    html.push(`<div class="${cls.join(" ")}" style="animation-delay:${delay}ms"><span class="cell-ch">${ch}</span><span class="cell-src">${src}</span><span class="cell-idx">${idx}</span></div>`);
  }
  el.tape.innerHTML = html.join("");
  el.hitLabel.textContent =
    state.active >= 0
      ? `Treffer ${fmt.format(state.active + 1)} / ${fmt.format(state.total)}${state.done ? "" : "+"}`
      : `Stelle ${fmt.format(placeOfUnit(Math.min(state.focus, Math.max(0, units - 1))))}`;
}

function renderHits() {
  const shown = state.hits.slice(0, 150);
  const html = shown.map((h, i) => `<button type="button" data-i="${i}" class="${i === state.active ? "active" : ""}">${fmt.format(placeOfUnit(unitOfRaw(h)))}</button>`);
  if (state.total > shown.length) html.push(`<span class="more">+ ${fmt.format(state.total - shown.length)} weitere</span>`);
  el.hits.innerHTML = html.join("");
  if (state.active >= 0) el.hitLabel.textContent = `Treffer ${fmt.format(state.active + 1)} / ${fmt.format(state.total)}${state.done ? "" : "+"}`;
}

function setActive(i) {
  if (!state.hits.length) return;
  state.active = (i + state.hits.length) % state.hits.length;
  state.focus = unitOfRaw(state.hits[state.active]);
  renderTape();
  drawMap();
  el.hits.querySelectorAll("button").forEach((b) => b.classList.toggle("active", Number(b.dataset.i) === state.active));
  galaxy.refresh();
}

function step(dir) {
  if (state.hits.length) return setActive(state.active + dir);
  const units = unitCount();
  state.focus = Math.min(units - 1, Math.max(0, state.focus + dir * tapeWidth()));
  renderTape();
  drawMap();
}

function accentRgb() {
  return getComputedStyle(document.documentElement).getPropertyValue("--accent-rgb").trim();
}

function drawMap() {
  const c = el.map;
  const dpr = devicePixelRatio || 1;
  const w = c.clientWidth;
  const h = c.clientHeight;
  c.width = w * dpr;
  c.height = h * dpr;
  const ctx = c.getContext("2d");
  ctx.scale(dpr, dpr);
  const rgb = accentRgb();
  el.mapEnd.textContent = fmt.format(state.places);

  ctx.fillStyle = "rgba(255,255,255,0.04)";
  for (let x = 0; x < w; x += 6) ctx.fillRect(x, h / 2, 2, 1);

  if (state.searching) {
    const sx = (state.scanned / Math.max(1, state.scanEnd)) * w;
    ctx.fillStyle = `rgba(${rgb},0.06)`;
    ctx.fillRect(0, 0, sx, h);
  }

  const bins = state.bins;
  if (bins) {
    let max = 0;
    for (const b of bins) max = Math.max(max, b);
    const bw = w / bins.length;
    ctx.shadowColor = `rgba(${rgb},0.9)`;
    ctx.shadowBlur = 8;
    for (let i = 0; i < bins.length; i++) {
      if (!bins[i]) continue;
      const bh = Math.max(6, (Math.log1p(bins[i]) / Math.log1p(max)) * (h - 12));
      const grad = ctx.createLinearGradient(0, h - bh, 0, h);
      grad.addColorStop(0, `rgba(${rgb},1)`);
      grad.addColorStop(1, `rgba(${rgb},0.25)`);
      ctx.fillStyle = grad;
      ctx.fillRect(i * bw + 0.5, h - bh - 3, Math.max(1.5, bw - 1), bh);
    }
    ctx.shadowBlur = 0;
  }

  const units = Math.max(1, unitCount());
  const x = (Math.min(state.focus, units) / units) * w;
  ctx.fillStyle = "#fff";
  ctx.shadowColor = "#fff";
  ctx.shadowBlur = 8;
  ctx.fillRect(x - 1, 0, 2, h);
  ctx.shadowBlur = 0;
}

function jumpToMap(evt) {
  const r = el.map.getBoundingClientRect();
  const units = unitCount();
  const target = Math.floor(((evt.clientX - r.left) / r.width) * units);
  if (state.hits.length) {
    let best = 0;
    for (let i = 1; i < state.hits.length; i++) {
      if (Math.abs(unitOfRaw(state.hits[i]) - target) < Math.abs(unitOfRaw(state.hits[best]) - target)) best = i;
    }
    if (Math.abs(unitOfRaw(state.hits[best]) - target) < units * 0.02) return setActive(best);
  }
  state.active = -1;
  state.focus = Math.max(0, Math.min(units - 1, target));
  renderTape();
  renderHits();
  drawMap();
}

function letterCounts() {
  const c = state.counts;
  if (!c) return null;
  if (rawKind() === "26") return { counts: Array.from(c), gaps: 0, total: c.reduce((a, b) => a + b, 0) };
  if (state.kind === "word" && state.mode === "pairs") {
    const counts = new Array(26).fill(0);
    let total = 0;
    for (let v = 0; v < 100; v++) {
      total += c[10 + v];
      if (v >= 1 && v <= 26) counts[v - 1] = c[10 + v];
    }
    return { counts, gaps: total - counts.reduce((a, b) => a + b, 0), total };
  }
  const counts = new Array(26).fill(0);
  for (let d = 0; d < 10; d++) counts[d] = c[d];
  return { counts, gaps: 0, total: counts.reduce((a, b) => a + b, 0) };
}

function renderFreq() {
  const data = letterCounts();
  if (!el.freq.children.length) {
    el.freq.innerHTML = [...ALPHA].map((c) => `<div class="bar"><div class="bar-fill"></div><div class="bar-label">${c}</div></div>`).join("");
  }
  if (!data) return;
  const numeric = state.kind === "num";
  const size = numeric ? 10 : MODES[state.mode].letters;
  const labels = numeric ? "0123456789" : ALPHA;
  const max = Math.max(...data.counts.slice(0, size), 1);
  const want = new Set(state.query);
  [...el.freq.children].forEach((bar, i) => {
    bar.querySelector(".bar-fill").style.height = `${i < size ? (data.counts[i] / max) * 100 : 0}%`;
    bar.querySelector(".bar-label").textContent = i < size ? labels[i] : "";
    bar.classList.toggle("on", i < size && want.has(labels[i]));
    bar.title = i < size ? `${labels[i]}: ${fmt.format(data.counts[i])}` : "";
  });
  el.freqHint.textContent = `${compact(data.total)} Zeichen`;
  const ideal = (data.total - data.gaps) / size;
  let dev = 0;
  let top = 0;
  for (let i = 0; i < size; i++) {
    dev = Math.max(dev, Math.abs(data.counts[i] - ideal) / ideal);
    if (data.counts[i] > data.counts[top]) top = i;
  }
  let text = `Häufigstes Zeichen: <b>${labels[top]}</b> (${fmt.format(data.counts[top])}×). Größte Abweichung von der Gleichverteilung: <b>${(dev * 100).toLocaleString("de-DE", { maximumFractionDigits: 2 })} %</b>.`;
  if (data.gaps) text += ` ${Math.round((data.gaps / data.total) * 100)} % der Paare sind Lücken.`;
  el.freqFoot.innerHTML = text;
}

const galaxy = (() => {
  const c = el.galaxy;
  const ctx = c.getContext("2d");
  let pts = [];
  let w = 0;
  let angle = 0;
  let visible = true;
  let born = 0;
  let mouse = null;
  let hitSet = new Set();
  let activeSet = new Set();
  let hoverIdx = -1;

  function resize() {
    const dpr = devicePixelRatio || 1;
    w = c.clientWidth;
    c.width = w * dpr;
    c.height = w * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
  }

  function unitAt(i) {
    const kind = rawKind();
    const head = state.head[kind];
    if (kind === "26") return { ch: head[i], code: (head.charCodeAt(i) - 65) / 26 };
    if (state.kind === "num") return { ch: head[i], code: (head.charCodeAt(i) - 48) / 10 };
    if (state.mode === "digits") {
      const d = head.charCodeAt(i) - 48;
      return { ch: ALPHA[d], code: d / 10 };
    }
    const v = Number(head.substr(i * 2, 2));
    return v >= 1 && v <= 26 ? { ch: ALPHA[v - 1], code: (v - 1) / 26 } : { ch: GAP, code: -1 };
  }

  function build() {
    if (!state.meta) return;
    const n = Math.min(GALAXY_POINTS, unitCount());
    const scale = (w / 2 - 12) / Math.sqrt(Math.max(1, n));
    pts = new Array(n);
    for (let i = 0; i < n; i++) pts[i] = { r: scale * Math.sqrt(i + 0.5), t: i * 2.39996323, ...unitAt(i) };
  }

  function refresh() {
    build();
    hitSet = new Set();
    activeSet = new Set();
    const q = state.query.length;
    for (const h of state.hits) {
      const u = unitOfRaw(h);
      if (u >= pts.length) break;
      for (let k = 0; k < q; k++) hitSet.add(u + k);
    }
    if (state.active >= 0) for (let k = 0; k < q; k++) activeSet.add(unitOfRaw(state.hits[state.active]) + k);
    born = performance.now();
    const shown = state.hits.filter((h) => unitOfRaw(h) < pts.length).length;
    el.galaxyHint.textContent = `erste ${fmt.format(pts.length)} Zeichen${state.query ? ` · ${fmt.format(shown)} Treffer` : ""}`;
  }

  const pos = (p, a) => [w / 2 + Math.cos(p.t + a) * p.r, w / 2 + Math.sin(p.t + a) * p.r];

  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible || !w) return;
    if (!reduced) angle += 0.0008;
    const grow = reduced ? 1 : Math.min(1, (now - born) / 1300);
    const limit = Math.floor(pts.length * (1 - Math.pow(1 - grow, 3)));
    const rgb = accentRgb();
    ctx.clearRect(0, 0, w, w);
    const dim = state.query ? 0.35 : 1;
    for (let i = 0; i < limit; i++) {
      if (hitSet.has(i)) continue;
      const p = pts[i];
      const [x, y] = pos(p, angle);
      if (p.code < 0) {
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);
        continue;
      }
      ctx.fillStyle = `rgba(${p.code > 0.5 ? rgb : "255,255,255"},${(0.18 + p.code * 0.5) * dim})`;
      const s = 1.1 + (1 - i / pts.length) * 1.5;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
    const pulse = 0.6 + 0.4 * Math.sin(now / 280);
    for (const i of hitSet) {
      if (i >= limit) continue;
      const [x, y] = pos(pts[i], angle);
      const on = activeSet.has(i);
      ctx.beginPath();
      ctx.arc(x, y, on ? 4 + pulse * 2 : 2.8, 0, Math.PI * 2);
      ctx.fillStyle = on ? "#fff" : `rgb(${rgb})`;
      ctx.shadowColor = on ? "#fff" : `rgb(${rgb})`;
      ctx.shadowBlur = on ? 20 : 10;
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    if (mouse) hover();
  }

  function hover() {
    let best = -1;
    let bd = 100;
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pos(pts[i], angle);
      const d = (x - mouse.x) ** 2 + (y - mouse.y) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    hoverIdx = best;
    if (best < 0) {
      el.galaxyTip.style.opacity = 0;
      return;
    }
    const [x, y] = pos(pts[best], angle);
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    el.galaxyTip.style.left = `${x}px`;
    el.galaxyTip.style.top = `${y}px`;
    el.galaxyTip.style.opacity = 1;
    el.galaxyTip.innerHTML = `<b>${pts[best].ch}</b>Stelle ${fmt.format(placeOfUnit(best))}`;
  }

  c.addEventListener("mousemove", (e) => {
    const r = c.getBoundingClientRect();
    mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
  });
  c.addEventListener("mouseleave", () => {
    mouse = null;
    hoverIdx = -1;
    el.galaxyTip.style.opacity = 0;
  });
  c.addEventListener("click", () => {
    if (hoverIdx < 0) return;
    const hit = state.hits.findIndex((h) => hoverIdx >= unitOfRaw(h) && hoverIdx < unitOfRaw(h) + state.query.length);
    if (hit >= 0) return setActive(hit);
    state.active = -1;
    state.focus = hoverIdx;
    renderTape();
    drawMap();
  });

  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(c);
  new ResizeObserver(resize).observe(c);
  requestAnimationFrame(frame);
  return { refresh };
})();

function startHero() {
  const n = 40;
  const dec = "3," + state.head[10].slice(0, n);
  const b26 = "3," + state.head[26].slice(0, n);
  el.heroStream.innerHTML = [...dec].map((c) => `<span>${c}</span>`).join("");
  const spans = [...el.heroStream.children];
  const glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let letters = false;
  const flip = () => {
    letters = !letters;
    const target = letters ? b26 : dec;
    spans.forEach((s, i) => {
      if (i < 2) return;
      setTimeout(() => {
        let k = 0;
        s.classList.add("flip");
        const iv = setInterval(() => {
          s.textContent = glyphs[(Math.random() * glyphs.length) | 0];
          if (++k > 5) {
            clearInterval(iv);
            s.textContent = target[i];
            s.classList.remove("flip");
            s.classList.toggle("letter", letters);
          }
        }, 38);
      }, i * 42);
    });
  };
  if (!reduced) setInterval(flip, 4200);
  setTimeout(flip, 900);
}

function setMode(mode) {
  if (!MODES[mode]) return;
  state.mode = mode;
  const i = Object.keys(MODES).indexOf(mode);
  el.modes.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", b.dataset.mode === mode));
  el.modes.querySelector(".modes-glider").style.transform = `translateX(calc(${i * 100}% + ${i * 4}px))`;
  el.modeHint.textContent = MODES[mode].hint;
  document.querySelectorAll(".card").forEach((c) => c.classList.toggle("active", c.dataset.mode === mode));
}

function setPlaces(p, fromSlider = false) {
  state.places = Math.max(10 ** MIN_EXP, Math.min(maxPlaces(), Math.round(p)));
  if (!fromSlider) el.places.value = sliderFromPlaces(state.places);
  el.places.style.setProperty("--fill", `${(el.places.value / 10).toFixed(1)}%`);
  el.placesOut.textContent = fmt.format(state.places);
  el.ticks.querySelectorAll("button").forEach((b) => b.classList.toggle("on", Number(b.dataset.places) === state.places));
}

function setQuery(raw) {
  const { kind, q } = normalize(raw);
  state.kind = q ? kind : "word";
  state.query = q;
}

function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.has("m")) setMode(h.get("m"));
  if (h.has("n")) setPlaces(Number(h.get("n")) || state.places);
  if (h.has("q")) {
    el.query.value = h.get("q");
    setQuery(h.get("q"));
  }
}

function writeHash() {
  const h = new URLSearchParams();
  if (state.query) h.set("q", state.query);
  h.set("n", state.places);
  h.set("m", state.mode);
  history.replaceState(null, "", `#${h}`);
}

function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

function buildTicks() {
  const marks = [];
  for (let e = MIN_EXP; e <= Math.floor(maxExp()); e++) marks.push(10 ** e);
  const label = (v) => (v >= 1e9 ? `${v / 1e9}B` : v >= 1e6 ? `${v / 1e6}M` : v >= 1e3 ? `${v / 1e3}K` : String(v));
  el.ticks.innerHTML = marks.map((v) => `<button type="button" data-places="${v}">${label(v)}</button>`).join("");
}

function bind() {
  el.chips.innerHTML = CHIPS.map((c) => `<button type="button">${c}</button>`).join("");
  el.chips.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    el.query.value = b.textContent;
    setQuery(b.textContent);
    run();
  });

  el.searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    setQuery(el.query.value);
    run();
    el.query.blur();
  });
  el.query.addEventListener(
    "input",
    debounce(() => {
      setQuery(el.query.value);
      run();
    }, 320)
  );

  const slide = debounce(() => run({ animate: false }), 220);
  el.places.addEventListener("input", () => {
    setPlaces(placesFromSlider(Number(el.places.value)), true);
    slide();
  });
  el.ticks.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    setPlaces(Number(b.dataset.places));
    run({ animate: false });
  });

  el.modes.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    setMode(b.dataset.mode);
    run();
  });
  document.querySelectorAll(".card").forEach((c) =>
    c.addEventListener("click", () => {
      setMode(c.dataset.mode);
      run();
      $("control").scrollIntoView({ behavior: "smooth", block: "center" });
    })
  );

  el.hitPrev.addEventListener("click", () => step(-1));
  el.hitNext.addEventListener("click", () => step(1));
  el.hits.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) setActive(Number(b.dataset.i));
  });
  el.map.addEventListener("click", jumpToMap);

  addEventListener("keydown", (e) => {
    if (document.activeElement === el.query) return;
    if (e.key === "ArrowLeft") step(-1);
    if (e.key === "ArrowRight") step(1);
    if (e.key === "/") {
      e.preventDefault();
      el.query.focus();
    }
  });

  addEventListener(
    "resize",
    debounce(() => {
      renderTape();
      drawMap();
    }, 150)
  );

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    },
    { threshold: 0.1 }
  );
  document.querySelectorAll("main > *").forEach((n) => {
    n.classList.add("reveal");
    io.observe(n);
  });
}

async function load() {
  el.loaderText.textContent = "Lade Metadaten …";
  state.meta = await (await fetch("data/meta.json")).json();
  worker.postMessage({ type: "init", meta: state.meta });
  el.loaderFill.style.width = "20%";
  el.loaderText.textContent = "Entpacke die ersten Stellen …";
  const [dec, b26] = await Promise.all([slice("10", 0, 12000), slice("26", 0, 12000)]);
  if (!dec || !b26) throw new Error("data");
  state.head = { 10: dec, 26: b26 };
  el.loaderFill.style.width = "100%";
  el.badgeText.textContent = `${fmt.format(state.meta.digits)} Nachkommastellen`;
  el.footText.textContent = `${compact(state.meta.digits)} Dezimalstellen aus y-cruncher · ${compact(state.meta.letters)} Basis-26-Stellen per Chudnovsky`;
}

async function main() {
  startBackdrop($("backdrop"), reduced);
  try {
    await load();
  } catch {
    el.loaderText.textContent = "Konnte die Ziffern nicht laden. Läuft die Seite über einen Webserver?";
    return;
  }
  buildTicks();
  setMode("b26");
  setPlaces(state.places);
  bind();
  readHash();
  startHero();
  run();
  renderFreq();
  el.loader.classList.add("done");
}

main();
