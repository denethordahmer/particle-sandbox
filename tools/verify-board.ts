// Verify src/materials.ts against the reaction board specification.
// Run from the repo root:
//   python3 tools/gen-materials.py --dump-only
//   bun tools/verify-board.ts [dump-path]
// Default dump path: /tmp/particle-board-expected.json
// Exits non-zero on any symbol or reason mismatch.
import { readFileSync } from "node:fs";
import { MATERIAL_NAMES, reaction, type MaterialName, type ReactionSymbol } from "../src/materials";

type Dump = { order: MaterialName[]; pairs: Record<string, [ReactionSymbol, string]> };

const dumpPath = process.argv[2] ?? "/tmp/particle-board-expected.json";
const expected = JSON.parse(readFileSync(dumpPath, "utf8")) as Dump;

let mismatches = 0;
let reacting = 0;
let checked = 0;

if (expected.order.length !== MATERIAL_NAMES.length) {
  console.error(`roster size differs: board ${expected.order.length}, TS ${MATERIAL_NAMES.length}`);
  process.exit(1);
}
for (let i = 0; i < expected.order.length; i++) {
  if (expected.order[i] !== MATERIAL_NAMES[i]) {
    console.error(`roster order differs at ${i}: board ${expected.order[i]}, TS ${MATERIAL_NAMES[i]}`);
    mismatches++;
  }
}

for (let i = 0; i < MATERIAL_NAMES.length; i++) {
  for (let j = i + 1; j < MATERIAL_NAMES.length; j++) {
    const a = MATERIAL_NAMES[i]!;
    const b = MATERIAL_NAMES[j]!;
    const want = expected.pairs[`${a}|${b}`];
    if (!want) {
      console.error(`missing from board dump: ${a} | ${b}`);
      mismatches++;
      continue;
    }
    const [sym, why] = reaction(a, b);
    const [revSym] = reaction(b, a);
    checked++;
    if (sym !== ".") reacting++;
    if (sym !== want[0] || why !== want[1]) {
      console.error(`${a} | ${b}: board=${want[0]} (${want[1]})  TS=${sym} (${why})`);
      mismatches++;
    }
    if (revSym !== sym) {
      console.error(`${a} | ${b}: not symmetric (${sym} vs ${revSym})`);
      mismatches++;
    }
  }
}

console.log(`checked ${checked} pairs, ${reacting} reacting, ${mismatches} mismatches`);
if (mismatches > 0) process.exit(1);
console.log("BOARD MATCH: zero diff");
