// A ~14 second square promo video, rendered frame by frame and encoded to
// MP4 in the browser. Run `npm run promo` and open the URL it prints.
//   /           renders and saves promo/out/randollm-promo.mp4
//   /?t=7.5     draws a single frame at 7.5 s (for checking a moment)
// The die rolls are real: fetched from the live API before rendering.
import {
  NeutralToneMapping,
  PerspectiveCamera,
  PMREMGenerator,
  Quaternion,
  Scene,
  Vector3,
  WebGLRenderer,
  Mesh,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { BufferTarget, CanvasSource, Mp4OutputFormat, Output } from "mediabunny";
import { FACE_VALUES, contactShadow, faceMaterial, restingPose } from "../site/die.js";

const W = 1080;
const FPS = 30;
const DURATION = 14.5;

const C = {
  bg: "#fbfbfa",
  ink: "#1d1d1f",
  ink2: "#6e6e73",
  red: "#e0261c",
  bubble: "#ececea",
};
const DISPLAY = '"Geist", system-ui, sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, monospace';

// ---------- timing helpers ----------

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const phase = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;
const easeOut = (k) => 1 - (1 - k) ** 3;
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
// Overshoots a little, then settles: for things that pop in.
const easeBack = (k) => 1 + 2.4 * (k - 1) ** 3 + 1.4 * (k - 1) ** 2;
function bounce(k) {
  const n = 7.5625, d = 2.75;
  if (k < 1 / d) return n * k * k;
  if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75;
  if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375;
  return n * (k -= 2.625 / d) * k + 0.984375;
}

// ---------- the 3D die ----------

function makeDie() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = W;
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, W, false);
  renderer.toneMapping = NeutralToneMapping;
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  scene.environment = new PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.03).texture;
  scene.environmentIntensity = 0.9;
  const camera = new PerspectiveCamera(28, 1, 0.1, 50);
  camera.position.set(0, 5.6, 4.4);
  camera.lookAt(0, -0.25, 0);
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  const die = new Mesh(new RoundedBoxGeometry(1.7, 1.7, 1.7, 10, 0.26), FACE_VALUES.map((v) => faceMaterial(v, anisotropy)));
  const shadow = contactShadow();
  scene.add(die, shadow);
  return { canvas, renderer, scene, camera, die, shadow };
}

const IDLE_AXIS = new Vector3(0.35, 1, 0.12).normalize();
const SPIN_A = new Vector3(0.8, 0.3, -0.5).normalize();
const SPIN_B = new Vector3(-0.3, 0.6, 0.75).normalize();
const START = new Quaternion().setFromAxisAngle(new Vector3(1, 0.4, 0.2).normalize(), 2.1);
const tmp = new Quaternion();

// Where the die is and how it's turned at time t.
function diePose(t, rolls) {
  const pose1 = restingPose(rolls[0], 1);
  const pose2 = restingPose(rolls[1], 2);
  const q = new Quaternion();
  let y = 0;

  if (t < 9.3) {
    // Drop in from above, tumbling, and land on the first roll.
    const p = phase(t, 8.15, 9.3);
    const e = easeOut(p);
    q.slerpQuaternions(START, pose1, e).multiply(tmp.setFromAxisAngle(SPIN_A, (1 - e) * Math.PI * 4));
    y = lerp(2.2, 0, bounce(p));
  } else if (t < 10.1) {
    q.copy(pose1).premultiply(tmp.setFromAxisAngle(IDLE_AXIS, Math.sin((t - 9.3) * 3) * 0.03));
  } else if (t < 11.1) {
    // A hop and a second roll.
    const p = phase(t, 10.1, 11.1);
    const e = easeOut(p);
    q.slerpQuaternions(pose1, pose2, e).multiply(tmp.setFromAxisAngle(SPIN_B, (1 - e) * Math.PI * 4));
    y = Math.sin(Math.PI * Math.min(p * 1.25, 1)) * 0.8;
  } else {
    q.copy(pose2);
    if (t > 12) q.premultiply(tmp.setFromAxisAngle(IDLE_AXIS, (t - 12) * 0.7));
    else q.premultiply(tmp.setFromAxisAngle(IDLE_AXIS, Math.sin((t - 11.1) * 3) * 0.03));
    if (t > 12) y = Math.sin((t - 12) * 2.2) * 0.06;
  }
  return { q, y };
}

function renderDie(d, t, rolls) {
  const { q, y } = diePose(t, rolls);
  d.die.quaternion.copy(q);
  d.die.position.y = y;
  const k = 1 - clamp(y, 0, 1.5) * 0.45;
  d.shadow.scale.setScalar(k);
  d.shadow.material.opacity = 0.3 + 0.7 * k;
  d.renderer.render(d.scene, d.camera);
}

// ---------- 2D drawing ----------

function text(g, str, x, y, { font, color = C.ink, align = "center", alpha = 1 }) {
  g.save();
  g.globalAlpha *= alpha;
  g.font = font;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = "alphabetic";
  g.fillText(str, x, y);
  g.restore();
}

