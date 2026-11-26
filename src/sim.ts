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

const WATER_ID = idOf("Water");
const STEAM_ID = idOf("Steam");

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
  /**
   * Ticks of heat left for materials that set when they cool (lava, molten
   * metal). 0 for everything else. Contact with something it melts or burns
   * spends heat faster, so a pour does finite work instead of multiplying.
   */
  readonly heat: Uint16Array;
  /**
   * Last sideways direction a liquid cell took: 1 = came from the left,
   * 2 = came from the right, 0 = none. Used to stop two cells swapping back
   * and forth, which showed as a flickering, permanently holed water surface.
   */
  readonly dir: Uint8Array;
  /**
   * What each cell was made from, as a material id. Steam made by boiling
   * water carries Water; steam poured straight from the picker carries 0 and
   * simply fades. Without this, poured steam "condensed" into water out of
   * nothing and the water count grew.
   */
  readonly origin: Uint8Array;
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
    heat: new Uint16Array(n),
    dir: new Uint8Array(n),
    origin: new Uint8Array(n),
    tick: 0,
    random: makeRandom(seed),
  };
}

const GAS_LIFE = 220;
/** Energy lingers roughly 1-2 seconds, with flicker so flames dance. */
const ENERGY_LIFE = 90;
/** Lightning must survive the fall from the top of the screen to the floor. */
const BOLT_LIFE = 150;

function lifeFor(id: CellId, random: () => number): number {
  if (id === EMPTY) return 0;
  const state = PROPS[id - 1]!.state;
  if (state === "energy") {
    // Lightning has to reach the ground before it fades, so it lives longer
    // than a flame. Fire and spark use the normal short burn.
    if (nameOf(id) === "Lightning") return Math.round(BOLT_LIFE * (0.8 + random() * 0.4));
    // Vary the burn time per cell; a uniform life makes flames pop out flat.
    return Math.round(ENERGY_LIFE * (0.55 + random() * 0.9));
  }
  if (state === "gas") return GAS_LIFE;
  return 0;
}

/** Heat left before a hot material sets. Only meaningful for `cool` materials. */
function heatFor(id: CellId): number {
  if (id === EMPTY) return 0;
  return PROPS[id - 1]!.cool;
}

export function setCell(w: World, x: number, y: number, name: MaterialName | null): void {
  if (x < 0 || y < 0 || x >= w.width || y >= w.height) return;
  const i = y * w.width + x;
  const id = name === null ? EMPTY : idOf(name);
  w.cells[i] = id;
  w.life[i] = lifeFor(id, w.random);
  w.heat[i] = heatFor(id);
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
  const h = w.heat[i]!;
  w.heat[i] = w.heat[j]!;
  w.heat[j] = h;
  const d = w.dir[i]!;
  w.dir[i] = w.dir[j]!;
  w.dir[j] = d;
  const o = w.origin[i]!;
  w.origin[i] = w.origin[j]!;
  w.origin[j] = o;
  w.moved[i] = 1;
  w.moved[j] = 1;
}

/**
 * Move into the cell below: empty first, else sink through lighter stuff.
 * Anything denser than a liquid or gas below it pushes through, so a grain
 * dropped into steam or water keeps falling instead of perching on the
 * surface and looking like it is stuck in mid-air.
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
  if (isDisplaceable(theirs) && mine.dens > theirs.dens + 0.05) {
    return swapInto(w, i, j);
  }
  return false;
}

/**
 * Move into the cell above: empty first, else float up through denser stuff.
 * A gas escapes upward through powder as well as liquid, so a puff buried in
 * a sandpile is not trapped forever.
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
  // Steam and other gases push up through loose powder instead of being
  // sealed under it.
  if (mine.state === "gas" && theirs.state === "powder" && mine.dens < theirs.dens) {
    return swapInto(w, i, j);
  }
  return false;
}

function isFluid(p: MaterialProps): boolean {
  return p.state === "liquid" || p.state === "gas";
}

/**
 * Cells a denser material may push through. Loose powder counts: a grain of
 * sand dropped into steam or water must keep sinking, otherwise it perches on
 * the surface and reads as stuck in mid-air. Solid structure is never pushed.
 */
function isDisplaceable(p: MaterialProps): boolean {
  return p.state === "liquid" || p.state === "gas" || p.state === "powder";
}

function swapInto(w: World, i: number, j: number): boolean {
  swap(w, i, j);
  return true;
}

/**
 * Fixed structure never moves. A solid that is lighter than water (wood, ice,
 * sponge) still has to obey gravity: it falls through empty space, and floats
 * up through a denser liquid. That is the only motion a solid has.
 */
