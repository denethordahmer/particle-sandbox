// Random world generator. Builds a complete, settled landscape that stays put
// when the simulation starts running.
//
// What keeps a generated world from collapsing:
//   - Terrain is stone under a thin powder crust, and the crust surface never
//     steps by more than one cell between neighbours, so no grain has an empty
//     diagonal to slide into. A column that would break this is left as bare
//     stone, which is solid and cannot move.
//   - Every liquid sits in a basin whose floor and walls are solid, with a rim
//     one cell above the waterline and a bare-stone margin so no powder ever
//     touches the liquid (soil would soak it, sand would drink it).
//   - Ore and gravel pockets sit fully enclosed in rock.
// Everything is driven by the seed, so a seed always gives the same world.
import type { MaterialName } from "./materials";
import { clearWorld, makeRandom, setCell, stepWorld, type World } from "./sim";

export type WorldTheme = "meadow" | "desert" | "tundra" | "canyon";
export const THEMES: readonly WorldTheme[] = ["meadow", "desert", "tundra", "canyon"];

type Rng = () => number;

interface LiquidKind {
  readonly fill: MaterialName;
  /** Basin lining; acid needs a wall it cannot etch. */
  readonly lining: MaterialName;
}

const WATER: LiquidKind = { fill: "Water", lining: "Stone" };

const THEME_LIQUIDS: Record<WorldTheme, readonly LiquidKind[]> = {
  meadow: [WATER, WATER, WATER],
  desert: [WATER, { fill: "Oil", lining: "Stone" }, { fill: "Tar", lining: "Stone" }],
  tundra: [WATER, { fill: "Mercury", lining: "Stone" }],
  canyon: [WATER, { fill: "Acid", lining: "Obsidian" }, { fill: "Oil", lining: "Stone" }],
};

