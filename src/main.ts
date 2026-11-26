// Entry point: wires the world, renderer, fixed-timestep loop and touch
// controls together. Game logic lives in sim.ts / outcomes.ts, drawing in
// render.ts, so this file only coordinates.
import { MATERIAL_NAMES, MATERIALS, type MaterialName } from "./materials";
import {
  clearWorld,
  createWorld,
  getCell,
  paint,
  stepWorld,
  EMPTY,
  type World,
} from "./sim";
import { createRenderer, worldSizeFor, type Renderer } from "./render";

/** Aim for roughly this many cells across the short edge of the screen. */
const TARGET_CELLS_ACROSS = 100;
/** Fixed simulation rate; rendering is free to run faster or slower. */
const TICK_MS = 1000 / 60;
/** Never simulate more than this much catch-up in one frame. */
const MAX_CATCHUP_MS = 200;

const stage = document.querySelector<HTMLDivElement>("#stage")!;
const canvas = document.querySelector<HTMLCanvasElement>("#sim")!;
const materialsEl = document.querySelector<HTMLDivElement>("#materials")!;
const brushEl = document.querySelector<HTMLInputElement>("#brush")!;
const eraseEl = document.querySelector<HTMLButtonElement>("#erase")!;
const pauseEl = document.querySelector<HTMLButtonElement>("#pause")!;
const clearEl = document.querySelector<HTMLButtonElement>("#clear")!;
const hintEl = document.querySelector<HTMLParagraphElement>("#hint")!;

let selected: MaterialName = "Sand";
let erasing = false;
let paused = false;
let brush = Number(brushEl.value);

let world: World;
let renderer: Renderer;

function rgbCss(c: readonly [number, number, number]): string {
  return `rgb(${c[0]} ${c[1]} ${c[2]})`;
}

/** Cells per CSS pixel, chosen so the short screen edge holds ~100 cells. */
function cellPxFor(cssWidth: number, cssHeight: number): number {
  const shortEdge = Math.min(cssWidth, cssHeight);
  return Math.max(1, shortEdge / TARGET_CELLS_ACROSS);
}

/** Carry existing contents into a resized world, anchored at the bottom. */
function resizeWorld(next: { width: number; height: number }): void {
  const prev = world;
  const nextWorld = createWorld(next.width, next.height, prev ? prev.tick + 1 : 1);
  if (prev) {
    const copyW = Math.min(prev.width, next.width);
    const copyH = Math.min(prev.height, next.height);
    for (let y = 0; y < copyH; y++) {
      for (let x = 0; x < copyW; x++) {
        const srcY = prev.height - copyH + y;
        const dstY = nextWorld.height - copyH + y;
        const id = prev.cells[srcY * prev.width + x]!;
        if (id === EMPTY) continue;
        const di = dstY * nextWorld.width + x;
        nextWorld.cells[di] = id;
        nextWorld.life[di] = prev.life[srcY * prev.width + x]!;
      }
    }
    // Keep the seed stream moving so a resize does not replay the same rolls.
    nextWorld.tick = prev.tick;
  }
  world = nextWorld;
}

function layout(): void {
  const rect = stage.getBoundingClientRect();
  const cssW = Math.max(1, Math.floor(rect.width));
  const cssH = Math.max(1, Math.floor(rect.height));
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const cellPx = cellPxFor(cssW, cssH);
  const size = worldSizeFor(cssW, cssH, cellPx);

  if (!renderer) {
    renderer = createRenderer(canvas);
  }
  renderer.resize(cssW, cssH, dpr);

  if (!world || world.width !== size.width || world.height !== size.height) {
    resizeWorld(size);
  }
}

// ---------------------------------------------------------------- material picker

function buildPicker(): void {
  const frag = document.createDocumentFragment();
  for (const name of MATERIAL_NAMES) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.dataset.material = name;
    chip.setAttribute("role", "option");
    chip.setAttribute("aria-selected", name === selected ? "true" : "false");

    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = rgbCss(MATERIALS[name].col);

    const label = document.createElement("span");
    label.textContent = name;

    chip.append(dot, label);
    chip.addEventListener("click", () => {
      selectMaterial(name);
    });
    frag.append(chip);
  }
  materialsEl.append(frag);
}

function selectMaterial(name: MaterialName): void {
  selected = name;
  erasing = false;
  eraseEl.setAttribute("aria-pressed", "false");
  for (const chip of materialsEl.querySelectorAll<HTMLButtonElement>(".chip")) {
    chip.setAttribute("aria-selected", chip.dataset.material === name ? "true" : "false");
  }
  const active = materialsEl.querySelector<HTMLButtonElement>(
    `.chip[data-material="${CSS.escape(name)}"]`,
  );
  active?.scrollIntoView({ inline: "center", block: "nearest" });
}

// ---------------------------------------------------------------- painting

let painting = false;
let lastPoint: { x: number; y: number } | null = null;

