const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GAP = "·";
const LOG26 = Math.log(10) / Math.log(26);
const MIN_EXP = 2;
const MAX_EXP = 6;
const GALAXY_POINTS = 5000;
const HIT_LIMIT = 200000;
const fmt = new Intl.NumberFormat("de-DE");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

const MODES = {
  b26: { hint: "A = 0 … Z = 25", alphabet: ALPHA },
  pairs: { hint: "01 = A … 26 = Z", alphabet: ALPHA },
  digits: { hint: "0 = A … 9 = J", alphabet: ALPHA.slice(0, 10) },
};

const CHIPS = ["PI", "OK", "TEE", "WOW", "MAUS", "ZEIT", "GOTT", "JAZZ", "SONNE", "MATHE", "999999", "314159"];

const $ = (id) => document.getElementById(id);
const el = {
  loader: $("loader"),
  loaderFill: $("loader-fill"),
  loaderText: $("loader-text"),
  hero: $("hero-stream"),
  form: $("search-form"),
  query: $("query"),
  chips: $("chips"),
  places: $("places"),
  placesOut: $("places-out"),
  modes: $("modes"),
  modeHint: $("mode-hint"),
  verdictWord: $("verdict-word"),
  verdictText: $("verdict-text"),
  count: $("s-count"),
  first: $("s-first"),
  expect: $("s-expect"),
  chance: $("s-chance"),
  tape: $("tape"),
  hitLabel: $("hit-label"),
  prev: $("hit-prev"),
  next: $("hit-next"),
  map: $("map"),
  mapEnd: $("map-end"),
  hits: $("hits"),
  galaxy: $("galaxy"),
  galaxyTip: $("galaxy-tip"),
  galaxyHint: $("galaxy-hint"),
  freq: $("freq"),
  freqHint: $("freq-hint"),
  freqFoot: $("freq-foot"),
};

const state = {
  dec: "",
  streams: {},
  mode: "b26",
  places: 100000,
  query: "",
  kind: "word",
  hits: [],
  total: 0,
  active: -1,
  focus: 0,
};

async function fetchText(url, onProgress) {
  const res = await fetch(url);
  const total = Number(res.headers.get("content-length")) || 0;
  if (!res.body || !total) {
    const text = await res.text();
    onProgress(1);
    return text;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress(Math.min(1, got / total));
  }
  return new TextDecoder().decode(await new Blob(chunks).arrayBuffer());
}

async function load() {
  const progress = [0, 0];
  const update = (i) => (p) => {
    progress[i] = p;
    el.loaderFill.style.width = `${((progress[0] + progress[1]) / 2) * 100}%`;
  };
  const [dec, b26] = await Promise.all([
    fetchText("data/pi-10.txt", update(0)),
    fetchText("data/pi-26.txt", update(1)),
  ]);
  state.dec = dec.trim();
  el.loaderText.textContent = "Übersetze Ziffern in Buchstaben …";
  await new Promise((r) => setTimeout(r, 30));

  const pairs = new Array(state.dec.length >> 1);
  for (let i = 0; i < pairs.length; i++) {
    const v = (state.dec.charCodeAt(2 * i) - 48) * 10 + state.dec.charCodeAt(2 * i + 1) - 48;
    pairs[i] = v >= 1 && v <= 26 ? ALPHA[v - 1] : GAP;
  }
  const digits = new Array(state.dec.length);
  for (let i = 0; i < digits.length; i++) digits[i] = ALPHA[state.dec.charCodeAt(i) - 48];

  state.streams = { b26: b26.trim(), pairs: pairs.join(""), digits: digits.join("") };
}

function streamFor(kind = state.kind, mode = state.mode) {
  return kind === "num" ? state.dec : state.streams[mode];
}

function lengthFor(kind = state.kind, mode = state.mode, places = state.places) {
  if (kind === "num") return places;
  if (mode === "b26") return Math.min(state.streams.b26.length, Math.floor(places * LOG26));
  if (mode === "pairs") return Math.floor(places / 2);
  return places;
}

function placeOf(i, kind = state.kind, mode = state.mode) {
  if (kind === "num") return i + 1;
  if (mode === "pairs") return 2 * i + 1;
  return i + 1;
}