function moveSolid(w: World, x: number, y: number, mine: MaterialProps): void {
  if (mine.dens >= 1.0) return;
  const i = y * w.width + x;
  if (tryDown(w, x, y)) return;
  if (!inBounds(w, x, y - 1)) return;
  const j = (y - 1) * w.width + x;
  const other = w.cells[j]!;
  if (other === EMPTY || w.moved[j] === 1) return;
  const theirs = PROPS[other - 1]!;
  if (theirs.state === "liquid" && mine.dens < theirs.dens - 0.05) {
    swapInto(w, i, j);
  }
}

/** Swap into an empty, unmoved neighbour cell. */
function tryMove(w: World, x: number, y: number, nx: number, ny: number): boolean {
  if (!inBounds(w, nx, ny)) return false;
  const j = ny * w.width + nx;
  if (w.cells[j] !== EMPTY || w.moved[j] === 1) return false;
  return swapInto(w, y * w.width + x, j);
}

/**
 * Powders tumble down a slope with a per-material chance, so a steep pile of
 * wet soil or wax holds its shape while dry sand runs to its natural angle.
 */
function movePowder(w: World, x: number, y: number, mob: number): void {
  if (tryDown(w, x, y)) return;
  const dir = w.random() < 0.5 ? 1 : -1;
  // Diagonal slide only into empty cells, so grains tumble off a pile and
  // then come to rest instead of skating along the floor.
  if (w.random() < mob && tryMove(w, x, y, x + dir, y + 1)) return;
  if (w.random() < mob && tryMove(w, x, y, x - dir, y + 1)) return;
}

/** How much of one liquid a column holds: a cheap stand-in for its pressure. */
function columnWater(w: World, x: number, id: CellId): number {
  let n = 0;
  for (let y = 0; y < w.height; y++) if (w.cells[y * w.width + x] === id) n++;
  return n;
}

/**
 * Liquids fall, then level out by flowing into a column that holds less of
 * the same liquid. A settled pool must be perfectly still, so three things
 * are true of every sideways move:
 *   - it covers ONE cell, so no gap is ever jumped over and left behind;
 *   - it needs open space to drop into or a shallower column to flow to, so
 *     the pool gets flatter and then stops for good;
 *   - a cell remembers the direction it last flowed and will not immediately
 *     reverse, so two cells can never swap back and forth.
 * The old rule jumped up to three cells into any empty space. That skipped
 * over cells, leaving permanent holes, and let pairs swap forever: the
 * flickering, dotted surface the owner reported.
 */
function moveLiquid(w: World, x: number, y: number, spread: number, id: CellId): void {
  if (tryDown(w, x, y)) {
    w.dir[y * w.width + x] = 0;
    return;
  }
  const i = y * w.width + x;
  const here = columnWater(w, x, id);
  const d = w.random() < 0.5 ? 1 : -1;
  const mem = w.dir[i]!;
  const order = mem === 1 ? [-1, 1] : mem === 2 ? [1, -1] : [d, -d];
  let target = -1;
  for (const dd of order) {
    if (mem === 1 && dd === 1) continue; // it came from the left; do not go back
    if (mem === 2 && dd === -1) continue;
    for (let step = 1; step <= spread; step++) {
      const nx = x + dd * step;
      if (!inBounds(w, nx, y)) break;
      const j = y * w.width + nx;
      if (w.cells[j] !== EMPTY || w.moved[j] === 1) break;
      const drop = y + 1 < w.height && w.cells[j + w.width] === EMPTY;
      if (drop || columnWater(w, nx, id) < here) {
        target = nx;
        break;
      }
    }
    if (target >= 0) break;
  }
  if (target < 0) return;
  const dd = target > x ? 1 : -1;
  swap(w, i, y * w.width + target);
  w.dir[i] = 0;
  w.dir[y * w.width + target] = dd > 0 ? 2 : 1;
}

/**
 * A bolt: falls fast, then forks sideways into whatever is in the way. Unlike
 * fire it does not rise, because lightning travels from cloud to ground.
 */
function moveBolt(w: World, x: number, y: number, drift: number): void {
  // A strike runs DOWN in a jagged line: it takes the diagonal nearly as often
  // as the straight drop, which reads as forking rather than falling.
  const dir = w.random() < 0.5 ? 1 : -1;
  if (w.random() < 0.55) {
    if (tryMove(w, x, y, x + dir, y + 1)) return;
    if (tryMove(w, x, y, x - dir, y + 1)) return;
  }
  if (tryDown(w, x, y)) return;
  if (tryMove(w, x, y, x + dir, y + 1)) return;
  if (tryMove(w, x, y, x - dir, y + 1)) return;
  // It has hit something solid: arc along that surface. `drift` is how far it
  // crawls per tick, so a strike across a wide metal plate spreads out.
  const steps = Math.max(1, Math.round(drift));
  for (let s = 0; s < steps; s++) {
    if (!tryMove(w, x, y, x + dir, y)) break;
    x += dir;
  }
  for (let s = 0; s < steps; s++) {
    if (!tryMove(w, x, y, x - dir, y)) break;
    x -= dir;
  }
}