function toCell(clientX: number, clientY: number): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  const size = worldSizeFor(rect.width, rect.height, 1);
  // Match the renderer's fit-and-centre maths so a touch lands on the cell
  // under the finger.
  const fit = Math.min(rect.width / world.width, rect.height / world.height);
  const offsetX = (rect.width - world.width * fit) / 2;
  const offsetY = (rect.height - world.height * fit) / 2;
  const x = Math.floor((clientX - rect.left - offsetX) / fit);
  const y = Math.floor((clientY - rect.top - offsetY) / fit);
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return null;
  void size;
  return { x, y };
}

function stampAt(x: number, y: number): void {
  paint(world, x, y, brush, erasing ? null : selected);
  if (hintEl && !hintEl.classList.contains("gone")) hintEl.classList.add("gone");
}

function paintStroke(clientX: number, clientY: number): void {
  const cell = toCell(clientX, clientY);
  if (!cell) return;
  if (lastPoint) {
    // Interpolate so a fast drag paints a continuous line rather than dots.
    const dx = cell.x - lastPoint.x;
    const dy = cell.y - lastPoint.y;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    for (let s = 1; s <= steps; s++) {
      stampAt(
        Math.round(lastPoint.x + (dx * s) / steps),
        Math.round(lastPoint.y + (dy * s) / steps),
      );
    }
  } else {
    stampAt(cell.x, cell.y);
  }
  lastPoint = cell;
}

canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  painting = true;
  lastPoint = null;
  canvas.setPointerCapture(e.pointerId);
  paintStroke(e.clientX, e.clientY);
});

canvas.addEventListener("pointermove", (e) => {
  if (!painting) return;
  e.preventDefault();
  paintStroke(e.clientX, e.clientY);
});

function endStroke(e: PointerEvent): void {
  if (!painting) return;
  painting = false;
  lastPoint = null;
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
}

canvas.addEventListener("pointerup", endStroke);
canvas.addEventListener("pointercancel", endStroke);
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// ---------------------------------------------------------------- controls

brushEl.addEventListener("input", () => {
  brush = Number(brushEl.value);
});

eraseEl.addEventListener("click", () => {
  erasing = !erasing;
  eraseEl.setAttribute("aria-pressed", erasing ? "true" : "false");
});

pauseEl.addEventListener("click", () => {
  paused = !paused;
  pauseEl.textContent = paused ? "Resume" : "Pause";
  pauseEl.setAttribute("aria-pressed", paused ? "true" : "false");
});

clearEl.addEventListener("click", () => {
  clearWorld(world);
  hintEl.classList.remove("gone");
});

// ---------------------------------------------------------------- loop

let lastFrame = performance.now();
let accumulator = 0;

function frame(now: number): void {
  const elapsed = Math.min(now - lastFrame, MAX_CATCHUP_MS);
  lastFrame = now;

  if (!paused) {
    accumulator += elapsed;
    let steps = 0;
    while (accumulator >= TICK_MS && steps < 12) {
      stepWorld(world);
      accumulator -= TICK_MS;
      steps++;
    }
  } else {
    accumulator = 0;
  }

  renderer.draw(world);
  requestAnimationFrame(frame);
}

// Pause automatically when the tab or app goes away, and catch up on return
// without a burst of simulation.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    paused = true;
    pauseEl.textContent = "Resume";
    pauseEl.setAttribute("aria-pressed", "true");
  }
  lastFrame = performance.now();
  accumulator = 0;
});

// ---------------------------------------------------------------- boot

let resizeTimer = 0;
window.addEventListener("resize", () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    layout();
  }, 120);
});

function seedStartingScene(): void {
  const w = world.width;
  const h = world.height;
  // A thin bedrock shelf and a drift of sand: something to look at on load.
  for (let x = 0; x < w; x++) {
    if (x % 37 < 22) paint(world, x, h - 1, 0, "Bedrock");
  }
  for (let i = 0; i < 6; i++) {
    paint(world, Math.floor(w * (0.2 + i * 0.12)), Math.floor(h * 0.16), 2, "Sand");
  }
}

buildPicker();
layout();
seedStartingScene();
selectMaterial(selected);
requestAnimationFrame(frame);

// Expose a small probe so the app can be checked from a console or an
// automated browser without reading internals.
declare global {
  interface Window {
    __particle?: {
      world: () => World;
      select: (name: MaterialName) => void;
      cellAt: (x: number, y: number) => string | null;
      step: (n: number) => void;
      paused: () => boolean;
      brush: (n: number) => void;
    };
  }
}

window.__particle = {
  world: () => world,
  select: (name) => selectMaterial(name),
  cellAt: (x, y) => getCell(world, x, y),
  step: (n) => {
    for (let i = 0; i < n; i++) stepWorld(world);
    renderer.draw(world);
  },
  paused: () => paused,
  brush: (n) => {
    brush = n;
    brushEl.value = String(n);
  },
};
