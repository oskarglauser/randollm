// The hero die: a glossy red die rendered with three.js. Tapping it fetches a
// real roll from /api/dice and the die tumbles onto that face. If the request
// fails it says so; it never makes up a result.
// Built into public/assets/die.js with `npm run build:site`.
import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  NeutralToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

// BoxGeometry material order is +x, -x, +y, -y, +z, -z. Opposite faces add up to 7.
const FACE_VALUES = [2, 5, 3, 4, 1, 6];
const FACE_NORMALS = [
  new Vector3(1, 0, 0),
  new Vector3(-1, 0, 0),
  new Vector3(0, 1, 0),
  new Vector3(0, -1, 0),
  new Vector3(0, 0, 1),
  new Vector3(0, 0, -1),
];
const PIPS = {
  1: [[0.5, 0.5]],
  2: [[0.27, 0.27], [0.73, 0.73]],
  3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
  5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
  6: [[0.27, 0.25], [0.73, 0.25], [0.27, 0.5], [0.73, 0.5], [0.27, 0.75], [0.73, 0.75]],
};
const SIZE = 512;
const PIP_R = 0.085 * SIZE;

function canvas(draw) {
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  draw(c.getContext("2d"));
  return c;
}

// Color, bump (pips are dimples) and roughness (glossy body, satin pips) per face.
function faceMaterial(value, anisotropy) {
  const pips = PIPS[value].map(([x, y]) => [x * SIZE, y * SIZE]);
  const color = new CanvasTexture(
    canvas((g) => {
      g.fillStyle = "#b3070f";
      g.fillRect(0, 0, SIZE, SIZE);
      for (const [x, y] of pips) {
        // A soft dark rim where the face curves into the dimple.
        const rim = g.createRadialGradient(x, y, PIP_R * 0.9, x, y, PIP_R * 1.22);
        rim.addColorStop(0, "rgba(40,0,0,0.55)");
        rim.addColorStop(1, "rgba(40,0,0,0)");
        g.fillStyle = rim;
        g.beginPath();
        g.arc(x, y, PIP_R * 1.22, 0, Math.PI * 2);
        g.fill();
        // Concave: the top edge is in shadow, the bottom catches the light.
        const grad = g.createRadialGradient(x + PIP_R * 0.28, y + PIP_R * 0.32, 0, x, y, PIP_R);
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.55, "#f3eee8");
        grad.addColorStop(0.85, "#d9d0c7");
        grad.addColorStop(1, "#b9ada3");
        g.fillStyle = grad;
        g.beginPath();
        g.arc(x, y, PIP_R, 0, Math.PI * 2);
        g.fill();
      }
    }),
  );
  color.colorSpace = SRGBColorSpace;
  const bump = new CanvasTexture(
    canvas((g) => {
      g.fillStyle = "#fff";
      g.fillRect(0, 0, SIZE, SIZE);
      for (const [x, y] of pips) {
        const grad = g.createRadialGradient(x, y, 0, x, y, PIP_R * 1.06);
        grad.addColorStop(0, "#5a5a5a");
        grad.addColorStop(0.8, "#8a8a8a");
        grad.addColorStop(1, "#fff");
        g.fillStyle = grad;
        g.beginPath();
        g.arc(x, y, PIP_R * 1.06, 0, Math.PI * 2);
        g.fill();
      }
    }),
  );
  const rough = new CanvasTexture(
    canvas((g) => {
      g.fillStyle = "rgb(60,60,60)";
      g.fillRect(0, 0, SIZE, SIZE);
      g.fillStyle = "rgb(150,150,150)";
      for (const [x, y] of pips) {
        g.beginPath();
        g.arc(x, y, PIP_R, 0, Math.PI * 2);
        g.fill();
      }
    }),
  );
  for (const t of [color, bump, rough]) t.anisotropy = anisotropy;
  return new MeshPhysicalMaterial({
    map: color,
    bumpMap: bump,
    bumpScale: 5,
    roughnessMap: rough,
    roughness: 1,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    specularIntensity: 0.55,
  });
}