// Draws pieces of one line, each with its own colour, centred as a whole.
function richLine(g, parts, cx, y, font, alpha = 1) {
  g.save();
  g.font = font;
  g.globalAlpha *= alpha;
  const widths = parts.map(([s]) => g.measureText(s).width);
  let x = cx - widths.reduce((a, b) => a + b, 0) / 2;
  g.textBaseline = "alphabetic";
  parts.forEach(([s, color], i) => {
    g.fillStyle = color;
    g.fillText(s, x, y);
    x += widths[i];
  });
  g.restore();
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fill();
}

// ---------- scene A: the chat ----------

const CHAT = [
  { from: "user", text: "Pick a random number from 1 to 10.", at: 0.35 },
  { from: "ai", text: "7", at: 1.35, typingAt: 0.9 },
  { from: "user", text: "Another one?", at: 2.05 },
  { from: "ai", text: "7", at: 2.75, typingAt: 2.35 },
  { from: "user", text: "A different one this time.", at: 3.35 },
  { from: "ai", text: "7", at: 4.0, typingAt: 3.65 },
  { from: "user", text: "Can you even be random?", at: 4.6 },
  { from: "ai", text: "7", at: 5.25, typingAt: 4.9 },
];
const BUBBLE_FONT = `500 36px ${DISPLAY}`;
const BUBBLE_PAD_X = 30;
const BUBBLE_H = 76;
const GAP = 16;

function drawChat(g, t) {
  const fade = 1 - phase(t, 5.95, 6.45);
  if (fade <= 0) return;
  g.save();
  g.globalAlpha = fade;
  const lift = easeInOut(phase(t, 5.95, 6.45)) * -60;

  // Messages that have appeared (or are typing), stacked from the top and
  // scrolled so the newest sits near the bottom.
  const visible = CHAT.filter((m) => t >= (m.typingAt ?? m.at));
  const heights = visible.map(() => BUBBLE_H + GAP);
  const total = heights.reduce((a, b) => a + b, 0);
  // Smoothly scroll as each new message arrives.
  let scroll = 0;
  {
    let acc = 0;
    for (const m of visible) {
      const appear = easeOut(phase(t, m.typingAt ?? m.at, (m.typingAt ?? m.at) + 0.3));
      acc += (BUBBLE_H + GAP) * appear;
    }
    scroll = Math.max(0, acc - 750);
  }
  let y = 196 - scroll + lift;

  // Header.
  text(g, "Any AI chat, any day", W / 2, 118 + lift, { font: `500 28px ${MONO}`, color: C.ink2 });

  g.font = BUBBLE_FONT;
  for (const m of visible) {
    const isUser = m.from === "user";
    const typing = !isUser && t < m.at;
    const popK = easeBack(phase(t, typing ? m.typingAt : m.at, (typing ? m.typingAt : m.at) + 0.35));
    const w = typing ? 120 : Math.max(BUBBLE_H, g.measureText(m.text).width + BUBBLE_PAD_X * 2);
    const x = isUser ? W - 90 - w : 90;
    g.save();
    const ox = isUser ? x + w : x;
    g.translate(ox, y + BUBBLE_H);
    g.scale(popK, popK);
    g.translate(-ox, -(y + BUBBLE_H));
    g.fillStyle = isUser ? C.ink : C.bubble;
    roundRect(g, x, y, w, BUBBLE_H, 38);
    if (typing) {
      for (let i = 0; i < 3; i++) {
        const b = Math.sin(t * 9 - i * 0.9) * 0.5 + 0.5;
        g.fillStyle = `rgba(110,110,115,${0.35 + b * 0.5})`;
        g.beginPath();
        g.arc(x + 38 + i * 24, y + BUBBLE_H / 2 - b * 5, 7, 0, Math.PI * 2);
        g.fill();
      }
    } else if (isUser) {
      text(g, m.text, x + BUBBLE_PAD_X, y + 50, { font: BUBBLE_FONT, color: "#fff", align: "left" });
    } else {
      text(g, m.text, x + w / 2, y + 54, { font: `650 44px ${DISPLAY}`, color: C.red });
    }
    g.restore();
    y += BUBBLE_H + GAP;
  }

  // A running tally of the answers along the bottom.
  const sevens = CHAT.filter((m) => m.from === "ai" && t >= m.at).length;
  if (sevens) {
    const row = Array.from({ length: sevens }, () => "7").join("  ");
    text(g, `answers so far:  ${row}`, W / 2, 1012 + lift, { font: `500 30px ${MONO}`, color: C.ink2 });
  }
  g.restore();
}

// ---------- scene B: the point ----------

function drawPoint(g, t) {
  const a = phase(t, 6.35, 6.75) * (1 - phase(t, 7.85, 8.15));
  if (a <= 0) return;
  const rise = (1 - easeOut(phase(t, 6.35, 6.85))) * 30;
  richLine(g, [["LLMs can’t be", C.ink]], W / 2, 500 + rise, `650 104px ${DISPLAY}`, a);
  richLine(g, [["random.", C.red]], W / 2, 610 + rise, `650 104px ${DISPLAY}`, a);
  const a2 = phase(t, 6.85, 7.25) * (1 - phase(t, 7.85, 8.15));
  text(g, "They predict the likeliest answer.", W / 2, 700, { font: `400 32px ${MONO}`, color: C.ink2, alpha: a2 });
}

