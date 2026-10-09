const VERT = `
attribute vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }
`;

const FRAG = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
uniform vec2 res;
uniform vec2 mouse;
uniform float time;
uniform vec3 accent;
uniform float scale;

float random(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123); }

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(random(i), random(i + vec2(1.0, 0.0)), f.x), mix(random(i + vec2(0.0, 1.0)), random(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = rot * p * 2.0 + vec2(time * 0.018, time * 0.012);
    a *= 0.56;
  }
  return v;
}

float contour(float h, float width) {
  float cell = fract(h);
  float d = min(cell, 1.0 - cell);
  float aa = max(fwidth(h) * 1.35, 0.002);
  return 1.0 - smoothstep(width, width + aa, d);
}

void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 uv = px / res;
  vec2 p = (px - res * 0.5) / res.y;
  p *= 6.2;
  p.x += sin(time * 0.10) * 0.28;
  p.y += cos(time * 0.08) * 0.16;

  float a = fbm(p * 0.42 + vec2(time * 0.035, -time * 0.018));
  float b = fbm(p * 0.82 - vec2(time * 0.020, time * 0.026));
  float h = (a * 0.72 + b * 0.38) * 9.0;

  float line = contour(h, 0.030);
  float soft = contour(h + 0.035, 0.070) * 0.35;
  vec2 grad = vec2(dFdx(h), dFdy(h));
  float flow = smoothstep(0.015, 0.085, length(grad));
  float glow = smoothstep(0.0, 1.0, line + soft) * (0.34 + flow * 0.42);

  float vignette = smoothstep(0.95, 0.18, length(uv - 0.5));
  float fade = 0.38 + vignette * 0.92;

  vec3 col = vec3(0.043, 0.043, 0.051);
  float lines = (line * 0.92 + soft * 0.28 + glow * 0.38) * fade;
  col += mix(vec3(1.0), accent, 0.35) * lines * 0.075;

  float spacing = 22.0 * scale;
  float rowH = spacing * 0.8660254;
  vec2 q = vec2(px.x, res.y - px.y);
  float row = floor(q.y / rowH);
  float off = mod(row, 2.0) * spacing * 0.5;
  float c = floor((q.x - off) / spacing);
  vec2 node = vec2((c + 0.5) * spacing + off, (row + 0.5) * rowH);
  float reach = 260.0 * scale;
  float w = 1.0 - clamp(length(node - mouse) / reach, 0.0, 1.0);
  w = w * w * (3.0 - 2.0 * w);
  float wave = 0.5 + 0.5 * sin(time * 0.6 + node.x * 0.004 + node.y * 0.006);
  float radius = mix(0.55 * scale, 3.2 * scale, w) + wave * 0.25 * scale;
  float d = length(q - node);
  float dotA = 1.0 - smoothstep(radius - 0.6, radius + 0.6, d);
  col += mix(vec3(1.0), accent, w) * dotA * (0.035 + w * 0.32) * (0.4 + vignette * 0.6);

  col += accent * 0.06 * smoothstep(0.9, 0.0, length((uv - vec2(0.5, 1.05)) * vec2(1.0, 1.6)));

  gl_FragColor = vec4(col, 1.0);
}
`;

export function startBackdrop(canvas, reduced) {
  const gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: false });
  if (!gl) return;
  gl.getExtension("OES_standard_derivatives");

  const shader = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "a");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const u = (name) => gl.getUniformLocation(prog, name);
  const uRes = u("res");
  const uMouse = u("mouse");
  const uTime = u("time");
  const uAccent = u("accent");
  const uScale = u("scale");

  const accent = getComputedStyle(document.documentElement)
    .getPropertyValue("--accent-rgb")
    .split(",")
    .map((v) => Number(v) / 255);
  gl.uniform3f(uAccent, accent[0], accent[1], accent[2]);

  let dpr = 1;
  const target = { x: -9999, y: -9999 };
  const mouse = { x: -9999, y: -9999 };

  const resize = () => {
    dpr = Math.min(1.5, devicePixelRatio || 1);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uScale, dpr);
  };
  addEventListener("resize", resize);
  addEventListener("pointermove", (e) => {
    target.x = e.clientX * dpr;
    target.y = e.clientY * dpr;
    if (mouse.x < -9000) Object.assign(mouse, target);
  });
  resize();

  const start = performance.now();
  const frame = (now) => {
    mouse.x += (target.x - mouse.x) * 0.12;
    mouse.y += (target.y - mouse.y) * 0.12;
    gl.uniform2f(uMouse, mouse.x, mouse.y);
    gl.uniform1f(uTime, reduced ? 12 : (now - start) / 1000);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (!reduced) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