function contactShadow() {
  const tex = new CanvasTexture(
    canvas((g) => {
      const grad = g.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, SIZE / 2);
      grad.addColorStop(0, "rgba(0,0,0,0.42)");
      grad.addColorStop(0.3, "rgba(0,0,0,0.2)");
      grad.addColorStop(0.65, "rgba(0,0,0,0.05)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, SIZE, SIZE);
    }),
  );
  const mesh = new Mesh(
    new PlaneGeometry(2.7, 2.7),
    new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -1.32;
  return mesh;
}

const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeOutBack = (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;

// Like a real die, the result is the face pointing up. The camera looks down
// from above, so the top face is always the one you read; turning it a little
// about the vertical shows two sides for depth.
const UP = new Vector3(0, 1, 0);
function restingPose(value, quarterTurns = 0) {
  const i = FACE_VALUES.indexOf(value);
  const face = new Quaternion().setFromUnitVectors(FACE_NORMALS[i], UP);
  const yaw = new Quaternion().setFromAxisAngle(UP, 0.55 + (quarterTurns * Math.PI) / 2);
  return yaw.multiply(face);
}

function randomAxis() {
  // Cosmetic only: which way the die tumbles, never the result.
  return new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
}

export function mountDie(stage, { onResult, onError, still = false } = {}) {
  const canvasEl = stage.querySelector("canvas");
  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true, powerPreference: "low-power" });
  } catch {
    return null; // No WebGL: the poster image stays.
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
  scene.environmentIntensity = 0.9;

  const camera = new PerspectiveCamera(28, 1, 0.1, 50);
  camera.position.set(0, 5.6, 4.4);
  camera.lookAt(0, -0.25, 0);

  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  const die = new Mesh(
    new RoundedBoxGeometry(1.7, 1.7, 1.7, 10, 0.26),
    FACE_VALUES.map((v) => faceMaterial(v, anisotropy)),
  );
  scene.add(die);
  const shadow = contactShadow();
  scene.add(shadow);

  const reduced = still || matchMedia("(prefers-reduced-motion: reduce)").matches;
  const IDLE_AXIS = new Vector3(0.35, 1, 0.12).normalize();
  const tmp = new Quaternion();

  // States: idle (slow tumble), spinning (waiting for the API), settling, landed.
  let state = "idle";
  let pose = restingPose(5, 0).multiply(new Quaternion().setFromAxisAngle(IDLE_AXIS, 0.6));
  die.quaternion.copy(pose);
  let spinAxis = randomAxis();
  let spinSpeed = 0;
  let settle = null;
  let landedAt = 0;
  let last = performance.now();
  let visible = true;
  let frame = 0;

  function resize() {
    const { width, height } = canvasEl.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function tick(now) {
    frame = 0;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const t = now / 1000;
    let lift = 0;

    if (state === "idle") {
      if (!reduced) die.quaternion.premultiply(tmp.setFromAxisAngle(IDLE_AXIS, dt * 0.32));
      lift = reduced ? 0 : Math.sin(t * 1.3) * 0.05;
    } else if (state === "spinning") {
      spinSpeed = Math.min(spinSpeed + dt * 60, 16);
      die.quaternion.premultiply(tmp.setFromAxisAngle(spinAxis, dt * spinSpeed));
      lift = Math.min(die.position.y + dt * 2.4, 0.45);
    } else if (state === "settling") {
      const p = Math.min((now - settle.start) / settle.duration, 1);
      const e = easeOutCubic(p);
      die.quaternion
        .slerpQuaternions(settle.from, settle.to, e)
        .multiply(tmp.setFromAxisAngle(settle.axis, (1 - e) * settle.turns));
      lift = settle.lift * (1 - easeOutBack(p));
      if (p >= 1) {
        state = "landed";
        landedAt = now;
        pose = settle.to.clone();
      }
    } else if (state === "landed") {
      // Hold the result, breathing slightly.
      const s = reduced ? 0 : Math.sin((now - landedAt) / 900) * 0.035;
      die.quaternion.copy(pose).premultiply(tmp.setFromAxisAngle(IDLE_AXIS, s));
      lift = reduced ? 0 : Math.sin(t * 1.3) * 0.03;
    }

    die.position.y = lift;
    const k = 1 - Math.min(Math.max(lift, 0), 0.6) * 0.6;
    shadow.scale.setScalar(k);
    shadow.material.opacity = 0.35 + 0.65 * k;
    renderer.render(scene, camera);

    const animating = state === "spinning" || state === "settling" || !reduced;
    if (visible && animating) frame = requestAnimationFrame(tick);
  }

  function wake() {
    if (!frame && visible) {
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }
  }

  async function roll() {
    if (state === "spinning" || state === "settling") return;
    state = "spinning";
    spinAxis = randomAxis();
    spinSpeed = reduced ? 0 : 6;
    wake();
    const started = performance.now();
    let value;
    try {
      const res = await fetch("/api/dice?count=1&sides=6", { headers: { accept: "application/json" } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(res.status === 429 ? "Too many rolls. Try again in a minute." : body.error);
      value = body.result.rolls[0];
    } catch (err) {
      state = "idle";
      onError?.(err.message || "Couldn’t reach randollm. Try again.");
      wake();
      return;
    }
    // Let it spin for a moment even when the API is instant.
    const wait = reduced ? 0 : Math.max(0, 420 - (performance.now() - started));
    await new Promise((r) => setTimeout(r, wait));
    settle = {
      from: die.quaternion.clone(),
      to: restingPose(value, Math.floor(Math.random() * 4)),
      axis: spinAxis,
      turns: reduced ? 0 : Math.PI * 2 * (1 + Math.floor(Math.random() * 2)),
      lift: die.position.y,
      start: performance.now(),
      duration: reduced ? 250 : 1150,
    };
    state = "settling";
    wake();
    setTimeout(() => onResult?.(value), reduced ? 250 : 900);
  }

  resize();
  new ResizeObserver(() => {
    resize();
    wake();
    if (reduced) renderer.render(scene, camera);
  }).observe(canvasEl);
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting && document.visibilityState === "visible";
    wake();
  }).observe(stage);
  document.addEventListener("visibilitychange", () => {
    visible = document.visibilityState === "visible";
    wake();
  });

  renderer.render(scene, camera);
  stage.classList.add("is-live");
  wake();
  return { roll };
}

// Auto-mount on the page.
const stage = document.querySelector("[data-die]");
if (stage) {
  const result = document.getElementById("die-result");
  const api = mountDie(stage, {
    still: stage.hasAttribute("data-still"),
    onResult(v) {
      result.textContent = `You rolled a ${v}.`;
    },
    onError(msg) {
      result.textContent = msg;
    },
  });
  if (api) stage.addEventListener("click", () => api.roll());
}