// ---------- scene C: real dice ----------

function drawDiceScene(g, t, d, rolls) {
  if (t < 8.1) return;
  const toEnd = easeInOut(phase(t, 12.0, 12.7));

  // The die, moving up and shrinking for the end card.
  renderDie(d, t, rolls);
  const size = lerp(700, 470, toEnd);
  const cy = lerp(600, 330, toEnd);
  g.drawImage(d.canvas, W / 2 - size / 2, cy - size / 2, size, size);

  // Title on top, fading out for the end card.
  const ta = phase(t, 8.1, 8.5) * (1 - phase(t, 11.9, 12.3));
  richLine(g, [["So we gave them ", C.ink], ["real dice", C.red], [".", C.ink]], W / 2, 160, `650 64px ${DISPLAY}`, ta);

  // What it rolled.
  const r1 = phase(t, 9.35, 9.6) * (1 - phase(t, 10.05, 10.25));
  const r2 = phase(t, 11.15, 11.4) * (1 - phase(t, 11.9, 12.2));
  const label = (v, a) =>
    richLine(g, [["randollm rolled ", C.ink2], [`${v}`, C.red], [".", C.ink2]], W / 2, 975, `500 38px ${MONO}`, a);
  if (r1 > 0) label(rolls[0], r1);
  if (r2 > 0) label(rolls[1], r2);
}

// ---------- scene D: end card ----------

function drawEnd(g, t) {
  const a = phase(t, 12.35, 12.8);
  if (a <= 0) return;
  const rise = (1 - easeOut(phase(t, 12.35, 12.95))) * 24;
  richLine(g, [["rando", C.ink], ["llm", C.red]], W / 2, 690 + rise, `650 128px ${DISPLAY}`, a);
  const a2 = phase(t, 12.6, 13.0);
  text(g, "Real randomness for AI.", W / 2, 770 + rise, { font: `500 46px ${DISPLAY}`, color: C.ink2, alpha: a2 });
  const a3 = phase(t, 12.9, 13.3);
  richLine(g, [["randollm.glauser.com", C.ink], ["/mcp", C.red]], W / 2, 890, `500 38px ${MONO}`, a3);
  text(g, "Free MCP server for Claude, ChatGPT and more", W / 2, 950, { font: `400 28px ${MONO}`, color: C.ink2, alpha: a3 });
}

function draw(g, d, t, rolls) {
  g.fillStyle = C.bg;
  g.fillRect(0, 0, W, W);
  drawChat(g, t);
  drawPoint(g, t);
  drawDiceScene(g, t, d, rolls);
  drawEnd(g, t);
}

// ---------- run ----------

async function loadFonts() {
  const faces = [
    new FontFace("Geist", "url(/fonts/geist-latin-wght-normal.woff2)", { weight: "100 900" }),
    new FontFace("IBM Plex Mono", "url(/fonts/ibm-plex-mono-latin-400-normal.woff2)", { weight: "400" }),
    new FontFace("IBM Plex Mono", "url(/fonts/ibm-plex-mono-latin-500-normal.woff2)", { weight: "500" }),
  ];
  for (const f of faces) document.fonts.add(await f.load());
}

async function realRolls() {
  const res = await fetch("https://randollm.glauser.com/api/dice?count=2&sides=6");
  if (!res.ok) throw new Error(`randollm API returned ${res.status}`);
  return (await res.json()).result.rolls;
}

const status = (msg) => (document.getElementById("status").textContent = msg);

async function main() {
  await loadFonts();
  const params = new URLSearchParams(location.search);
  const rolls = params.has("rolls") ? params.get("rolls").split(",").map(Number) : await realRolls();
  const canvas = document.getElementById("frame");
  canvas.width = canvas.height = W;
  const g = canvas.getContext("2d");
  const d = makeDie();

  if (params.has("t")) {
    draw(g, d, Number(params.get("t")), rolls);
    status(`frame at ${params.get("t")} s, rolls ${rolls}`);
    window.__ready = true;
    return;
  }

  status(`rendering, rolls ${rolls}…`);
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec: "avc", bitrate: 10_000_000, keyFrameInterval: 2 });
  output.addVideoTrack(source, { frameRate: FPS });
  await output.start();
  const frames = Math.round(DURATION * FPS);
  for (let i = 0; i < frames; i++) {
    const t = i / FPS;
    draw(g, d, t, rolls);
    await source.add(t, 1 / FPS);
    if (i % 30 === 0) status(`frame ${i} / ${frames}`);
  }
  await output.finalize();
  const res = await fetch("/save", { method: "POST", body: output.target.buffer });
  status(res.ok ? `saved ${await res.text()} (rolls ${rolls})` : `save failed: ${res.status}`);
  window.__done = true;
}

main().catch((err) => {
  status(`error: ${err.message}`);
  window.__error = err.message;
});