function sourceOf(i) {
  if (state.kind === "num") return "";
  if (state.mode === "pairs") return state.dec.substr(2 * i, 2);
  if (state.mode === "digits") return state.dec[i];
  return "";
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

function placesFromSlider(v) {
  const exp = MIN_EXP + ((MAX_EXP - MIN_EXP) * v) / 1000;
  const raw = Math.pow(10, exp);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)) - 1);
  return Math.min(10 ** MAX_EXP, Math.max(10 ** MIN_EXP, Math.round(raw / mag) * mag));
}

function sliderFromPlaces(p) {
  return Math.round(((Math.log10(p) - MIN_EXP) / (MAX_EXP - MIN_EXP)) * 1000);
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
  const units = [[1e12, "Bio."], [1e9, "Mrd."], [1e6, "Mio."]];
  if (n >= 1e15) {
    const e = Math.floor(Math.log10(n));
    return `10${superscript(e)}`;
  }
  for (const [v, u] of units) if (n >= v) return `${(n / v).toLocaleString("de-DE", { maximumFractionDigits: 1 })} ${u}`;
  return fmt.format(n);
}

function superscript(n) {
  const map = "⁰¹²³⁴⁵⁶⁷⁸⁹";
  return String(n).split("").map((c) => map[c]).join("");
}

function search() {
  state.hits = [];
  state.total = 0;
  state.active = -1;
  const q = state.query;
  if (!q) return;
  const stream = streamFor();
  const end = lengthFor() - q.length;
  let i = stream.indexOf(q);
  while (i !== -1 && i <= end) {
    if (state.hits.length < HIT_LIMIT) state.hits.push(i);
    state.total++;
    i = stream.indexOf(q, i + 1);
  }
  if (state.hits.length) {
    state.active = 0;
    state.focus = state.hits[0];
  }
}

function invalidLetters() {
  if (state.kind === "num" || state.mode !== "digits") return "";
  return [...new Set(state.query.replace(/[A-J]/g, ""))].join("");
}

function run({ animate = true } = {}) {
  search();
  renderVerdict(animate);
  renderStats();
  renderTape();
  renderHits();
  drawMap();
  renderFreq();
  galaxy.refresh();
  writeHash();
}

function renderVerdict(animate) {
  const q = state.query;
  const word = el.verdictWord;
  word.className = "verdict-word";
  if (!q) {
    word.innerHTML = "";
    el.verdictText.innerHTML = `Tippe ein Wort ein, oder klicke dich durch das Band von <b>${fmt.format(lengthFor())}</b> Zeichen.`;
    return;
  }
  const found = state.total > 0;
  word.classList.add(found ? "found" : "missing");
  word.innerHTML = [...q].map((c, i) => `<span style="animation-delay:${animate ? i * 55 : 0}ms">${c}</span>`).join("");

  const bad = invalidLetters();
  if (bad) {
    el.verdictText.innerHTML = `Im Alphabet <b>A–J</b> gibt es kein <b>${bad.split("").join(", ")}</b>. Probier Basis 26 oder Paare.`;
  } else if (found) {
    const where = fmt.format(placeOf(state.hits[0]));
    const label = state.kind === "word" && state.mode === "b26" ? "Basis-26-Stelle" : "Nachkommastelle";
    el.verdictText.innerHTML = `steht in π – zum ersten Mal ab der <b>${where}.</b> ${label}.`;
  } else {
    el.verdictText.innerHTML = `kommt in den ersten <b>${fmt.format(state.places)}</b> Nachkommastellen nicht vor. Zieh den Regler weiter auf.`;
  }
}

function renderStats() {
  const q = state.query;
  if (!q) {
    for (const k of ["count", "first", "expect", "chance"]) el[k].textContent = "–";
    return;
  }
  countUp(el.count, state.total);
  el.first.textContent = state.total ? fmt.format(placeOf(state.hits[0])) : "–";
  const exp = expectedPlace(q.length);
  el.expect.textContent = compact(exp);
  const p = invalidLetters() ? 0 : 1 - Math.exp(-state.places / exp);
  el.chance.textContent = p > 0.9995 ? "≈ 100 %" : p < 0.0005 && p > 0 ? "< 0,1 %" : `${(p * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`;
}

