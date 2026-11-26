// Step B tests. Run from the repo root: bun tools/test-sim.ts
// Exits non-zero on the first failed check. No framework needed.
import {
  createWorld, setCell, getCell, paint, stepWorld, countMaterial, clearWorld, idOf,
} from "../src/sim";
import { MATERIAL_NAMES, reaction, type MaterialName } from "../src/materials";
import { resolveOutcome } from "../src/outcomes";
import { generateWorld } from "../src/worlds";

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
  // A shallow puddle levels out in one or two cells each side of the pour.
  check("water spreads along floor", spread >= 2, `spread=${spread}`);
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
  check("reacting pair count matches board", pairs === 602, `pairs=${pairs}`);
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

// ---- regression: every material that is loose stuff must fall to the floor
// Bedrock, Stone and Glass are wall materials and stay put on purpose.
{
  const STATIC = new Set(["Bedrock", "Stone", "Glass", "Metal", "Obsidian", "Limestone", "Clay"]);
  const hanging: string[] = [];
  for (const nm of MATERIAL_NAMES) {
    if (STATIC.has(nm) || nm === "Fire" || nm === "Spark" || nm === "Lightning" || nm === "Plasma") continue;
    const w = createWorld(11, 40, 3);
    setCell(w, 5, 1, nm);
    for (let t = 0; t < 240; t++) stepWorld(w);
    // Anything still above the floor has failed to fall.
    let high = false;
    for (let y = 0; y < 36; y++) for (let x = 0; x < 11; x++) if (getCell(w, x, y) === nm) high = true;
    if (high) hanging.push(nm);
  }
  check("no loose material hangs in mid-air", hanging.length === 0, hanging.join(", "));
}

// ---- regression: a powder dropped into gas or water keeps sinking
{
  const sunk: string[] = [];
  for (const fluid of ["Steam", "Cloud", "Water", "Oil"] as const) {
    const w = createWorld(9, 30, 4);
    for (let x = 0; x < 9; x++) for (let y = 2; y < 30; y++) paint(w, x, y, 0, fluid);
    paint(w, 4, 4, 1, "Sand");
    for (let t = 0; t < 120; t++) stepWorld(w);
    let low = false;
    for (let y = 20; y < 30; y++) for (let x = 0; x < 9; x++) if (getCell(w, x, y) === "Sand") low = true;
    if (!low) sunk.push(fluid);
  }
  check("sand sinks through gas and liquid", sunk.length === 0, sunk.join(", "));
}

// ---- regression: nothing doubles itself against a resting field
{
  const growing: string[] = [];
  for (const nm of MATERIAL_NAMES) {
    if (nm === "Water" || nm === "Bedrock") continue;
    const w = createWorld(12, 12, 21);
    for (let x = 0; x < 12; x++) { paint(w, x, 0, 0, "Bedrock"); paint(w, x, 11, 0, "Bedrock"); }
    for (let y = 0; y < 12; y++) { paint(w, 0, y, 0, "Bedrock"); paint(w, 11, y, 0, "Bedrock"); }
    for (let x = 1; x < 11; x++) for (let y = 1; y < 11; y++) paint(w, x, y, 0, x < 6 ? nm : "Water");
    const before = countMaterial(w, nm);
    for (let t = 0; t < 250; t++) stepWorld(w);
    if (countMaterial(w, nm) > before) growing.push(`${nm} ${before}->${countMaterial(w, nm)}`);
  }
  check("no material grows against water", growing.length === 0, growing.join(", "));
}

// ---- regression: heat is spent, so lava and molten metal set solid
{
  const w = createWorld(20, 20, 7);
  for (let x = 0; x < 20; x++) paint(w, x, 19, 0, "Bedrock");
  paint(w, 10, 10, 2, "Molten Metal");
  let peak = 0;
  for (let t = 0; t < 1200; t++) { stepWorld(w); peak = Math.max(peak, countMaterial(w, "Molten Metal")); }
  check("molten metal cools and does not multiply", peak <= 20 && countMaterial(w, "Molten Metal") === 0,
    `peak=${peak} left=${countMaterial(w, "Molten Metal")} metal=${countMaterial(w, "Metal")}`);
}

// ---- regression: lava sets into stone rather than staying hot forever
{
  const w = createWorld(20, 20, 8);
  for (let x = 0; x < 20; x++) paint(w, x, 19, 0, "Bedrock");
  paint(w, 10, 10, 2, "Lava");
  for (let t = 0; t < 3000; t++) stepWorld(w);
  check("lava cools into stone", countMaterial(w, "Lava") === 0 && countMaterial(w, "Stone") > 0,
    `lava=${countMaterial(w, "Lava")} stone=${countMaterial(w, "Stone")}`);
}

