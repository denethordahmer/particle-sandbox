// Simulation core (Step B). A typed grid of cells, one material id per cell
// (0 = empty), stepped by a fixed tick. Deterministic: all randomness comes
// from the world's seeded generator, and iteration order is fixed.
//
// Movement per state, bottom-up so nothing falls more than one cell per tick:
//   powder  falls, then slides diagonally; piles up
//   liquid  falls, slides diagonally, then spreads sideways
//   gas     rises, drifts diagonally up, then sideways; slowly dissipates
//   energy  rises and dies out quickly
//   solid   stays put (reactions can still change it)
//
// Reactions run after movement, using the board data in materials.ts and the
// concrete cell outcomes in outcomes.ts.
import { MATERIAL_NAMES, MATERIALS, reaction, type MaterialName, type MaterialProps } from "./materials";
import { resolveOutcome } from "./outcomes";

export const EMPTY = 0;

/** Material id: 0 is empty, 1..48 follow MATERIAL_NAMES order. */
export type CellId = number;

const ID_OF = new Map<MaterialName, CellId>(
  MATERIAL_NAMES.map((n, i) => [n, i + 1]),
);

export function idOf(name: MaterialName): CellId {
  const id = ID_OF.get(name);
  if (id === undefined) throw new Error(`unknown material: ${name}`);
  return id;
}

export function nameOf(id: CellId): MaterialName | null {
  return id === EMPTY ? null : MATERIAL_NAMES[id - 1] ?? null;
}

// Props lookup by id, index 0 unused.
const PROPS = MATERIAL_NAMES.map((n) => MATERIALS[n]);

/** Small fast seeded PRNG (mulberry32); same seed, same world, every run. */
export function makeRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface World {
  readonly width: number;
  readonly height: number;
  readonly cells: Uint8Array;
  /** Per-cell lifetime for gas/energy; 0 for everything else. */
  readonly life: Uint16Array;
  /** Cells already moved this tick. */
  readonly moved: Uint8Array;
  /** Cells already reacted this tick (separate from movement). */
  readonly reacted: Uint8Array;
  tick: number;
  readonly random: () => number;
}

export function createWorld(width: number, height: number, seed = 1): World {
  if (width < 1 || height < 1) throw new Error("world needs positive size");
  const n = width * height;
  return {
    width,
    height,
    cells: new Uint8Array(n),
    life: new Uint16Array(n),
    moved: new Uint8Array(n),
    reacted: new Uint8Array(n),
    tick: 0,
    random: makeRandom(seed),
  };
}

const GAS_LIFE = 220;
/** Energy lingers roughly 1-2 seconds, with flicker so flames dance. */
const ENERGY_LIFE = 90;

function lifeFor(id: CellId, random: () => number): number {
  if (id === EMPTY) return 0;
  const state = PROPS[id - 1]!.state;
  if (state === "energy") {
    // Vary the burn time per cell; a uniform life makes flames pop out flat.
    return Math.round(ENERGY_LIFE * (0.55 + random() * 0.9));
  }
  if (state === "gas") return GAS_LIFE;
  return 0;
}

export function setCell(w: World, x: number, y: number, name: MaterialName | null): void {
  if (x < 0 || y < 0 || x >= w.width || y >= w.height) return;
  const i = y * w.width + x;
  const id = name === null ? EMPTY : idOf(name);
  w.cells[i] = id;
  w.life[i] = lifeFor(id, w.random);
}

export function getCell(w: World, x: number, y: number): MaterialName | null {
  if (x < 0 || y < 0 || x >= w.width || y >= w.height) return null;
  return nameOf(w.cells[y * w.width + x] ?? EMPTY);
}

/** Paint a filled circle of material; radius 0 paints one cell. */
export function paint(w: World, cx: number, cy: number, radius: number, name: MaterialName | null): void {
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= r2) setCell(w, cx + dx, cy + dy, name);
    }
  }
}

function inBounds(w: World, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < w.width && y < w.height;
}

