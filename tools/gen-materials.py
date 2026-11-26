#!/usr/bin/env python3
"""Generate src/materials.ts from tools/reaction-board.py (single source of truth).

Usage, from the repo root:
  python3 tools/gen-materials.py               regenerate src/materials.ts + board dump
  python3 tools/gen-materials.py --dump-only   only write the expected-board dump

The dump feeds tools/verify-board.ts (run with bun), which diffs every pair.
Loads the board script with a stubbed PIL so its M / ORDER / E tables and the
pair() engine run unchanged.
"""
import json
import sys
import types
from collections import Counter

# Stub PIL so the board script imports without rendering anything.
pil = types.ModuleType("PIL")
image_mod = types.ModuleType("PIL.Image")
draw_mod = types.ModuleType("PIL.ImageDraw")
font_mod = types.ModuleType("PIL.ImageFont")
image_mod.Image = object
pil.Image = image_mod
pil.ImageDraw = draw_mod
pil.ImageFont = font_mod
sys.modules["PIL"] = pil
sys.modules["PIL.Image"] = image_mod
sys.modules["PIL.ImageDraw"] = draw_mod
sys.modules["PIL.ImageFont"] = font_mod

src = open("tools/reaction-board.py").read()
# Everything from FILL onwards is image rendering; the data model ends before it.
cut = src.index("\nFILL = ")
g = {"__name__": "board"}
exec(compile(src[:cut], "reaction-board.py", "exec"), g)

M, ORDER, E, SPECIAL = g["M"], g["ORDER"], g["E"], g["SPECIAL"]
pair = g["pair"]
assert len(ORDER) == 48

# --- live explicit pairs, in first-appearance order, last write wins (dict semantics)
seen = {}
order_keys = []
dead = 0
for a, b, s, w in E:
    if a in M and b in M:
        key = frozenset((a, b))
        if key not in seen:
            order_keys.append(key)
        seen[key] = (a, b, s, w)
    else:
        dead += 1
live = [seen[k] for k in order_keys]
print(f"live explicit pairs: {len(live)}  (dead entries skipped: {dead})")

# --- auto Bomb-shatter rule, same order as the script
auto = []
for nm in ORDER:
    if M[nm]["shatter"] and nm != "Bomb" and frozenset(("Bomb", nm)) not in SPECIAL:
        auto.append(nm)
print(f"auto Bomb-shatter additions: {len(auto)} -> {auto}")

# --- full board
board = {}
counts = Counter()
for i in range(len(ORDER)):
    for j in range(i + 1, len(ORDER)):
        s, w = pair(ORDER[i], ORDER[j])
        board[f"{ORDER[i]}|{ORDER[j]}"] = [s, w]
        counts[s] += 1
reacting = sum(v for k, v in counts.items() if k != ".")
print(f"reacting pairs: {reacting} / 1128   symbols: {dict(counts)}")

DUMP_PATH = "/tmp/particle-board-expected.json"

def js(s):
    return json.dumps(s, ensure_ascii=False)

# --- emit TypeScript
BOOLS = ["explode", "conduct", "inert", "soluble", "absorb", "acidic", "freezable", "shatter"]
NUM_DEFAULTS = {"dens": 1.0, "heat": 0, "melt": 99, "ignite": 0, "chill": 0,
                "fuel": 0, "acidvuln": 0}

lines = []
lines.append("// Generated from tools/reaction-board.py — the physics specification.")
lines.append("// Regenerate with tools/gen-materials.py; do not hand-edit the tables.")
lines.append("// If game behaviour and the board disagree, the board wins.")
lines.append("")
lines.append("export const MATERIAL_NAMES = [")
for k in range(0, 48, 4):
    lines.append("  " + ", ".join(js(n) for n in ORDER[k:k + 4]) + ",")
lines.append("] as const;")
lines.append("")
lines.append("export type MaterialName = (typeof MATERIAL_NAMES)[number];")
lines.append("")
lines.append('export type Category = "structure" | "granular" | "liquid" | "gas" | "fire" | "reactive" | "metal";')
lines.append('export type MaterialState = "solid" | "powder" | "liquid" | "gas" | "energy";')
lines.append('export type ReactionSymbol = "B" | "D" | "M" | "F" | "R" | "X" | "^" | ".";')
lines.append("")
lines.append("export interface MaterialProps {")
lines.append("  readonly cat: Category;")
lines.append("  readonly col: readonly [number, number, number];")
lines.append("  readonly state: MaterialState;")
lines.append("  readonly dens: number;")
lines.append("  readonly heat: number;")
lines.append("  readonly melt: number;")
lines.append("  readonly ignite: number;")
lines.append("  readonly chill: number;")
lines.append("  readonly fuel: number;")
lines.append("  readonly acidvuln: number;")
for b in BOOLS:
    lines.append(f"  readonly {b}: boolean;")
lines.append("}")
lines.append("")
lines.append("// Sparse specs: omitted fields take the defaults below (the board's m() helper).")
lines.append('type MaterialSpec = Pick<MaterialProps, "cat" | "col" | "state"> & Partial<MaterialProps>;')
lines.append("")
lines.append("const SPECS: Record<MaterialName, MaterialSpec> = {")
for nm in ORDER:
    p = M[nm]
    parts = [f"cat: {js(p['cat'])}", f"col: [{p['col'][0]}, {p['col'][1]}, {p['col'][2]}]",
             f"state: {js(p['state'])}"]
    for k, d in NUM_DEFAULTS.items():
        v = p[k]
        if v != d:
            parts.append(f"{k}: {v}")
    for b in BOOLS:
        if p[b]:
            parts.append(f"{b}: true")
    lines.append(f"  {js(nm)}: {{ " + ", ".join(parts) + " },")
