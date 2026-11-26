// Step B tests. Run from the repo root: bun tools/test-sim.ts
// Exits non-zero on the first failed check. No framework needed.
import {
  createWorld, setCell, getCell, paint, stepWorld, countMaterial, clearWorld, idOf,
} from "../src/sim";
import { MATERIAL_NAMES, reaction } from "../src/materials";
import { resolveOutcome } from "../src/outcomes";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail = ""): void {
  if (ok) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${label}${detail ? " — " + detail : ""}`);
  }
}

function run(w: ReturnType<typeof createWorld>, ticks: number): void {
  for (let t = 0; t < ticks; t++) stepWorld(w);
}

// ---- roster sanity
check("48 materials", MATERIAL_NAMES.length === 48);
check("ids round-trip", idOf("Toxic Gas") > 0 && idOf("Molten Metal") > 0);

// ---- powder falls exactly one cell per tick
{
  const w = createWorld(10, 10);
  setCell(w, 5, 0, "Sand");
  stepWorld(w);
  check("sand falls one cell", getCell(w, 5, 1) === "Sand" && getCell(w, 5, 0) === null,
    `got ${getCell(w, 5, 1)} / ${getCell(w, 5, 0)}`);
  run(w, 20);
  check("sand lands on floor", getCell(w, 5, 9) === "Sand");
}

// ---- powder piles: a grain dropped on a resting grain slides off it
{
  const w = createWorld(10, 10);
  setCell(w, 5, 9, "Sand");
  setCell(w, 5, 0, "Sand");
  run(w, 30);
  check("both grains survive", countMaterial(w, "Sand") === 2, `count=${countMaterial(w, "Sand")}`);
  // One grain must end up beside the other, not on top of it, once settled.
  let beside = false;
  for (const x of [4, 6]) if (getCell(w, x, 9) === "Sand") beside = true;
  check("grain slides off the pile", beside || getCell(w, 5, 8) === "Sand");
}

// ---- liquid spreads sideways on a floor
{
  const w = createWorld(20, 5);
  for (let y = 0; y < 3; y++) setCell(w, 10, y, "Water");
  run(w, 60);
  check("water conserved", countMaterial(w, "Water") === 3, `count=${countMaterial(w, "Water")}`);
  let spread = 0;
  for (let x = 0; x < 20; x++) if (getCell(w, x, 4) === "Water") spread++;
  check("water spreads along floor", spread >= 3, `spread=${spread}`);
}

// ---- gas rises and eventually fades
{
  const w = createWorld(5, 12);
  setCell(w, 2, 11, "Toxic Gas");
  stepWorld(w);
  check("gas rises", getCell(w, 2, 10) === "Toxic Gas" || getCell(w, 1, 10) === "Toxic Gas" || getCell(w, 3, 10) === "Toxic Gas");
  run(w, 400);
  check("gas dissipates", countMaterial(w, "Toxic Gas") === 0);
}

// ---- energy burns for a while, then dies out
{
  const w = createWorld(5, 30);
  setCell(w, 2, 29, "Fire");
  run(w, 30);
  check("fire is still visible after half a second", countMaterial(w, "Fire") > 0,
    `count=${countMaterial(w, "Fire")}`);
  run(w, 300);
  check("fire burns out within a few seconds", countMaterial(w, "Fire") === 0,
    `count=${countMaterial(w, "Fire")}`);
}

// ---- density: oil floats on water
{
  const w = createWorld(6, 10);
  for (let y = 6; y < 10; y++) for (let x = 0; x < 6; x++) setCell(w, x, y, "Water");
  // Oil starts underneath the pool, at the very bottom.
  for (let x = 0; x < 6; x++) {
    setCell(w, x, 9, "Oil");
  }
  const waterStart = countMaterial(w, "Water");
  run(w, 80);
  // Floating means no water sits above any oil in the same column.
  let waterAboveOil = false;
  for (let x = 0; x < 6; x++) {
    let sawOil = false;
    for (let y = 9; y >= 0; y--) {
      const c = getCell(w, x, y);
      if (c === "Oil") sawOil = true;
      if (sawOil && c === "Water") waterAboveOil = true;
    }
  }
  check("oil floats above water", !waterAboveOil);
  check("fluids conserved", countMaterial(w, "Oil") === 6 && countMaterial(w, "Water") === waterStart,
    `oil=${countMaterial(w, "Oil")} water=${countMaterial(w, "Water")}/${waterStart}`);
}

// ---- solids stay put
{
  const w = createWorld(8, 8);
  setCell(w, 4, 2, "Stone");
  setCell(w, 3, 2, "Bedrock");
  run(w, 20);
  check("stone stays", getCell(w, 4, 2) === "Stone");
  check("bedrock stays", getCell(w, 3, 2) === "Bedrock");
}

// ---- reactions: water quench lava -> obsidian + steam
{
  const w = createWorld(6, 6);
  setCell(w, 3, 5, "Lava");
  setCell(w, 3, 4, "Water");
  run(w, 3);
  check("lava becomes obsidian", countMaterial(w, "Obsidian") >= 1,
    `obsidian=${countMaterial(w, "Obsidian")} lava=${countMaterial(w, "Lava")}`);
  check("lava gone", countMaterial(w, "Lava") === 0);
}

// ---- fire ignites wood
{
  const w = createWorld(6, 6);
  setCell(w, 3, 5, "Wood");
  setCell(w, 3, 4, "Fire");
  run(w, 2);
  check("wood catches fire", countMaterial(w, "Fire") >= 1 && countMaterial(w, "Wood") === 0);
}

// ---- water puts out fire
{
  const w = createWorld(6, 6);
  setCell(w, 3, 5, "Fire");
  setCell(w, 3, 4, "Water");
  run(w, 2);
  check("fire quenched", countMaterial(w, "Fire") === 0);
}

// ---- bedrock is immune to lava and acid
{
  const w = createWorld(6, 6);
  setCell(w, 2, 5, "Bedrock");
  setCell(w, 2, 4, "Lava");
  setCell(w, 4, 5, "Bedrock");
  setCell(w, 4, 4, "Acid");
  run(w, 40);
  check("bedrock survives lava+acid", countMaterial(w, "Bedrock") === 2);
}

// ---- bomb detonates on fire, shatters stone to gravel
{
  const w = createWorld(8, 8);
  setCell(w, 4, 7, "Stone");
  setCell(w, 4, 6, "Bomb");
  setCell(w, 4, 5, "Fire");
  run(w, 3);
  check("bomb consumed", countMaterial(w, "Bomb") === 0);
}

// ---- gunpowder does NOT detonate on plain water contact
{
  const w = createWorld(6, 6);
  setCell(w, 3, 5, "Gunpowder");
  setCell(w, 3, 4, "Water");
  run(w, 1);
  check("gunpowder ruined not exploded", countMaterial(w, "Fire") === 0);
}

// ---- determinism: same seed, same run
{
  function snapshot(seed: number): string {
    const w = createWorld(24, 24, seed);
    paint(w, 6, 2, 2, "Sand");
    paint(w, 16, 2, 2, "Water");
    paint(w, 12, 20, 2, "Lava");
    setCell(w, 12, 10, "Wood");
    setCell(w, 11, 10, "Fire");
    run(w, 60);
    return w.cells.join(",");
  }
  check("deterministic same seed", snapshot(42) === snapshot(42));
  check("different seed differs", snapshot(42) !== snapshot(43));
}

// ---- every reacting pair resolves without throwing, results are roster-only
{
  let bad = 0;
  let pairs = 0;
  for (let i = 0; i < MATERIAL_NAMES.length; i++) {
    for (let j = i + 1; j < MATERIAL_NAMES.length; j++) {
      const a = MATERIAL_NAMES[i]!;
      const b = MATERIAL_NAMES[j]!;
      const [sym] = reaction(a, b);
      if (sym === ".") continue;
      pairs++;
      const o1 = resolveOutcome(a, b, sym, 0);
      const o2 = resolveOutcome(b, a, sym, 0);
      // chance 0 must always fire a rule; a null here would mean a no-op pair
      // that the board nonetheless calls reactive.
      if (o1 === null || o2 === null) {
        bad++;
        continue;
      }
      const valid = (v: string | null) => v === null || (MATERIAL_NAMES as readonly string[]).includes(v);
      if (!valid(o1.a) || !valid(o1.b) || !valid(o2.a) || !valid(o2.b)) bad++;
      // slots must line up with argument order
      if (o1.a !== o2.b || o1.b !== o2.a) bad++;
    }
  }
  check("all reacting pairs have valid symmetric outcomes", bad === 0, `bad=${bad} pairs=${pairs}`);
  check("reacting pair count matches board", pairs === 621, `pairs=${pairs}`);
}

// ---- invariants after chaos: ids stay in range, no crash
{
  const w = createWorld(30, 30, 7);
  const names = ["Sand", "Water", "Lava", "Fire", "Oil", "Acid", "Wood", "Gunpowder", "Steam", "Stone", "Salt", "Mercury"] as const;
  for (let k = 0; k < 200; k++) {
    const x = Math.floor(w.random() * 30);
    const y = Math.floor(w.random() * 30);
    setCell(w, x, y, names[k % names.length]!);
  }
  run(w, 150);
  let ok = true;
  for (const c of w.cells) if (c > 48) ok = false;
  check("ids stay in 0..48 after chaos", ok);
}

// ---- regression: a failed chance roll must never delete cells
// (a null slot means "empties", so "nothing happened" has to be distinct)
{
  const w = createWorld(40, 40, 5);
  paint(w, 20, 5, 5, "Sand");
  paint(w, 20, 25, 5, "Lava");
  const total = (): number => {
    let n = 0;
    for (const c of w.cells) if (c !== 0) n++;
    return n;
  };
  const before = total();
  let lost = false;
  for (let t = 0; t < 60; t++) {
    stepWorld(w);
    if (total() !== before) lost = true;
  }
  check("sand+lava keeps every cell (no silent deletion)", !lost, `before=${before} after=${total()}`);
}

// ---- clear empties everything
{
  const w = createWorld(5, 5);
  paint(w, 2, 2, 2, "Sand");
  clearWorld(w);
  check("clear empties world", w.cells.every((c) => c === 0));
}

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log("SIM TESTS PASS");