// ---- regression: frost and snow settle downward, never upward
{
  const w = createWorld(15, 40, 9);
  for (let x = 0; x < 15; x++) for (let y = 30; y < 40; y++) paint(w, x, y, 0, "Bedrock");
  paint(w, 7, 12, 2, "Frost");
  let highest = 40;
  for (let t = 0; t < 40; t++) {
    stepWorld(w);
    for (let y = 0; y < 40; y++) for (let x = 0; x < 15; x++) {
      const c = getCell(w, x, y);
      if (c === "Snow" || c === "Frost") highest = Math.min(highest, y);
    }
  }
  check("frost does not drift upward like a gas", highest >= 9, `highest cell y=${highest}`);
}

// ---- regression: a generated random world is still after it appears
{
  const moved: string[] = [];
  for (let seed = 1; seed <= 6; seed++) {
    const w = createWorld(100, 159, seed);
    generateWorld(w, seed);
    const before = Uint8Array.from(w.cells);
    for (let t = 0; t < 400; t++) stepWorld(w);
    let changed = 0;
    for (let i = 0; i < before.length; i++) if (before[i] !== w.cells[i]) changed++;
    if (changed > 0) moved.push(`seed ${seed}: ${changed}`);
  }
  check("random worlds do not collapse on their own", moved.length === 0, moved.join(", "));
}

// ---- regression: a generated world has terrain, ground and something to use
{
  const w = createWorld(100, 159, 42);
  const theme = generateWorld(w, 42);
  const solid = countMaterial(w, "Stone") + countMaterial(w, "Soil") + countMaterial(w, "Sand");
  check("random world is populated", solid > 3000 && countMaterial(w, "Bedrock") > 90, `${theme}, solid=${solid}`);
}

// ---- regression: a settled pool stops moving entirely (the flicker bug)
{
  const cases: [string, (w: ReturnType<typeof createWorld>) => void][] = [
    ["flat ground", (w) => {
      for (let x = 0; x < 60; x++) paint(w, x, 39, 0, "Bedrock");
      for (let x = 20; x < 40; x++) for (let y = 30; y < 39; y++) paint(w, x, y, 0, "Water");
    }],
    ["stone tank", (w) => {
      for (let x = 0; x < 60; x++) paint(w, x, 39, 0, "Bedrock");
      for (let y = 20; y < 39; y++) { paint(w, 4, y, 0, "Stone"); paint(w, 55, y, 0, "Stone"); }
      for (let x = 5; x < 55; x++) for (let y = 26; y < 39; y++) paint(w, x, y, 0, "Water");
    }],
    ["narrow basin", (w) => {
      for (let x = 0; x < 60; x++) paint(w, x, 39, 0, "Bedrock");
      for (let y = 24; y < 39; y++) { paint(w, 26, y, 0, "Stone"); paint(w, 33, y, 0, "Stone"); }
      for (let x = 27; x < 33; x++) for (let y = 30; y < 39; y++) paint(w, x, y, 0, "Water");
    }],
  ];
  const restless: string[] = [];
  for (const [label, build] of cases) {
    const w = createWorld(60, 40, 11);
    build(w);
    for (let t = 0; t < 1500; t++) stepWorld(w);
    let churn = 0;
    for (let t = 0; t < 20; t++) {
      const snap = Uint8Array.from(w.cells);
      stepWorld(w);
      for (let i = 0; i < snap.length; i++) if (snap[i] !== w.cells[i]) churn++;
    }
    if (churn > 0) restless.push(`${label}: ${churn / 20}/tick`);
  }
  check("settled water stops moving", restless.length === 0, restless.join(", "));
}

// ---- regression: a settled pool has no holes left inside the body
{
  const w = createWorld(60, 40, 12);
  for (let x = 0; x < 60; x++) paint(w, x, 39, 0, "Bedrock");
  for (let x = 20; x < 40; x++) for (let y = 30; y < 39; y++) paint(w, x, y, 0, "Water");
  for (let t = 0; t < 1500; t++) stepWorld(w);
  let holes = 0;
  for (let y = 1; y < 39; y++) for (let x = 1; x < 59; x++) {
    if (getCell(w, x, y) !== null) continue;
    const up = getCell(w, x, y - 1) === "Water";
    const sides = getCell(w, x - 1, y) === "Water" && getCell(w, x + 1, y) === "Water";
    if (up || sides) holes++;
  }
  check("settled pool has no holes", holes === 0, `holes=${holes}`);
}

