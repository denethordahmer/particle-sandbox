// Entry point: wires the world, renderer, fixed-timestep loop and touch
// controls together. Game logic lives in sim.ts / outcomes.ts, drawing in
// render.ts, so this file only coordinates.
import { MATERIAL_NAMES, MATERIALS, type Category, type MaterialName } from "./materials";
import {
  clearWorld,
  createWorld,
  getCell,
  paint,
  stepWorld,
  EMPTY,
  type World,
} from "./sim";
import { generateWorld } from "./worlds";
import { createRenderer, worldSizeFor, type Renderer } from "./render";

/** Aim for roughly this many cells across the short edge of the screen. */
const TARGET_CELLS_ACROSS = 100;
/** Fixed simulation rate; rendering is free to run faster or slower. */
const TICK_MS = 1000 / 60;
/** Never simulate more than this much catch-up in one frame. */
const MAX_CATCHUP_MS = 200;

interface Group {
  readonly cat: Category;
  readonly label: string;
}

/** Picker tabs, in the order the roster was designed. */
const GROUPS: readonly Group[] = [
  { cat: "structure", label: "Solid" },
  { cat: "granular", label: "Grain" },
  { cat: "liquid", label: "Liquid" },
  { cat: "gas", label: "Gas" },
  { cat: "fire", label: "Fire" },
  { cat: "reactive", label: "Reactive" },
  { cat: "metal", label: "Metal" },
];

const stage = document.querySelector<HTMLDivElement>("#stage")!;
const canvas = document.querySelector<HTMLCanvasElement>("#sim")!;
const tabsEl = document.querySelector<HTMLDivElement>("#tabs")!;
const materialsEl = document.querySelector<HTMLDivElement>("#materials")!;
const brushEl = document.querySelector<HTMLInputElement>("#brush")!;
const brushValEl = document.querySelector<HTMLSpanElement>("#brushVal")!;
const eraseEl = document.querySelector<HTMLButtonElement>("#erase")!;
const pauseEl = document.querySelector<HTMLButtonElement>("#pause")!;
const randomEl = document.querySelector<HTMLButtonElement>("#random")!;
const clearEl = document.querySelector<HTMLButtonElement>("#clear")!;
const hintEl = document.querySelector<HTMLParagraphElement>("#hint")!;
const titleEl = document.querySelector<HTMLDivElement>("#title")!;
const ringEl = document.querySelector<HTMLDivElement>("#ring")!;
const currentDotEl = document.querySelector<HTMLElement>("#current .dot")!;
const currentNameEl = document.querySelector<HTMLSpanElement>("#currentName")!;

let selected: MaterialName = "Sand";
let activeCat: Category = MATERIALS[selected].cat;
let erasing = false;
let paused = false;
let brush = Number(brushEl.value);

let world: World = null as unknown as World;
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
        nextWorld.heat[di] = prev.heat[srcY * prev.width + x]!;
      }
    }
    // Keep the seed stream moving so a resize does not replay the same rolls.
    nextWorld.tick = prev.tick;
  }
  world = nextWorld;
}

/** Scale from world cells to CSS pixels, and the centring offsets. */
function viewFit(cssWidth: number, cssHeight: number): {
  fit: number;
  offsetX: number;
  offsetY: number;
} {
  const fit = Math.min(cssWidth / world.width, cssHeight / world.height);
  return {
    fit,
    offsetX: (cssWidth - world.width * fit) / 2,
    offsetY: (cssHeight - world.height * fit) / 2,
  };
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

function buildTabs(): void {
  const frag = document.createDocumentFragment();
  for (const group of GROUPS) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "tab";
    tab.dataset.cat = group.cat;
    tab.textContent = group.label;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", group.cat === activeCat ? "true" : "false");
    tab.addEventListener("click", () => {
      activeCat = group.cat;
      buildPicker();
    });
    frag.append(tab);
  }
  tabsEl.append(frag);
}

/** Rebuild the material strip for the active category. */
function buildPicker(): void {
  for (const tab of tabsEl.querySelectorAll<HTMLButtonElement>(".tab")) {
    tab.setAttribute("aria-selected", tab.dataset.cat === activeCat ? "true" : "false");
  }

  materialsEl.replaceChildren();
  const frag = document.createDocumentFragment();
  for (const name of MATERIAL_NAMES) {
    if (MATERIALS[name].cat !== activeCat) continue;
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
    chip.addEventListener("click", () => selectMaterial(name));
    frag.append(chip);
  }
  materialsEl.append(frag);
  materialsEl.scrollLeft = 0;
}