/** Swap two cells wholesale (id + life), marking both as moved. */
function swap(w: World, i: number, j: number): void {
  const c = w.cells[i]!;
  w.cells[i] = w.cells[j]!;
  w.cells[j] = c;
  const l = w.life[i]!;
  w.life[i] = w.life[j]!;
  w.life[j] = l;
  w.moved[i] = 1;
  w.moved[j] = 1;
}

/**
 * Move into the cell below: empty first, else sink through a lighter fluid.
 * Densities must differ by more than 0.05 so close pairs still separate.
 */
function tryDown(w: World, x: number, y: number): boolean {
  if (!inBounds(w, x, y + 1)) return false;
  const i = y * w.width + x;
  const j = (y + 1) * w.width + x;
  const other = w.cells[j]!;
  if (other === EMPTY) return w.moved[j] === 0 && swapInto(w, i, j);
  if (w.moved[j] === 1) return false;
  const mine = PROPS[w.cells[i]! - 1]!;
  const theirs = PROPS[other - 1]!;
  if (isFluid(theirs) && isFluid(mine) && mine.dens > theirs.dens + 0.05) {
    return swapInto(w, i, j);
  }
  return false;
}

/**
 * Move into the cell above: empty first, else float up through a denser fluid.
 */
function tryUp(w: World, x: number, y: number): boolean {
  if (!inBounds(w, x, y - 1)) return false;
  const i = y * w.width + x;
  const j = (y - 1) * w.width + x;
  const other = w.cells[j]!;
  if (other === EMPTY) return w.moved[j] === 0 && swapInto(w, i, j);
  if (w.moved[j] === 1) return false;
  const mine = PROPS[w.cells[i]! - 1]!;
  const theirs = PROPS[other - 1]!;
  if (isFluid(theirs) && isFluid(mine) && mine.dens < theirs.dens - 0.05) {
    return swapInto(w, i, j);
  }
  return false;
}

function isFluid(p: MaterialProps): boolean {
  return p.state === "liquid" || p.state === "gas";
}

function swapInto(w: World, i: number, j: number): boolean {
  swap(w, i, j);
  return true;
}

/** Swap into an empty, unmoved neighbour cell. */
function tryMove(w: World, x: number, y: number, nx: number, ny: number): boolean {
  if (!inBounds(w, nx, ny)) return false;
  const j = ny * w.width + nx;
  if (w.cells[j] !== EMPTY || w.moved[j] === 1) return false;
  return swapInto(w, y * w.width + x, j);
}

function movePowder(w: World, x: number, y: number): void {
  if (tryDown(w, x, y)) return;
  const dir = w.random() < 0.5 ? 1 : -1;
  // Diagonal slide only into empty cells, so grains tumble off a pile and
  // then come to rest instead of skating along the floor.
  if (tryMove(w, x, y, x + dir, y + 1)) return;
  tryMove(w, x, y, x - dir, y + 1);
}

function moveLiquid(w: World, x: number, y: number): void {
  if (tryDown(w, x, y)) return;
  const dir = w.random() < 0.5 ? 1 : -1;
  if (tryMove(w, x, y, x + dir, y + 1)) return;
  if (tryMove(w, x, y, x - dir, y + 1)) return;
  // Spread sideways, up to a few cells so pools level out.
  const i = y * w.width + x;
  for (const d of [dir, -dir]) {
    let target = -1;
    for (let step = 1; step <= 3; step++) {
      const nx = x + d * step;
      if (!inBounds(w, nx, y)) break;
      const j = y * w.width + nx;
      if (w.cells[j] !== EMPTY || w.moved[j] === 1) break;
      target = j;
    }
    if (target >= 0) {
      swap(w, i, target);
      return;
    }
  }
}

function moveGas(w: World, x: number, y: number, drift: number): void {
  // Rise first so gas climbs out of liquid rather than skimming sideways.
  if (tryUp(w, x, y)) return;
  const dir = w.random() < 0.5 ? 1 : -1;
  if (tryMove(w, x, y, x + dir, y - 1)) return;
  if (tryMove(w, x, y, x - dir, y - 1)) return;
  if (w.random() < drift && tryMove(w, x, y, x + dir, y)) return;
  tryMove(w, x, y, x - dir, y);
}