function between(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Surface height per column, smooth enough that powder rests on it. */
function buildHeights(w: World, rng: Rng, theme: WorldTheme): number[] {
  const H = w.height;
  const W = w.width;
  const base = H * (theme === "canyon" ? 0.58 : 0.66);
  const amp = H * (theme === "desert" ? 0.07 : theme === "canyon" ? 0.12 : 0.09);
  const p1 = rng() * Math.PI * 2;
  const p2 = rng() * Math.PI * 2;
  const p3 = rng() * Math.PI * 2;
  const f1 = (Math.PI * 2 * between(rng, 1, 2)) / W;
  const f2 = (Math.PI * 2 * between(rng, 3, 5)) / W;
  const f3 = (Math.PI * 2 * between(rng, 7, 11)) / W;
  const top: number[] = [];
  for (let x = 0; x < W; x++) {
    const v = Math.sin(x * f1 + p1) * 0.6 + Math.sin(x * f2 + p2) * 0.3 + Math.sin(x * f3 + p3) * 0.1;
    top.push(Math.round(base + v * amp));
  }
  const lo = Math.round(H * 0.3);
  const hi = H - 10;
  for (let x = 0; x < W; x++) top[x] = clamp(top[x]!, lo, hi);
  return top;
}

/** Limit the step between neighbours to one cell, both ways. */
function smooth(top: number[]): void {
  for (let pass = 0; pass < 2; pass++) {
    for (let x = 1; x < top.length; x++) top[x] = clamp(top[x]!, top[x - 1]! - 1, top[x - 1]! + 1);
    for (let x = top.length - 2; x >= 0; x--) top[x] = clamp(top[x]!, top[x + 1]! - 1, top[x + 1]! + 1);
  }
}

interface Lake {
  readonly x0: number;
  readonly hw: number;
  readonly level: number;
  readonly depth: number;
  readonly kind: LiquidKind;
}

export function generateWorld(w: World, seed: number, theme?: WorldTheme): WorldTheme {
  const rng = makeRandom(seed ^ 0x9e3779b9);
  const chosen: WorldTheme = theme ?? THEMES[Math.floor(rng() * THEMES.length)]!;
  clearWorld(w);
  const W = w.width;
  const H = w.height;
  const floor = H - 1;

  const top = buildHeights(w, rng, chosen);
  smooth(top);

  // Lakes: flatten a shelf, then carve a basin into it.
  const lakes: Lake[] = [];
  const wantLakes = W > 150 ? between(rng, 2, 3) : between(rng, 1, 2);
  for (let attempt = 0; attempt < 12 && lakes.length < wantLakes; attempt++) {
    const hw = between(rng, 6, Math.max(7, Math.min(14, Math.floor(W / 8))));
    const margin = hw + 7;
    if (W < margin * 2 + 2) continue;
    const x0 = between(rng, margin, W - 1 - margin);
    if (lakes.some((l) => Math.abs(l.x0 - x0) < l.hw + hw + 14)) continue;
    let level = 0;
    for (let x = x0 - hw - 3; x <= x0 + hw + 3; x++) level += top[x]!;
    level = Math.round(level / (hw * 2 + 7));
    const depth = clamp(between(rng, 4, 9), 4, Math.max(4, floor - level - 6));
    const pool = THEME_LIQUIDS[chosen];
    lakes.push({ x0, hw, level, depth, kind: pool[Math.floor(rng() * pool.length)]! });
    for (let x = x0 - hw - 3; x <= x0 + hw + 3; x++) top[x] = level;
  }
  smooth(top);
  for (const l of lakes) {
    for (let x = l.x0 - l.hw - 3; x <= l.x0 + l.hw + 3; x++) top[x] = l.level;
  }

  // Columns that must stay bare stone: lake shelves, plus any column whose
  // powder would have an empty diagonal beside it.
  const bare = new Array<boolean>(W).fill(false);
  for (const l of lakes) {
    for (let x = l.x0 - l.hw - 3; x <= l.x0 + l.hw + 3; x++) bare[x] = true;
  }
  if (chosen === "canyon") {
    for (let x = 0; x < W; x++) if (rng() < 0.0 || top[x]! < H * 0.5) bare[x] = true;
  }
  for (let x = 0; x < W; x++) {
    if (bare[x]) continue;
    for (const nx of [x - 1, x + 1]) {
      if (nx >= 0 && nx < W && top[nx]! - top[x]! >= 2) bare[x] = true;
    }
  }

  const crustMat: MaterialName =
    chosen === "meadow" ? "Soil" : chosen === "desert" ? "Sand" : chosen === "tundra" ? "Gravel" : "Gravel";
  const crustDepth = chosen === "desert" ? 5 : 3;

  // Rock with strata bands, then the powder crust.
  const bandA = between(rng, 6, 10);
  const bandB = between(rng, 11, 16);
  for (let x = 0; x < W; x++) {
    for (let y = top[x]!; y < floor; y++) {
      const depthBelow = y - top[x]!;
      let mat: MaterialName = "Stone";
      if (depthBelow >= crustDepth + 2) {
        const band = (y + x * 0) % (bandA + bandB);
        if (band < 2) mat = "Limestone";
        else if (band >= bandA && band < bandA + 2) mat = "Clay";
      }
      if (!bare[x] && depthBelow < crustDepth) mat = crustMat;
      setCell(w, x, y, mat);
    }
    setCell(w, x, floor, "Bedrock");
  }

  // Basins.
  for (const l of lakes) {
    const wallL = l.x0 - l.hw;
    const wallR = l.x0 + l.hw;
    for (let x = wallL + 1; x <= wallR - 1; x++) {
      const u = (x - l.x0) / l.hw;
      const bottom = l.level + 2 + Math.round(l.depth * (1 - u * u));
      for (let y = l.level; y < bottom; y++) setCell(w, x, y, y === l.level ? null : l.kind.fill);
      // Floor and its second row use the lining so acid has nothing to eat.
      setCell(w, x, bottom, l.kind.lining);
      setCell(w, x, bottom + 1, l.kind.lining);
    }
    for (const wx of [wallL, wallR]) {
      for (let y = l.level; y < floor; y++) setCell(w, wx, y, l.kind.lining);
    }
  }

  // Ore and gravel pockets, fully inside rock.
  const ores: readonly MaterialName[] =
    chosen === "desert"
      ? ["Salt", "Iron Ore", "Gold", "Sulphur"]
      : ["Coal", "Iron Ore", "Gold", "Sulphur", "Gravel", "Salt"];
  const pockets = Math.max(3, Math.floor(W / 14));
  for (let k = 0; k < pockets; k++) {
    const x = between(rng, 4, W - 5);
    const r = between(rng, 1, 3);
    const y = between(rng, top[x]! + crustDepth + 5, floor - 4);
    if (y + r >= floor - 1) continue;
    if (lakes.some((l) => Math.abs(x - l.x0) <= l.hw + 6)) continue;
    const ore = ores[Math.floor(rng() * ores.length)]!;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r + 1) continue;
        const px = x + dx;
        const py = y + dy;
        if (px < 1 || px >= W - 1 || py <= top[px]! + crustDepth + 2 || py >= floor - 1) continue;
        setCell(w, px, py, ore);
      }
    }
  }

  // Surface dressing on crust columns.
  let lastTree = -99;
  for (let x = 3; x < W - 3; x++) {
    if (bare[x]) continue;
    if (chosen === "meadow" && x - lastTree >= 7 && rng() < 0.14) {
      const h = between(rng, 4, 7);
      for (let i = 1; i <= h; i++) setCell(w, x, top[x]! - i, "Wood");
      const bx = rng() < 0.5 ? -1 : 1;
      setCell(w, x + bx, top[x]! - h, "Wood");
      setCell(w, x - bx, top[x]! - h + 1, "Wood");
      lastTree = x;
    }
    if (chosen === "desert" && rng() < 0.05) {
      for (let dx = 0; dx < 5 && x + dx < W - 1; dx++) {
        if (bare[x + dx]) break;
        for (let i = 0; i < 2; i++) setCell(w, x + dx, top[x + dx]! + i, "Salt");
      }
    }
    if (chosen === "tundra" && rng() < 0.03) {
      for (let i = 1; i <= 2; i++) setCell(w, x, top[x]! - i, "Ice");
    }
  }
  // Let loose grains find their resting places before the player sees it,
  // so the world is already still when it appears.
  for (let t = 0; t < 300; t++) stepWorld(w);
  w.tick = 0;
  return chosen;
}