function countUp(node, target) {
  const start = performance.now();
  const dur = reduced ? 0 : 700;
  const tick = (t) => {
    const k = dur ? Math.min(1, (t - start) / dur) : 1;
    const e = 1 - Math.pow(1 - k, 3);
    node.textContent = fmt.format(Math.round(target * e));
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function tapeWidth() {
  const cell = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cell")) || 46;
  const n = Math.floor(el.tape.clientWidth / cell);
  return Math.max(7, n % 2 ? n : n - 1);
}

function renderTape() {
  const stream = streamFor();
  const len = lengthFor();
  const n = tapeWidth();
  const qlen = state.query.length;
  const centre = Math.min(Math.max(0, state.focus + Math.floor(qlen / 2)), Math.max(0, len - 1));
  const start = centre - Math.floor(n / 2);
  const activeStart = state.active >= 0 ? state.hits[state.active] : -1;

  const nearby = new Set();
  if (qlen) {
    for (const h of state.hits) {
      if (h + qlen < start) continue;
      if (h > start + n) break;
      for (let k = 0; k < qlen; k++) nearby.add(h + k);
    }
  }

  const html = [];
  for (let j = 0; j < n; j++) {
    const i = start + j;
    if (i < 0 || i >= len) {
      html.push(`<div class="cell" style="visibility:hidden"><span class="cell-ch">·</span></div>`);
      continue;
    }
    const ch = stream[i];
    const cls = ["cell"];
    if (ch === GAP) cls.push("gap");
    if (activeStart >= 0 && i >= activeStart && i < activeStart + qlen) {
      cls.push("hit");
      if (qlen > 1) cls.push(i === activeStart ? "first" : i === activeStart + qlen - 1 ? "last" : "mid");
    } else if (nearby.has(i)) cls.push("other");
    const delay = reduced ? 0 : Math.abs(j - (n >> 1)) * 18;
    const idx = i % 10 === 0 || cls.includes("hit") ?fmt.format(placeOf(i)) : "";
    html.push(
      `<div class="${cls.join(" ")}" style="animation-delay:${delay}ms"><span class="cell-ch">${ch}</span><span class="cell-src">${sourceOf(i)}</span><span class="cell-idx">${idx}</span></div>`
    );
  }
  el.tape.innerHTML = html.join("");

  if (state.active >= 0) {
    el.hitLabel.textContent = `Treffer ${fmt.format(state.active + 1)} / ${fmt.format(state.total)}`;
  } else {
    el.hitLabel.textContent = `Stelle ${fmt.format(placeOf(Math.min(state.focus, len - 1)))}`;
  }
}

function renderHits() {
  const shown = state.hits.slice(0, 120);
  const html = shown.map((h, i) => `<button type="button" data-i="${i}" class="${i === state.active ? "active" : ""}">${fmt.format(placeOf(h))}</button>`);
  if (state.total > shown.length) html.push(`<span class="more">+ ${fmt.format(state.total - shown.length)} weitere</span>`);
  el.hits.innerHTML = html.join("");
}

function setActive(i) {
  if (!state.hits.length) return;
  state.active = (i + state.hits.length) % state.hits.length;
  state.focus = state.hits[state.active];
  renderTape();
  drawMap();
  el.hits.querySelectorAll("button").forEach((b) => b.classList.toggle("active", Number(b.dataset.i) === state.active));
  el.hits.querySelector("button.active")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  galaxy.refresh();
}

function step(dir) {
  if (state.hits.length) return setActive(state.active + dir);
  const len = lengthFor();
  state.focus = Math.min(len - 1, Math.max(0, state.focus + dir * tapeWidth()));
  renderTape();
  drawMap();
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
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.fillRect(0, 0, w, h);

  const len = lengthFor();
  el.mapEnd.textContent = fmt.format(state.places);
  const bins = new Float32Array(Math.max(1, Math.floor(w / 3)));
  for (const hpos of state.hits) bins[Math.min(bins.length - 1, Math.floor((hpos / len) * bins.length))]++;
  let max = 0;
  for (const b of bins) max = Math.max(max, b);

  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, "#8b5cf6");
  grad.addColorStop(0.5, "#f472b6");
  grad.addColorStop(1, "#fbbf24");
  ctx.fillStyle = grad;
  ctx.shadowColor = "rgba(244,114,182,0.8)";
  ctx.shadowBlur = 8;
  const bw = w / bins.length;
  for (let i = 0; i < bins.length; i++) {
    if (!bins[i]) continue;
    const bh = Math.max(6, (Math.log1p(bins[i]) / Math.log1p(max)) * (h - 10));
    ctx.fillRect(i * bw + 0.5, h - bh - 2, Math.max(1.5, bw - 1), bh);
  }
  ctx.shadowBlur = 0;

  const x = (Math.min(state.focus, len) / len) * w;
  ctx.fillStyle = "#22d3ee";
  ctx.fillRect(x - 1, 0, 2, h);
  ctx.beginPath();
  ctx.moveTo(x - 6, 0);
  ctx.lineTo(x + 6, 0);
  ctx.lineTo(x, 7);
  ctx.fill();
}

function jumpToMap(evt) {
  const r = el.map.getBoundingClientRect();
  const len = lengthFor();
  const target = Math.floor(((evt.clientX - r.left) / r.width) * len);
  if (state.hits.length) {
    let best = 0;
    for (let i = 1; i < state.hits.length; i++) if (Math.abs(state.hits[i] - target) < Math.abs(state.hits[best] - target)) best = i;
    const near = Math.abs(state.hits[best] - target) < len * 0.02;
    if (near) return setActive(best);
  }
  state.active = -1;
  state.focus = Math.max(0, Math.min(len - 1, target));
  renderTape();
  renderHits();
  drawMap();
}

function renderFreq() {
  const stream = streamFor("word");
  const len = lengthFor("word");
  const counts = new Uint32Array(27);
  for (let i = 0; i < len; i++) {
    const c = stream.charCodeAt(i) - 65;
    counts[c >= 0 && c < 26 ? c : 26]++;
  }
  const letters = MODES[state.mode].alphabet;
  let max = 0;
  for (let i = 0; i < 26; i++) max = Math.max(max, counts[i]);
  const want = new Set(state.kind === "word" ? state.query : "");

  if (!el.freq.children.length) {
    el.freq.innerHTML = [...ALPHA].map((c) => `<div class="bar" data-c="${c}"><div class="bar-fill"></div><div class="bar-label">${c}</div></div>`).join("");
  }
  [...el.freq.children].forEach((bar, i) => {
    const pct = max ? (counts[i] / max) * 100 : 0;
    bar.querySelector(".bar-fill").style.height = `${letters.includes(ALPHA[i]) ? pct : 0}%`;
    bar.classList.toggle("on", want.has(ALPHA[i]));
    bar.title = `${ALPHA[i]}: ${fmt.format(counts[i])}`;
  });

  el.freqHint.textContent = `${fmt.format(len)} Zeichen`;
  const ideal = len / letters.length;
  let dev = 0;
  for (let i = 0; i < letters.length; i++) dev = Math.max(dev, Math.abs(counts[i] - ideal) / ideal);
  const top = [...letters].map((c, i) => [c, counts[i]]).sort((a, b) => b[1] - a[1])[0];
  let text = `Häufigster Buchstabe: <b>${top[0]}</b> (${fmt.format(top[1])}×). Maximale Abweichung vom Gleichverteilungs-Ideal: <b>${(dev * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %</b>.`;
  if (state.mode === "pairs") text += ` ${Math.round((counts[26] / len) * 100)} % der Paare sind Lücken.`;
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

  function resize() {
    const dpr = devicePixelRatio || 1;
    w = c.clientWidth;
    c.width = w * dpr;
    c.height = w * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
  }

  function build() {
    const stream = streamFor();
    const n = Math.min(GALAXY_POINTS, lengthFor());
    const scale = (w / 2 - 12) / Math.sqrt(n);
    pts = new Array(n);
    for (let i = 0; i < n; i++) {
      const ch = stream[i];
      const code = state.kind === "num" ? (ch.charCodeAt(0) - 48) / 10 : ch === GAP ? -1 : (ch.charCodeAt(0) - 65) / MODES[state.mode].alphabet.length;
      pts[i] = { r: scale * Math.sqrt(i + 0.5), t: i * 2.39996323, code, ch };
    }
  }

  function refresh() {
    build();
    hitSet = new Set();
    activeSet = new Set();
    const q = state.query.length;
    for (const h of state.hits) {
      if (h >= pts.length) break;
      for (let k = 0; k < q; k++) hitSet.add(h + k);
    }
    if (state.active >= 0) for (let k = 0; k < q; k++) activeSet.add(state.hits[state.active] + k);
    born = performance.now();
    const shown = state.hits.filter((h) => h < pts.length).length;
    el.galaxyHint.textContent = `erste ${fmt.format(pts.length)} Zeichen${state.query ? ` · ${fmt.format(shown)} Treffer` : ""}`;
  }

  function pos(p, a) {
    const t = p.t + a;
    return [w / 2 + Math.cos(t) * p.r, w / 2 + Math.sin(t) * p.r];
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible || !w) return;
    if (!reduced) angle += 0.0009;
    const grow = reduced ? 1 : Math.min(1, (now - born) / 1400);
    ctx.clearRect(0, 0, w, w);
    const limit = Math.floor(pts.length * (1 - Math.pow(1 - grow, 3)));
    for (let i = 0; i < limit; i++) {
      const p = pts[i];
      if (hitSet.has(i)) continue;
      const [x, y] = pos(p, angle);
      if (p.code < 0) {
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);
        continue;
      }
      ctx.fillStyle = `hsla(${250 + p.code * 170}, 85%, ${55 + p.code * 10}%, ${state.query ? 0.28 : 0.75})`;
      const s = 1.2 + (1 - i / pts.length) * 1.4;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
    const pulse = 0.6 + 0.4 * Math.sin(now / 300);
    for (const i of hitSet) {
      if (i >= limit) continue;
      const [x, y] = pos(pts[i], angle);
      const on = activeSet.has(i);
      ctx.beginPath();
      ctx.arc(x, y, on ? 4.5 + pulse * 2 : 3, 0, Math.PI * 2);
      ctx.fillStyle = on ? "#fbbf24" : "#22d3ee";
      ctx.shadowColor = on ? "#fbbf24" : "#22d3ee";
      ctx.shadowBlur = on ? 22 : 10;
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
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) {
      el.galaxyTip.style.opacity = 0;
      return;
    }
    const [x, y] = pos(pts[best], angle);
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    el.galaxyTip.style.left = `${x}px`;
    el.galaxyTip.style.top = `${y}px`;
    el.galaxyTip.style.opacity = 1;
    el.galaxyTip.innerHTML = `<b>${pts[best].ch}</b>Stelle ${fmt.format(placeOf(best))}`;
    el.galaxyTip.dataset.i = best;
  }

  c.addEventListener("mousemove", (e) => {
    const r = c.getBoundingClientRect();
    mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
  });
  c.addEventListener("mouseleave", () => {
    mouse = null;
    el.galaxyTip.style.opacity = 0;
  });
  c.addEventListener("click", () => {
    const i = Number(el.galaxyTip.dataset.i);
    if (!mouse || Number.isNaN(i)) return;
    const hit = state.hits.findIndex((h) => i >= h && i < h + state.query.length);
    if (hit >= 0) return setActive(hit);
    state.active = -1;
    state.focus = i;
    renderTape();
    drawMap();
    activeSet = new Set();
    el.tape.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(c);
  new ResizeObserver(resize).observe(c);
  requestAnimationFrame(frame);

  return { refresh };
})();

function startHero() {
  const n = 40;
  const dec = "3," + state.dec.slice(0, n);
  const b26 = "3," + state.streams.b26.slice(0, n);
  el.hero.innerHTML = [...dec].map((c) => `<span>${c}</span>`).join("");
  const spans = [...el.hero.children];
  let showLetters = false;
  const glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  const flip = () => {
    showLetters = !showLetters;
    const target = showLetters ? b26 : dec;
    spans.forEach((s, i) => {
      if (i < 2) return;
      const delay = i * 45;
      setTimeout(() => {
        let k = 0;
        s.classList.add("flip");
        const iv = setInterval(() => {
          s.textContent = glyphs[(Math.random() * glyphs.length) | 0];
          if (++k > 5) {
            clearInterval(iv);
            s.textContent = target[i];
            s.classList.remove("flip");
            s.classList.toggle("letter", showLetters);
          }
        }, 40);
      }, delay);
    });
  };
  if (!reduced) setInterval(flip, 4200);
  setTimeout(flip, 900);
}

function startSky() {
  const c = $("sky");
  const ctx = c.getContext("2d");
  const glyphs = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZπ";
  let parts = [];
  let W = 0;
  let H = 0;
  let mx = 0;
  let my = 0;

  const resize = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    W = innerWidth;
    H = innerHeight;
    c.width = W * dpr;
    c.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round((W * H) / 16000);
    parts = Array.from({ length: count }, () => spawn(true));
  };

  const spawn = (anywhere) => {
    const z = Math.random();
    return {
      x: Math.random() * W,
      y: anywhere ? Math.random() * H : H + 20,
      z,
      v: 0.15 + z * 0.5,
      g: glyphs[(Math.random() * glyphs.length) | 0],
      t: Math.random() * 1000,
    };
  };

  addEventListener("resize", resize);
  addEventListener("mousemove", (e) => {
    mx = (e.clientX / W - 0.5) * 2;
    my = (e.clientY / H - 0.5) * 2;
  });
  resize();

  const frame = () => {
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      if (!reduced) {
        p.y -= p.v;
        p.t++;
        if (p.t % 160 === 0) p.g = glyphs[(Math.random() * glyphs.length) | 0];
      }
      if (p.y < -20) Object.assign(p, spawn(false));
      const size = 10 + p.z * 16;
      const x = p.x + mx * p.z * 24;
      const y = p.y + my * p.z * 24;
      ctx.font = `${p.z > 0.7 ? 600 : 400} ${size}px "JetBrains Mono", monospace`;
      const isLetter = p.g >= "A" && p.g <= "Z";
      ctx.fillStyle = isLetter ? `rgba(244,114,182,${0.05 + p.z * 0.16})` : `rgba(167,139,250,${0.04 + p.z * 0.14})`;
      ctx.fillText(p.g, x, y);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function setMode(mode) {
  if (!MODES[mode]) return;
  state.mode = mode;
  const i = Object.keys(MODES).indexOf(mode);
  el.modes.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", b.dataset.mode === mode));
  el.modes.querySelector(".modes-glider").style.transform = `translateX(${i * 100}%)`;
  el.modeHint.textContent = MODES[mode].hint;
  document.querySelectorAll(".card").forEach((c) => c.classList.toggle("active", c.dataset.mode === mode));
}

function setPlaces(p, fromSlider = false) {
  state.places = Math.max(10 ** MIN_EXP, Math.min(10 ** MAX_EXP, p));
  if (!fromSlider) el.places.value = sliderFromPlaces(state.places);
  el.places.style.setProperty("--fill", `${(el.places.value / 10).toFixed(1)}%`);
  el.placesOut.textContent = fmt.format(state.places);
}

function setQuery(raw) {
  const { kind, q } = normalize(raw);
  state.kind = q ? kind : "word";
  state.query = q;
  if (!q) state.focus = 0;
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

function bind() {
  el.chips.innerHTML = CHIPS.map((c) => `<button type="button">${c}</button>`).join("");
  el.chips.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    el.query.value = b.textContent;
    setQuery(b.textContent);
    run();
  });

  el.form.addEventListener("submit", (e) => {
    e.preventDefault();
    setQuery(el.query.value);
    run();
    el.query.blur();
  });
  const live = debounce(() => {
    setQuery(el.query.value);
    run();
  }, 260);
  el.query.addEventListener("input", live);

  const slide = debounce(() => run({ animate: false }), 120);
  el.places.addEventListener("input", () => {
    setPlaces(placesFromSlider(Number(el.places.value)), true);
    slide();
  });
  document.querySelectorAll("[data-places]").forEach((b) =>
    b.addEventListener("click", () => {
      setPlaces(Number(b.dataset.places));
      run({ animate: false });
    })
  );

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

  el.prev.addEventListener("click", () => step(-1));
  el.next.addEventListener("click", () => step(1));
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

  addEventListener("resize", debounce(() => {
    renderTape();
    drawMap();
  }, 150));

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) e.target.classList.add("in");
  }, { threshold: 0.12 });
  document.querySelectorAll("main > *").forEach((n) => {
    n.classList.add("reveal");
    io.observe(n);
  });
}

async function main() {
  startSky();
  setMode("b26");
  setPlaces(state.places);
  try {
    await load();
  } catch (err) {
    el.loaderText.textContent = "Konnte die Ziffern nicht laden. Läuft die Seite über einen Webserver?";
    return;
  }
  bind();
  readHash();
  startHero();
  run();
  el.loader.classList.add("done");
}

main();