function moveGas(w: World, x: number, y: number, drift: number, rise: number): void {
  // Rise first so gas climbs out of liquid rather than skimming sideways.
  // `rise` is buoyancy: light gas leaps up several cells, a heavy haze crawls.
  let climbed = 0;
  while (climbed < rise && tryUp(w, x, y)) {
    y -= 1;
    climbed++;
  }
  if (climbed > 0) return;
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
    const ltr = y % 2 === 0;
    for (let k = 0; k < w.width; k++) {
      const x = ltr ? k : w.width - 1 - k;
      const i = y * w.width + x;
      const id = w.cells[i]!;
      if (id === EMPTY || w.moved[i] === 1) continue;
      const p = PROPS[id - 1]!;
      switch (p.state) {
        case "powder":
          movePowder(w, x, y, p.mob);
          break;
        case "liquid":
          moveLiquid(w, x, y, Math.max(1, p.spread), id);
          break;
        case "gas":
          moveGas(w, x, y, p.drift, Math.max(1, p.rise));
          break;
        case "energy":
          // Lightning strikes downward and spits sideways; fire licks upward.
          if (p.rise === 0) moveBolt(w, x, y, p.drift);
          else moveGas(w, x, y, p.drift, Math.max(1, p.rise));
          break;
        case "solid":
          // Fixed structure never moves on its own. Light solids do float up
          // through a denser liquid (wood, sponge), which is all a solid does.
          moveSolid(w, x, y, p);
          break;
      }
    }
  }
}

function decay(w: World): void {
  for (let i = 0; i < w.cells.length; i++) {
    const id = w.cells[i]!;
    if (id === EMPTY) continue;
    const p = PROPS[id - 1]!;

    if (p.state === "gas" || p.state === "energy") {
      const l = w.life[i]!;
      if (l > 1) {
        w.life[i] = l - 1;
      } else if (p.state === "gas" && id === STEAM_ID && w.origin[i] === WATER_ID) {
        // Steam that was boiled out of water condenses back into it. Steam
        // poured straight from the picker has no origin and simply fades,
        // otherwise every pour invented water out of nothing.
        w.cells[i] = WATER_ID;
        w.life[i] = 0;
        w.origin[i] = 0;
      } else {
        w.cells[i] = EMPTY;
        w.life[i] = 0;
      }
      continue;
    }

    // Hot materials set back into a solid once their heat runs out, so a
    // pour of lava or molten metal cools instead of staying hot forever.
    if (p.cool > 0) {
      const h = w.heat[i]!;
      if (h > 1) {
        w.heat[i] = h - 1;
      } else if (p.coolto) {
        w.cells[i] = idOf(p.coolto);
        w.life[i] = lifeFor(w.cells[i]!, w.random);
        w.heat[i] = heatFor(w.cells[i]!);
      } else {
        w.heat[i] = 0;
      }
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
  w.heat[i] = heatFor(id);
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
        // Melting spends heat. When a hot cell changes its partner, the source pays a fixed cost and the new cell gets only
        // half of it. A cell without the heat to pay cannot melt anything, so a
        // pour does a bounded amount of work instead of eating the whole scene.
        let spendFrom = -1;
        let cost = 0;
        if (bChanged && !aChanged && PROPS[aId - 1]!.cool > 0) {
          spendFrom = i;
          cost = Math.floor(PROPS[aId - 1]!.cool / 6);
        } else if (aChanged && !bChanged && PROPS[bId - 1]!.cool > 0) {
          spendFrom = j;
          cost = Math.floor(PROPS[bId - 1]!.cool / 6);
        }
        if (spendFrom >= 0 && w.heat[spendFrom]! <= cost) continue;
        // Remember what a new cell came from when it is steam boiled out of
        // water, so it can condense back into that water later.
        if (aChanged) {
          applyResult(w, i, out.a);
          if (out.a === "Steam" && aName === "Water") w.origin[i] = WATER_ID;
        }
        if (bChanged) applyResult(w, j, out.b);
        if (spendFrom >= 0) {
          const child = spendFrom === i ? j : i;
          w.heat[spendFrom] = w.heat[spendFrom]! - cost;
          if (PROPS[w.cells[child]! - 1]?.cool) w.heat[child] = Math.max(1, Math.floor(cost / 2));
        }
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
  w.heat.fill(0);
  w.dir.fill(0);
  w.origin.fill(0);
  w.moved.fill(0);
}