function stepMovement(w: World): void {
  w.moved.fill(0);
  // Bottom-up; alternate scan direction per row and tick to avoid bias.
  for (let y = w.height - 1; y >= 0; y--) {
    const ltr = (y + w.tick) % 2 === 0;
    for (let k = 0; k < w.width; k++) {
      const x = ltr ? k : w.width - 1 - k;
      const i = y * w.width + x;
      const id = w.cells[i]!;
      if (id === EMPTY || w.moved[i] === 1) continue;
      const p = PROPS[id - 1]!;
      switch (p.state) {
        case "powder":
          movePowder(w, x, y);
          break;
        case "liquid":
          moveLiquid(w, x, y);
          break;
        case "gas":
          moveGas(w, x, y, 0.3);
          break;
        case "energy":
          moveGas(w, x, y, 0.5);
          break;
        case "solid":
          break;
      }
    }
  }
}

function decay(w: World): void {
  for (let i = 0; i < w.cells.length; i++) {
    const id = w.cells[i]!;
    if (id === EMPTY) continue;
    const state = PROPS[id - 1]!.state;
    if (state !== "gas" && state !== "energy") continue;
    const l = w.life[i]!;
    if (l <= 1) {
      // Steam condenses back to water sometimes; other gases just fade.
      if (nameOf(id) === "Steam" && w.random() < 0.25) {
        w.cells[i] = idOf("Water");
        w.life[i] = 0;
      } else {
        w.cells[i] = EMPTY;
        w.life[i] = 0;
      }
    } else {
      w.life[i] = l - 1;
    }
  }
}

const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [0, 1], [-1, 0], [1, 0], [0, -1],
];

function applyResult(w: World, i: number, name: MaterialName | null): void {
  const id = name === null ? EMPTY : idOf(name);
  w.cells[i] = id;
  w.life[i] = lifeFor(id, w.random);
  w.reacted[i] = 1;
}

function stepReactions(w: World): void {
  w.reacted.fill(0);
  for (let y = w.height - 1; y >= 0; y--) {
    const ltr = (y + w.tick) % 2 === 1;
    for (let k = 0; k < w.width; k++) {
      const x = ltr ? k : w.width - 1 - k;
      const i = y * w.width + x;
      const aId = w.cells[i]!;
      if (aId === EMPTY || w.reacted[i] === 1) continue;
      const aName = nameOf(aId)!;
      // One random neighbour order per cell keeps runs deterministic.
      const first = Math.floor(w.random() * 4);
      for (let n = 0; n < 4; n++) {
        const [dx, dy] = NEIGHBOURS[(first + n) % 4]!;
        const nx = x + dx;
        const ny = y + dy;
        if (!inBounds(w, nx, ny)) continue;
        const j = ny * w.width + nx;
        const bId = w.cells[j]!;
        if (bId === EMPTY || bId === aId || w.reacted[j] === 1) continue;
        const bName = nameOf(bId)!;
        const [sym] = reaction(aName, bName);
        if (sym === "." || sym === "^") continue; // density handled by movement
        const out = resolveOutcome(aName, bName, sym, w.random());
        if (out === null) continue; // failed chance roll: leave both cells
        const aChanged = out.a !== aName;
        const bChanged = out.b !== bName;
        if (!aChanged && !bChanged) continue;
        if (aChanged) applyResult(w, i, out.a);
        if (bChanged) applyResult(w, j, out.b);
        break; // one reaction per cell per tick
      }
    }
  }
}

/** Advance the world one fixed tick: reactions, movement, gas/energy decay. */
export function stepWorld(w: World): void {
  stepReactions(w);
  stepMovement(w);
  decay(w);
  w.tick++;
}

export function countMaterial(w: World, name: MaterialName): number {
  const id = idOf(name);
  let n = 0;
  for (const c of w.cells) if (c === id) n++;
  return n;
}

export function clearWorld(w: World): void {
  w.cells.fill(EMPTY);
  w.life.fill(0);
  w.moved.fill(0);
}