function selectMaterial(name: MaterialName): void {
  selected = name;
  erasing = false;
  eraseEl.setAttribute("aria-pressed", "false");
  currentNameEl.textContent = name;
  currentDotEl.style.background = rgbCss(MATERIALS[name].col);
  for (const chip of materialsEl.querySelectorAll<HTMLButtonElement>(".chip")) {
    chip.setAttribute("aria-selected", chip.dataset.material === name ? "true" : "false");
  }
  const active = materialsEl.querySelector<HTMLButtonElement>(
    `.chip[data-material="${CSS.escape(name)}"]`,
  );
  active?.scrollIntoView({ inline: "nearest", block: "nearest" });
}

// ---------------------------------------------------------------- painting

let painting = false;
let lastPoint: { x: number; y: number } | null = null;

function toCell(clientX: number, clientY: number): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  const { fit, offsetX, offsetY } = viewFit(rect.width, rect.height);
  const x = Math.floor((clientX - rect.left - offsetX) / fit);
  const y = Math.floor((clientY - rect.top - offsetY) / fit);
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return null;
  return { x, y };
}

/** The title card is an overlay only: the sandbox is live underneath it. */
function dismissTitle(): void {
  if (!titleEl.classList.contains("gone")) titleEl.classList.add("gone");
}

function stampAt(x: number, y: number): void {
  dismissTitle();
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

/** Show a ring the size of the brush under the finger. */
function moveRing(clientX: number, clientY: number): void {
  const rect = canvas.getBoundingClientRect();
  const { fit } = viewFit(rect.width, rect.height);
  const diameter = Math.max(18, (brush * 2 + 1) * fit);
  ringEl.style.inlineSize = `${diameter}px`;
  ringEl.style.blockSize = `${diameter}px`;
  ringEl.style.left = `${clientX - rect.left}px`;
  ringEl.style.top = `${clientY - rect.top}px`;
  ringEl.classList.add("on");
}

function hideRing(): void {
  ringEl.classList.remove("on");
}

canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  painting = true;
  lastPoint = null;
  canvas.setPointerCapture(e.pointerId);
  moveRing(e.clientX, e.clientY);
  paintStroke(e.clientX, e.clientY);
});

canvas.addEventListener("pointermove", (e) => {
  if (e.pointerType === "mouse" && !painting) {
    moveRing(e.clientX, e.clientY);
  }
  if (!painting) return;
  e.preventDefault();
  moveRing(e.clientX, e.clientY);
  paintStroke(e.clientX, e.clientY);
});

canvas.addEventListener("pointerleave", hideRing);

function endStroke(e: PointerEvent): void {
  if (!painting) return;
  painting = false;
  lastPoint = null;
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
}

canvas.addEventListener("pointerup", (e) => {
  endStroke(e);
  if (e.pointerType !== "mouse") hideRing();
});
canvas.addEventListener("pointercancel", (e) => {
  endStroke(e);
  hideRing();
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// ---------------------------------------------------------------- controls

brushEl.addEventListener("input", () => {
  brush = Number(brushEl.value);
  brushValEl.textContent = String(brush);
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

randomEl.addEventListener("click", () => {
  generateWorld(world, Math.floor(Math.random() * 0x7fffffff));
  hintEl.classList.add("gone");
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

// The card clears itself after a few seconds so it never becomes a gate, and
// the first touch anywhere (even before painting) clears it straight away.
window.setTimeout(dismissTitle, 3600);
for (const type of ["pointerdown", "keydown"]) {
  window.addEventListener(type, dismissTitle, { once: true, passive: true });
}
}

// Pause automatically when the tab or app goes away, and catch up on return
// without a burst of simulation.
document.addEventListener("visibilitychange", () => {
  // The loop already stops while the tab is hidden, so the player's own Pause
  // choice is left alone and the sim carries on when they come back.
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

buildTabs();
buildPicker();
layout();
generateWorld(world, Math.floor(Math.random() * 0x7fffffff), "meadow");
selectMaterial(selected);
brushValEl.textContent = String(brush);
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
      paintAt: (x: number, y: number) => void;
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
    brushValEl.textContent = String(n);
  },
  paintAt: (x, y) => {
    paint(world, x, y, brush, erasing ? null : selected);
    renderer.draw(world);
  },
};