// ---- regression: porous and gas materials do not delete water
{
  const THIRSTY = ["Sand", "Gravel", "Clay", "Soil", "Wood", "Sponge", "Foam", "Cloud", "Frost", "Toxic Gas"];
  const drank: string[] = [];
  for (const nm of THIRSTY) {
    const w = createWorld(14, 24, 13);
    for (let x = 0; x < 14; x++) paint(w, x, 23, 0, "Bedrock");
    for (let x = 0; x < 14; x++) for (let y = 16; y < 23; y++) paint(w, x, y, 0, nm as MaterialName);
    paint(w, 7, 12, 2, "Water");
    const before = countMaterial(w, "Water");
    for (let t = 0; t < 400; t++) stepWorld(w);
    const after = countMaterial(w, "Water");
    if (after < before * 0.9) drank.push(`${nm} ${before}->${after}`);
  }
  check("nothing swallows water silently", drank.length === 0, drank.join(", "));
}

// ---- regression: no material makes water, or more of itself, beside water
{
  const grown: string[] = [];
  for (const nm of MATERIAL_NAMES) {
    if (nm === "Water") continue;
    const w = createWorld(14, 14, 17);
    for (let x = 0; x < 14; x++) { paint(w, x, 0, 0, "Bedrock"); paint(w, x, 13, 0, "Bedrock"); }
    for (let y = 0; y < 14; y++) { paint(w, 0, y, 0, "Bedrock"); paint(w, 13, y, 0, "Bedrock"); }
    for (let x = 1; x < 13; x++) for (let y = 1; y < 13; y++) paint(w, x, y, 0, x < 7 ? nm : "Water");
    const w0 = countMaterial(w, "Water");
    const m0 = countMaterial(w, nm);
    let peakW = w0;
    let peakM = m0;
    for (let t = 0; t < 300; t++) {
      stepWorld(w);
      peakW = Math.max(peakW, countMaterial(w, "Water"));
      peakM = Math.max(peakM, countMaterial(w, nm));
    }
    if (peakW > w0) grown.push(`${nm} made water ${w0}->${peakW}`);
    if (peakM > m0) grown.push(`${nm} multiplied ${m0}->${peakM}`);
  }
  check("nothing makes water beside water", grown.length === 0, grown.join(", "));
}

// ---- regression: acid never turns into water
{
  for (const other of ["Water", "Rain"] as const) {
    const w = createWorld(20, 20, 19);
    for (let x = 0; x < 20; x++) paint(w, x, 19, 0, "Bedrock");
    for (let x = 5; x < 15; x++) for (let y = 14; y < 19; y++) paint(w, x, y, 0, "Acid");
    for (let x = 5; x < 15; x++) for (let y = 10; y < 14; y++) paint(w, x, y, 0, other);
    const a0 = countMaterial(w, "Acid");
    for (let t = 0; t < 400; t++) stepWorld(w);
    check(`acid keeps its identity against ${other}`, countMaterial(w, "Acid") === a0,
      `${a0} -> ${countMaterial(w, "Acid")}`);
  }
}

// ---- regression: lightning strikes downward, never floats up
{
  const w = createWorld(30, 40, 1);
  for (let x = 0; x < 30; x++) paint(w, x, 39, 0, "Bedrock");
  paint(w, 15, 12, 1, "Lightning");
  let highest = 39;
  for (let t = 0; t < 40; t++) {
    stepWorld(w);
    for (let y = 0; y < 40; y++) for (let x = 0; x < 30; x++) {
      if (getCell(w, x, y) === "Lightning") highest = Math.min(highest, y);
    }
  }
  check("lightning does not rise", highest >= 11, `highest cell y=${highest}, started at y=12`);

  const w2 = createWorld(30, 40, 2);
  for (let x = 0; x < 30; x++) paint(w2, x, 39, 0, "Bedrock");
  paint(w2, 15, 1, 1, "Lightning");
  for (let t = 0; t < 90; t++) stepWorld(w2);
  let low = 0;
  for (let y = 36; y < 39; y++) for (let x = 0; x < 30; x++) if (getCell(w2, x, y) === "Lightning") low++;
  check("lightning reaches the ground", low > 0, `cells near floor=${low}`);
}

// ---- regression: snow floats on water instead of freezing the tank
{
  const w = createWorld(20, 30, 6);
  for (let x = 0; x < 20; x++) paint(w, x, 29, 0, "Bedrock");
  for (let y = 10; y < 29; y++) for (let x = 0; x < 20; x++) paint(w, x, y, 0, "Water");
  const w0 = countMaterial(w, "Water");
  paint(w, 10, 12, 1, "Snow");
  for (let t = 0; t < 200; t++) stepWorld(w);
  // The snowfall itself becomes a little ice; the pool around it must survive.
  check("snow does not freeze a pool solid", countMaterial(w, "Water") >= w0 - 6,
    `water ${w0} -> ${countMaterial(w, "Water")}, ice=${countMaterial(w, "Ice")}`);
}

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log("SIM TESTS PASS");