lines.append("};")
lines.append("")
lines.append("// Defaults from the board's m() helper.")
lines.append("const DEFAULTS = {")
lines.append("  dens: 1.0, heat: 0, melt: 99, ignite: 0, chill: 0, fuel: 0, acidvuln: 0,")
for b in BOOLS:
    lines.append(f"  {b}: false,")
lines.append("};")
lines.append("")
lines.append("/** Full physical properties for every material, defaults resolved. */")
lines.append("export const MATERIALS: Record<MaterialName, MaterialProps> = Object.fromEntries(")
lines.append("  MATERIAL_NAMES.map((n) => [n, { ...DEFAULTS, ...SPECS[n] }]),")
lines.append(") as Record<MaterialName, MaterialProps>;")
lines.append("type ExplicitEntry = readonly [MaterialName, MaterialName, ReactionSymbol, string];")
lines.append("")
lines.append("// Hand-written pairs from the board's E list (last entry for a pair wins).")
lines.append("const EXPLICIT: readonly ExplicitEntry[] = [")
for a, b, s, w in live:
    lines.append(f"  [{js(a)}, {js(b)}, {js(s)}, {js(w)}],")
lines.append("];")
lines.append("")
lines.append("// The board adds Bomb-vs-shatterable pairs the E list did not cover.")
lines.append("const AUTO_BOMB_SHATTER: readonly MaterialName[] = [" + (", ".join(js(n) for n in auto)) + "];")
lines.append("")
lines.append("function pairKey(a: MaterialName, b: MaterialName): string {")
lines.append('  return a < b ? `${a}|${b}` : `${b}|${a}`;')
lines.append("}")
lines.append("")
lines.append("const SPECIAL = new Map<string, readonly [ReactionSymbol, string]>();")
lines.append("for (const [a, b, s, w] of EXPLICIT) SPECIAL.set(pairKey(a, b), [s, w]);")
lines.append("for (const nm of AUTO_BOMB_SHATTER) {")
lines.append('  const key = pairKey("Bomb", nm);')
lines.append('  if (!SPECIAL.has(key)) SPECIAL.set(key, ["X", "shatters"]);')
lines.append("}")
lines.append("")
lines.append('const NO_REACTION = ["." , "no reaction"] as const;')
lines.append("")
lines.append("// Fallback engine, same rule order as the board: inert, explosion-when-lit,")
lines.append("// ignition, heat melt, chill freeze, acid, dissolve, absorb, density, conduct.")
lines.append("function fallback(a: MaterialName, b: MaterialName): readonly [ReactionSymbol, string] {")
lines.append("  const A = MATERIALS[a];")
lines.append("  const B = MATERIALS[b];")
lines.append('  if (A.inert || B.inert) return NO_REACTION;')
lines.append("  const both: readonly (readonly [MaterialProps, MaterialProps, MaterialName])[] = [")
lines.append("    [A, B, b], [B, A, a],")
lines.append("  ];")
lines.append("  for (const [X, Y] of both) {")
lines.append('    if (X.explode && Y.ignite > 0) return ["X", "explodes"];')
lines.append("  }")
lines.append("  for (const [X, Y] of both) {")
lines.append('    if (X.ignite > 0 && Y.fuel > 0) return ["B", "ignites"];')
lines.append("  }")
lines.append("  for (const [X, Y] of both) {")
lines.append('    if (X.heat > 0 && Y.melt <= X.heat) return ["M", "melts"];')
lines.append("  }")
lines.append("  for (const [X, Y] of both) {")
lines.append('    if (X.chill > 0 && Y.freezable) return ["F", "freezes"];')
lines.append("  }")
lines.append("  for (const [X, Y] of both) {")
lines.append('    if (X.acidic && Y.acidvuln > 0) return ["D", "corrodes"];')
lines.append("  }")
lines.append("  for (const [X, , yn] of both) {")
lines.append('    if (X.soluble && (yn === "Water" || yn === "Rain" || yn === "Steam")) return ["D", "dissolves"];')
lines.append("  }")
lines.append("  for (const [X, Y] of both) {")
lines.append('    if (X.absorb && Y.state === "liquid" && X !== Y) return ["R", "soaks in"];')
lines.append("  }")
lines.append('  const fluid = (s: MaterialState): boolean => s === "liquid" || s === "gas";')
lines.append("  if (fluid(A.state) && fluid(B.state) && Math.abs(A.dens - B.dens) > 0.3) {")
lines.append('    return ["^", "separates by density"];')
lines.append("  }")
lines.append('  if (A.state === "solid" && B.state === "liquid" && A.dens < B.dens * 0.9) return ["^", "floats"];')
lines.append('  if (B.state === "solid" && A.state === "liquid" && B.dens < A.dens * 0.9) return ["^", "floats"];')
lines.append("  for (const [X, Y] of both) {")
lines.append('    if (X.conduct && Y.state === "energy") return ["R", "conducts"];')
lines.append("  }")
lines.append("  return NO_REACTION;")
lines.append("}")
lines.append("")
lines.append("/** Reaction for any unordered pair, including a material meeting itself. */")
lines.append("export function reaction(a: MaterialName, b: MaterialName): readonly [ReactionSymbol, string] {")
lines.append("  return SPECIAL.get(pairKey(a, b)) ?? fallback(a, b);")
lines.append("}")
lines.append("")

if "--dump-only" not in sys.argv:
    open("src/materials.ts", "w").write("\n".join(lines) + "\n")
dump = {"order": ORDER, "pairs": board}
json.dump(dump, open(DUMP_PATH, "w"), ensure_ascii=False, indent=0)
if "--dump-only" in sys.argv:
    print(f"wrote {DUMP_PATH}")
else:
    print(f"wrote src/materials.ts and {DUMP_PATH}")
