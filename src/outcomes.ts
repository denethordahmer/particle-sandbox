// Outcome table for Step B: turns a board symbol + reason into concrete cell
// results, using only the 48 roster materials (owner-approved "closest
// material" mapping, 26 Nov 2026). The board stays the source of truth for
// WHICH pairs react; this file decides WHAT the cells become.
//
// Each rule lists the two materials in either order; the result slots always
// line up with the rule's own order. null means the cell empties.
// Probabilities come from the world's seeded random source, so runs stay
// deterministic.
import { MATERIALS, type MaterialName, type ReactionSymbol } from "./materials";

export type CellResult = MaterialName | null;

/**
 * What two touching cells become. `null` for a slot means the cell empties.
 * A failed probability roll returns `null` from resolveOutcome instead, which
 * means "leave both cells alone".
 */
export interface Outcome {
  /** Result for the first material passed to resolveOutcome. */
  readonly a: CellResult;
  /** Result for the second material passed to resolveOutcome. */
  readonly b: CellResult;
}

interface Rule {
  readonly pair: readonly [MaterialName, MaterialName];
  readonly a: CellResult;
  readonly b: CellResult;
  readonly p?: number;
}

function rule(
  x: MaterialName, y: MaterialName,
  rx: CellResult, ry: CellResult,
  p?: number,
): Rule {
  return p === undefined ? { pair: [x, y], a: rx, b: ry } : { pair: [x, y], a: rx, b: ry, p };
}

const RULES: readonly Rule[] = [
  // ---- water family: quenching, steam, obsidian
  rule("Water", "Lava", "Steam", "Obsidian"),
  rule("Rain", "Lava", "Steam", "Obsidian"),
  rule("Water", "Molten Metal", "Steam", "Metal"),
  rule("Molten Metal", "Ice", "Steam", "Water"),
  rule("Water", "Fire", null, "Steam"),
  rule("Water", "Spark", null, null),
  rule("Water", "Plasma", "Steam", null),
  rule("Rain", "Plasma", "Steam", null),
  rule("Plasma", "Ice", "Steam", null),
  rule("Plasma", "Snow", "Steam", null),
  rule("Plasma", "Frost", "Steam", null),
  rule("Lava", "Ice", "Stone", "Steam"),
  rule("Lava", "Snow", "Stone", "Steam"),
  rule("Lava", "Frost", null, "Steam"),
  rule("Lava", "Dry Ice", null, "Steam"),
  rule("Dry Ice", "Water", "Steam", "Steam"),
  rule("Dry Ice", "Steam", "Steam", "Steam"),
  rule("Dry Ice", "Cloud", "Steam", null),
  rule("Thermite", "Dry Ice", "Molten Metal", "Steam"),
  rule("Dry Ice", "Plasma", "Steam", null),

  // ---- water: dissolving, diluting, soaking, rusting
  rule("Water", "Salt", "Water", null, 0.3),
  rule("Rain", "Salt", "Rain", null, 0.3),
  rule("Steam", "Salt", null, null, 0.2),
  rule("Cloud", "Salt", "Rain", null, 0.2),
  rule("Water", "Acid", "Water", "Water", 0.03),
  rule("Rain", "Acid", "Rain", "Water", 0.03),
  rule("Water", "Alkali", "Water", "Alkali"),
  rule("Water", "Quicklime", "Steam", "Stone", 0.5),
  rule("Rain", "Quicklime", "Steam", "Stone", 0.5),
  rule("Quicklime", "Steam", null, "Stone", 0.5),
  rule("Water", "Soil", null, "Clay", 0.3),
  rule("Rain", "Soil", null, "Clay", 0.3),
  rule("Water", "Clay", null, "Clay", 0.004),
  rule("Water", "Sponge", null, "Sponge", 0.08),
  rule("Water", "Metal", "Water", "Rust", 0.02),
  rule("Water", "Iron Ore", "Water", "Rust", 0.02),
  rule("Rain", "Metal", "Rain", "Rust", 0.02),
  rule("Steam", "Metal", null, "Rust", 0.02),
  rule("Steam", "Iron Ore", null, "Rust", 0.02),
  rule("Cloud", "Metal", "Rain", "Rust", 0.02),
  rule("Water", "Rust", "Water", "Rust", 0.01),
  rule("Rain", "Rust", "Rain", "Rust", 0.01),
  rule("Water", "Gunpowder", "Water", "Soil", 0.3),
  rule("Rain", "Gunpowder", "Rain", "Soil", 0.3),
  rule("Water", "Bomb", "Water", "Coal", 0.3),
  rule("Rain", "Bomb", "Rain", "Coal", 0.3),
  rule("Steam", "Gunpowder", null, "Soil", 0.2),
  rule("Steam", "Bomb", null, "Coal", 0.2),
  // Ice does not freeze a pool solid on contact: the owner lost a reservoir
  // to this. Ice chills what it touches but does not spread itself through water.
  rule("Water", "Snow", "Ice", "Ice", 0.2),
  rule("Water", "Frost", "Ice", null, 0.3),
  rule("Rain", "Ice", "Ice", "Ice", 0.002),
  rule("Rain", "Frost", "Ice", null, 0.3),
  rule("Water", "Steam", "Water", null, 0.3),
  rule("Water", "Cloud", null, "Cloud", 0.2),
  // Rain is water falling; it must not turn a pool into more water cells,
  // which would be free mass. It joins the pool.
  rule("Water", "Rain", "Water", "Water"),
  rule("Rain", "Steam", "Rain", null, 0.3),
  rule("Steam", "Cloud", null, "Cloud", 0.3),
  rule("Rain", "Cloud", "Rain", "Cloud"),
  rule("Water", "Phosphor", "Water", null, 0.5),
  rule("Rain", "Phosphor", "Rain", null, 0.5),
  rule("Steam", "Phosphor", null, null, 0.5),
  rule("Water", "Wood", null, "Wood", 0.004),
  rule("Water", "Toxic Gas", null, null, 0.3),
  rule("Toxic Gas", "Foam", null, "Foam", 0.3),
  rule("Water", "Lightning", null, null),
  rule("Water", "Crystal", "Water", "Crystal", 0.005),
  rule("Water", "Foam", null, "Foam", 0.3),
  rule("Coal", "Water", "Coal", "Water"),
  rule("Water", "Gravel", null, "Gravel", 0.02),
  rule("Water", "Sand", null, "Sand", 0.02),
  rule("Rain", "Sand", null, "Sand", 0.02),
  rule("Rain", "Gravel", null, "Gravel", 0.02),

  // ---- lava: melting, smelting, baking
  rule("Lava", "Stone", "Lava", "Lava", 0.3),
  rule("Lava", "Gravel", "Lava", "Lava", 0.3),
  rule("Lava", "Glass", "Lava", "Lava", 0.3),
  rule("Lava", "Metal", "Lava", "Molten Metal", 0.3),
  rule("Lava", "Gold", "Lava", "Molten Metal", 0.3),
  rule("Lava", "Crystal", "Lava", "Glass", 0.3),
  rule("Lava", "Obsidian", "Lava", "Lava", 0.05),
  rule("Lava", "Rust", "Lava", "Molten Metal", 0.3),
  rule("Lava", "Sand", "Lava", "Glass", 0.5),
  rule("Lava", "Salt", "Lava", "Glass", 0.5),
  rule("Lava", "Clay", "Lava", "Stone", 0.3),
  rule("Lava", "Soil", "Lava", "Stone", 0.3),
  rule("Lava", "Iron Ore", "Lava", "Molten Metal", 0.5),
  rule("Lava", "Acid", "Lava", "Toxic Gas", 0.3),
  rule("Lava", "Alkali", "Lava", "Steam", 0.3),
  rule("Lava", "Mercury", "Lava", "Steam", 0.5),
  rule("Lava", "Foam", "Lava", null, 0.5),
  rule("Lava", "Steam", "Lava", "Steam"),
  rule("Lava", "Cloud", "Lava", null, 0.5),
  rule("Lava", "Plasma", "Lava", "Plasma"),
  rule("Lava", "Lightning", "Lava", null),
  rule("Lava", "Toxic Gas", "Lava", null, 0.5),
  rule("Lava", "Thermite", "Lava", "Molten Metal"),
  rule("Limestone", "Lava", "Quicklime", "Lava", 0.3),
  rule("Limestone", "Plasma", "Quicklime", null, 0.3),
  rule("Limestone", "Fire", "Quicklime", "Fire", 0.05),
  rule("Limestone", "Thermite", "Lava", "Molten Metal", 0.3),
  rule("Limestone", "Molten Metal", "Lava", "Molten Metal", 0.3),

  // ---- fire family: smothering, baking, merging
  rule("Fire", "Steam", null, "Steam"),
  rule("Fire", "Cloud", "Fire", null, 0.5),
  rule("Fire", "Rain", null, "Steam"),
  rule("Fire", "Foam", null, "Foam"),
  rule("Fire", "Sand", null, "Sand"),
  rule("Fire", "Salt", null, "Salt"),
  rule("Fire", "Soil", null, "Stone", 0.1),
  rule("Fire", "Gravel", null, "Gravel"),
  rule("Fire", "Toxic Gas", null, null),
  rule("Fire", "Dry Ice", null, "Steam"),
  rule("Fire", "Ice", "Fire", "Water", 0.3),
  rule("Fire", "Snow", "Fire", "Water", 0.3),
  rule("Fire", "Frost", "Fire", null, 0.3),
  rule("Fire", "Clay", "Fire", "Stone", 0.1),
  rule("Fire", "Quicklime", "Fire", "Stone", 0.1),
  rule("Fire", "Thermite", "Fire", "Molten Metal", 0.5),
  rule("Fire", "Plasma", "Plasma", "Plasma"),
  rule("Fire", "Lightning", "Plasma", null),
  rule("Fire", "Spark", "Fire", "Fire"),
  rule("Fire", "Lava", "Lava", "Lava"),
  rule("Fire", "Molten Metal", null, "Molten Metal"),
  rule("Fire", "Mercury", "Fire", "Steam", 0.05),
  rule("Cloud", "Plasma", null, null),
  rule("Toxic Gas", "Phosphor", null, null, 0.5),
  rule("Toxic Gas", "Molten Metal", null, "Molten Metal"),
  rule("Plasma", "Toxic Gas", null, null),
  rule("Foam", "Spark", "Foam", null),
  rule("Foam", "Gunpowder", "Foam", "Soil", 0.3),
  rule("Foam", "Bomb", "Foam", "Coal", 0.3),
  rule("Foam", "Molten Metal", null, "Molten Metal"),
  rule("Phosphor", "Foam", null, "Foam"),
  rule("Phosphor", "Sand", null, "Sand"),
  rule("Phosphor", "Salt", null, "Salt"),
  rule("Phosphor", "Ice", null, "Ice"),
  rule("Phosphor", "Snow", null, "Snow"),
  rule("Phosphor", "Dry Ice", null, "Steam"),
  rule("Frost", "Phosphor", null, null, 0.5),

  // ---- spark: quenching and merging
  rule("Spark", "Steam", null, null),
  rule("Spark", "Rain", null, null),
  rule("Spark", "Sand", null, "Sand"),
  rule("Spark", "Lava", "Lava", "Lava"),
  rule("Spark", "Plasma", "Plasma", "Plasma"),
  rule("Spark", "Lightning", "Plasma", null),
  rule("Spark", "Molten Metal", null, "Molten Metal"),
  rule("Spark", "Thermite", "Spark", "Molten Metal", 0.5),

  // ---- acid and alkali
  rule("Acid", "Stone", "Acid", null, 0.05),
  rule("Acid", "Metal", "Acid", null, 0.05),
  rule("Acid", "Sand", "Acid", null, 0.05),
  rule("Acid", "Wood", "Acid", null, 0.05),
  rule("Acid", "Clay", "Acid", null, 0.05),
  rule("Acid", "Soil", "Acid", null, 0.05),
  rule("Acid", "Gravel", "Acid", null, 0.05),
  rule("Acid", "Iron Ore", "Acid", null, 0.05),
  rule("Acid", "Rust", "Acid", null, 0.05),
  rule("Acid", "Crystal", "Acid", null, 0.02),
  rule("Limestone", "Acid", null, "Acid", 0.1),
  rule("Acid", "Quicklime", "Toxic Gas", null, 0.3),
  rule("Acid", "Alkali", "Water", "Water", 0.5),
  rule("Acid", "Sulphur", "Acid", "Toxic Gas", 0.3),
  rule("Acid", "Ice", "Acid", "Water", 0.3),
  rule("Acid", "Snow", "Acid", "Water", 0.3),
  rule("Acid", "Frost", "Acid", null, 0.3),
  rule("Acid", "Salt", "Toxic Gas", null, 0.2),
  rule("Acid", "Toxic Gas", "Acid", "Toxic Gas"),
  rule("Acid", "Foam", "Acid", null, 0.3),
  rule("Acid", "Steam", "Acid", "Toxic Gas", 0.2),
  rule("Acid", "Mercury", "Acid", "Mercury", 0.01),
  rule("Acid", "Sponge", null, null, 0.1),
  rule("Acid", "Gunpowder", "Acid", "Soil", 0.3),
  rule("Acid", "Cloud", "Acid", "Acid", 0.2),
  rule("Toxic Gas", "Cloud", "Toxic Gas", "Acid", 0.2),
  rule("Alkali", "Metal", "Alkali", null, 0.03),
  rule("Alkali", "Glass", "Alkali", null, 0.02),
  rule("Alkali", "Crystal", "Alkali", null, 0.03),
  rule("Alkali", "Iron Ore", "Alkali", null, 0.03),
  rule("Alkali", "Ice", "Alkali", "Water", 0.3),
  rule("Alkali", "Snow", "Alkali", "Water", 0.3),
  rule("Alkali", "Clay", "Alkali", "Clay", 0.1),
  rule("Alkali", "Sulphur", "Alkali", "Toxic Gas", 0.2),
  rule("Alkali", "Foam", "Alkali", null, 0.3),
  rule("Alkali", "Toxic Gas", "Alkali", null, 0.3),
  rule("Quicklime", "Alkali", "Stone", "Alkali", 0.3),
  rule("Wax", "Alkali", "Foam", "Alkali", 0.2),
  rule("Rubber", "Acid", "Rubber", "Acid", 0.01),
  rule("Rubber", "Alkali", "Rubber", "Alkali", 0.01),
  rule("Toxic Gas", "Metal", "Toxic Gas", null, 0.02),
  rule("Toxic Gas", "Iron Ore", "Toxic Gas", null, 0.02),
  rule("Toxic Gas", "Rust", "Toxic Gas", null, 0.02),
  rule("Toxic Gas", "Sulphur", "Toxic Gas", "Toxic Gas"),
  rule("Toxic Gas", "Tar", "Toxic Gas", "Tar"),
  rule("Toxic Gas", "Ice", null, "Ice", 0.1),
  rule("Toxic Gas", "Snow", null, "Snow", 0.1),
  rule("Toxic Gas", "Dry Ice", null, "Dry Ice", 0.1),
  rule("Toxic Gas", "Sponge", null, "Sponge", 0.2),
  rule("Quicklime", "Toxic Gas", "Stone", null, 0.2),

  // ---- oil, tar, mercury
  rule("Oil", "Tar", "Tar", "Tar", 0.2),
  rule("Oil", "Acid", "Tar", "Acid", 0.2),
  rule("Oil", "Sand", null, "Sand", 0.2),
  rule("Oil", "Soil", null, "Soil", 0.2),
  rule("Oil", "Sponge", null, "Sponge", 0.3),
  rule("Oil", "Foam", null, "Foam", 0.3),
  rule("Oil", "Wood", null, "Wood", 0.1),
  rule("Oil", "Gunpowder", "Oil", "Soil", 0.3),
  rule("Oil", "Dry Ice", "Oil", "Steam", 0.2),
  rule("Mercury", "Gold", "Mercury", null, 0.1),
  rule("Mercury", "Metal", "Mercury", "Mercury", 0.05),
  rule("Mercury", "Iron Ore", "Mercury", "Mercury", 0.05),
  rule("Mercury", "Sulphur", "Mercury", "Mercury", 0.1),
  rule("Mercury", "Plasma", "Steam", null, 0.5),
  rule("Mercury", "Lightning", null, "Mercury"),
  rule("Mercury", "Dry Ice", "Ice", "Dry Ice", 0.3),
  rule("Mercury", "Frost", "Ice", null, 0.3),
  rule("Mercury", "Ice", "Ice", "Ice", 0.1),
  rule("Tar", "Sand", null, "Tar", 0.2),
  rule("Tar", "Sponge", null, "Sponge", 0.2),
  rule("Tar", "Gravel", null, "Tar", 0.2),
  rule("Tar", "Soil", null, "Tar", 0.2),
  rule("Tar", "Foam", null, null, 0.2),
  rule("Tar", "Dry Ice", "Tar", "Steam", 0.2),
  rule("Tar", "Frost", "Tar", null, 0.2),
  rule("Tar", "Ice", "Tar", "Ice", 0.1),
  rule("Wood", "Tar", "Wood", "Tar", 0.1),

  // ---- steam, cloud, frost
  rule("Steam", "Ice", "Water", "Ice", 0.2),
  rule("Steam", "Snow", "Water", "Water", 0.3),
  rule("Steam", "Frost", "Water", null, 0.3),
  rule("Steam", "Glass", null, "Glass", 0.1),
  rule("Steam", "Toxic Gas", "Steam", "Toxic Gas"),
  rule("Steam", "Plasma", "Steam", "Plasma"),
  rule("Steam", "Crystal", null, "Crystal", 0.05),
  rule("Steam", "Clay", null, "Clay", 0.1),
  rule("Steam", "Soil", null, "Clay", 0.1),
  rule("Cloud", "Lightning", "Lightning", "Lightning", 0.3),
  rule("Cloud", "Frost", "Snow", null, 0.3),
  rule("Cloud", "Snow", "Snow", "Snow", 0.3),
  rule("Cloud", "Soil", "Rain", "Clay", 0.2),
  rule("Cloud", "Sand", "Rain", "Sand", 0.2),
  rule("Cloud", "Clay", "Rain", "Clay", 0.2),
  rule("Cloud", "Foam", "Rain", "Foam", 0.2),
  rule("Cloud", "Limestone", "Rain", "Limestone", 0.1),
  rule("Frost", "Ice", "Frost", "Ice", 0.2),
  rule("Frost", "Snow", "Frost", "Ice", 0.2),
  rule("Frost", "Metal", null, "Metal"),
  rule("Frost", "Glass", null, "Glass"),
  rule("Frost", "Alkali", null, "Alkali"),
  rule("Frost", "Soil", null, "Soil"),
  rule("Frost", "Sand", null, "Sand"),
  rule("Frost", "Clay", null, "Clay"),
  rule("Frost", "Oil", null, "Oil"),
  rule("Dry Ice", "Frost", "Steam", "Frost", 0.2),
  rule("Frost", "Gravel", null, "Gravel"),
  rule("Limestone", "Frost", null, "Limestone"),
  rule("Limestone", "Dry Ice", null, "Limestone"),
  rule("Limestone", "Snow", null, "Limestone"),

  // ---- lightning and plasma: shattering, fusing, conducting
  rule("Lightning", "Sand", null, "Glass", 0.5),
  rule("Lightning", "Glass", null, null, 0.5),
  rule("Lightning", "Stone", null, "Gravel", 0.5),
  rule("Lightning", "Ice", null, null, 0.5),
  rule("Lightning", "Crystal", null, null, 0.5),
  rule("Lightning", "Obsidian", null, null, 0.5),
  rule("Lightning", "Snow", null, null, 0.5),
  rule("Lightning", "Frost", null, null, 0.5),
  rule("Lightning", "Dry Ice", null, "Steam", 0.5),
  rule("Limestone", "Lightning", null, null, 0.5),
  rule("Lightning", "Metal", null, "Metal"),
  rule("Lightning", "Gold", null, "Gold"),
  rule("Lightning", "Iron Ore", null, "Iron Ore"),
  rule("Lightning", "Clay", null, "Stone", 0.3),
  rule("Lightning", "Soil", null, "Stone", 0.3),
  rule("Lightning", "Gravel", null, "Stone", 0.3),
  rule("Lightning", "Rust", null, "Metal", 0.3),
  rule("Lightning", "Salt", null, "Glass", 0.3),
  rule("Lightning", "Quicklime", null, "Stone", 0.3),
  rule("Lightning", "Thermite", null, "Molten Metal", 0.5),
  rule("Lightning", "Steam", null, "Steam"),
  rule("Lightning", "Rain", null, "Rain"),
  rule("Lightning", "Toxic Gas", null, "Toxic Gas"),
  rule("Lightning", "Molten Metal", null, "Molten Metal"),
  rule("Lightning", "Plasma", null, "Plasma"),
  rule("Plasma", "Metal", null, "Molten Metal", 0.3),
  rule("Plasma", "Glass", null, "Lava", 0.3),
  rule("Plasma", "Stone", null, "Lava", 0.3),
  rule("Plasma", "Sand", null, "Glass", 0.5),
  rule("Plasma", "Crystal", null, "Glass", 0.3),
  rule("Plasma", "Obsidian", null, "Lava", 0.3),
  rule("Plasma", "Gold", null, "Molten Metal", 0.3),
  rule("Plasma", "Gravel", null, "Lava", 0.3),
  rule("Plasma", "Rust", null, "Molten Metal", 0.3),
  rule("Plasma", "Salt", null, "Glass", 0.3),
  rule("Plasma", "Iron Ore", null, "Molten Metal", 0.5),
  rule("Plasma", "Clay", null, "Glass", 0.3),
  rule("Plasma", "Soil", null, "Glass", 0.3),
  rule("Plasma", "Foam", null, null, 0.5),
  rule("Plasma", "Quicklime", null, "Glass", 0.3),
  rule("Plasma", "Thermite", null, "Molten Metal", 0.5),

  // ---- molten metal
  rule("Molten Metal", "Glass", "Molten Metal", "Lava", 0.3),
  rule("Molten Metal", "Stone", "Molten Metal", "Lava", 0.3),
  rule("Molten Metal", "Crystal", "Molten Metal", "Glass", 0.3),
  rule("Molten Metal", "Obsidian", "Molten Metal", "Lava", 0.3),
  rule("Molten Metal", "Gravel", "Molten Metal", "Lava", 0.3),
  rule("Molten Metal", "Metal", "Metal", "Metal", 0.3),
  rule("Molten Metal", "Gold", "Molten Metal", "Metal", 0.3),
  rule("Molten Metal", "Iron Ore", "Molten Metal", "Metal", 0.5),
  rule("Molten Metal", "Sand", "Molten Metal", "Glass", 0.5),
  rule("Molten Metal", "Clay", "Molten Metal", "Stone", 0.3),
  rule("Molten Metal", "Soil", "Molten Metal", "Stone", 0.3),
  rule("Molten Metal", "Rust", "Molten Metal", "Metal", 0.3),
  rule("Molten Metal", "Salt", "Molten Metal", "Glass", 0.5),
  rule("Molten Metal", "Mercury", "Molten Metal", "Steam", 0.3),
  rule("Molten Metal", "Thermite", "Molten Metal", null),
  rule("Molten Metal", "Plasma", "Plasma", "Plasma"),
  rule("Molten Metal", "Snow", "Molten Metal", "Water", 0.3),

  // ---- explosives (detonation blast itself lands with Step C polish)
  rule("Gunpowder", "Fire", "Fire", null),
  rule("Gunpowder", "Spark", "Fire", null),
  rule("Gunpowder", "Lava", "Fire", null),
  rule("Gunpowder", "Plasma", "Fire", null),
  rule("Gunpowder", "Lightning", "Fire", null),
  rule("Gunpowder", "Molten Metal", "Fire", null),
  rule("Bomb", "Fire", "Fire", null),
  rule("Bomb", "Spark", "Fire", null),
  rule("Bomb", "Lava", "Fire", null),
  rule("Bomb", "Plasma", "Fire", null),
  rule("Bomb", "Lightning", "Fire", null),
  rule("Bomb", "Molten Metal", "Fire", null),
  rule("Hydrogen", "Fire", "Fire", null),
  rule("Hydrogen", "Spark", "Fire", null),
  rule("Hydrogen", "Lava", "Fire", null),
  rule("Hydrogen", "Plasma", "Fire", null),
  rule("Hydrogen", "Lightning", "Fire", null),
  rule("Hydrogen", "Molten Metal", "Fire", null),
  rule("Bomb", "Stone", "Fire", "Gravel"),
  rule("Bomb", "Glass", "Fire", null),
  rule("Bomb", "Ice", "Fire", null),
  rule("Bomb", "Metal", "Fire", null),
  rule("Bomb", "Wood", "Fire", null),
  rule("Bomb", "Clay", "Fire", null),
  rule("Bomb", "Crystal", "Fire", null),
  rule("Bomb", "Obsidian", "Fire", null),
  rule("Bomb", "Limestone", "Fire", null),
  rule("Bomb", "Iron Ore", "Fire", null),
  rule("Bomb", "Rubber", "Fire", null),
  rule("Bomb", "Coal", "Fire", "Fire"),
  rule("Bomb", "Sand", "Fire", "Sand"),
  rule("Bomb", "Gravel", "Fire", "Gravel"),
  rule("Bomb", "Soil", "Fire", "Soil"),
  rule("Bomb", "Salt", "Fire", "Salt"),
  rule("Bomb", "Snow", "Fire", "Water"),
  rule("Bomb", "Rust", "Fire", "Rust"),
  rule("Bomb", "Sulphur", "Fire", "Fire"),
  rule("Bomb", "Phosphor", "Fire", "Fire"),
  rule("Bomb", "Gunpowder", "Fire", "Fire"),
  rule("Bomb", "Hydrogen", "Fire", "Fire"),
  rule("Bomb", "Thermite", "Fire", "Fire"),
  rule("Bomb", "Tar", "Fire", "Fire"),
  rule("Bomb", "Oil", "Fire", "Fire"),
  rule("Bomb", "Quicklime", "Fire", "Quicklime"),
  rule("Bomb", "Dry Ice", "Fire", "Steam"),
  rule("Bomb", "Toxic Gas", "Fire", null),
  rule("Bomb", "Mercury", "Fire", "Mercury"),
  rule("Bomb", "Sponge", "Fire", null),
  rule("Bomb", "Gold", "Fire", null),
  rule("Wood", "Gunpowder", "Wood", "Fire"),
  rule("Hydrogen", "Thermite", "Fire", "Fire"),
  rule("Hydrogen", "Gunpowder", null, null),
  rule("Hydrogen", "Foam", null, "Foam"),
  rule("Hydrogen", "Metal", "Hydrogen", "Metal", 0.01),
  rule("Hydrogen", "Iron Ore", "Steam", "Metal", 0.05),

  // ---- thermite
  rule("Thermite", "Metal", "Molten Metal", null, 0.3),
  rule("Thermite", "Iron Ore", "Molten Metal", "Metal", 0.3),
  rule("Thermite", "Rust", "Molten Metal", "Metal", 0.3),
  rule("Thermite", "Glass", "Molten Metal", "Lava", 0.3),
  rule("Thermite", "Stone", "Molten Metal", "Lava", 0.3),
  rule("Thermite", "Crystal", "Molten Metal", "Glass", 0.3),
  rule("Thermite", "Obsidian", "Molten Metal", "Lava", 0.1),
  rule("Thermite", "Gold", "Molten Metal", "Metal", 0.3),
  rule("Thermite", "Gravel", "Molten Metal", "Lava", 0.3),
  rule("Thermite", "Ice", "Molten Metal", "Water", 0.3),
  rule("Thermite", "Snow", "Molten Metal", "Water", 0.3),
  rule("Thermite", "Water", null, "Steam"),
  rule("Thermite", "Sand", "Molten Metal", "Sand"),
  rule("Thermite", "Clay", "Molten Metal", "Stone", 0.3),
  rule("Thermite", "Quicklime", "Molten Metal", "Stone", 0.3),
  rule("Thermite", "Foam", null, "Foam"),
  rule("Thermite", "Mercury", "Molten Metal", "Steam", 0.3),

  // ---- crystal growth and joins
  rule("Crystal", "Salt", "Crystal", "Crystal", 0.02),
  rule("Crystal", "Stone", "Crystal", "Stone", 0.005),
  rule("Crystal", "Glass", "Crystal", "Glass", 0.005),
  rule("Crystal", "Sand", "Crystal", "Crystal", 0.01),
  rule("Crystal", "Limestone", "Crystal", "Limestone", 0.005),
  rule("Crystal", "Frost", "Crystal", null, 0.1),
  rule("Crystal", "Ice", "Crystal", "Ice", 0.05),
  rule("Crystal", "Rain", "Crystal", "Rain", 0.01),
  rule("Crystal", "Dry Ice", null, "Steam", 0.3),

  // ---- quicklime cement, foam, sponge, misc
  rule("Quicklime", "Soil", "Stone", "Stone", 0.2),
  rule("Quicklime", "Sand", "Stone", "Stone", 0.2),
  rule("Quicklime", "Gravel", "Stone", "Stone", 0.2),
  rule("Quicklime", "Clay", "Stone", "Stone", 0.2),
  rule("Quicklime", "Ice", "Steam", "Water", 0.3),
  rule("Quicklime", "Snow", "Steam", "Water", 0.3),
  rule("Quicklime", "Frost", "Stone", null, 0.3),
  rule("Quicklime", "Foam", "Stone", null, 0.2),
  rule("Quicklime", "Cloud", "Stone", null, 0.2),
  rule("Limestone", "Quicklime", "Stone", "Stone", 0.1),
  rule("Foam", "Metal", "Foam", "Metal"),
  rule("Foam", "Wood", "Foam", "Wood"),
  rule("Foam", "Ice", "Foam", "Ice"),
  rule("Foam", "Steam", "Foam", null, 0.3),
  rule("Foam", "Rain", "Foam", null, 0.3),
  rule("Foam", "Snow", "Foam", "Snow"),
  rule("Foam", "Frost", "Foam", null, 0.2),
  rule("Sponge", "Alkali", "Sponge", null, 0.3),
  rule("Sponge", "Mercury", "Sponge", null, 0.2),
  rule("Sponge", "Gunpowder", "Sponge", null, 0.2),
  rule("Sponge", "Sulphur", "Sponge", null, 0.2),
  rule("Wax", "Wood", "Wax", "Wood", 0.1),
  rule("Wax", "Sponge", "Wax", null, 0.2),
  rule("Wax", "Limestone", "Wax", "Limestone", 0.1),
  rule("Wax", "Oil", "Wax", "Wax", 0.2),
  rule("Wax", "Tar", "Wax", "Tar", 0.2),
  rule("Wax", "Steam", "Wax", null, 0.1),
  rule("Rubber", "Oil", "Rubber", null, 0.05),
  rule("Rubber", "Sulphur", "Rubber", null, 0.1),
  rule("Rubber", "Steam", "Rubber", null, 0.1),
  rule("Rubber", "Tar", "Rubber", "Tar", 0.1),
  rule("Dry Ice", "Metal", "Steam", "Metal", 0.1),
  rule("Dry Ice", "Glass", "Steam", "Glass", 0.1),
  rule("Dry Ice", "Ice", "Steam", "Ice", 0.1),
  rule("Dry Ice", "Sand", "Steam", "Sand", 0.1),
  rule("Dry Ice", "Soil", "Steam", "Soil", 0.1),
  rule("Dry Ice", "Stone", "Steam", "Stone", 0.1),
  rule("Dry Ice", "Sponge", "Steam", "Sponge", 0.1),
  rule("Dry Ice", "Salt", "Steam", "Salt", 0.1),
  rule("Dry Ice", "Rain", "Steam", "Ice", 0.3),
  rule("Coal", "Iron Ore", "Fire", "Metal", 0.05),
  rule("Coal", "Rust", "Fire", "Metal", 0.05),
  rule("Salt", "Ice", "Water", "Water", 0.2),
  rule("Snow", "Salt", "Water", "Water", 0.2),
  rule("Snow", "Ice", "Ice", "Ice", 0.2),
  rule("Snow", "Soil", "Water", "Clay", 0.2),
  rule("Snow", "Sand", "Water", "Sand", 0.2),
  rule("Snow", "Gravel", "Water", "Gravel", 0.2),
  rule("Snow", "Clay", "Water", "Clay", 0.2),
  rule("Snow", "Metal", "Water", "Metal", 0.2),
  rule("Clay", "Soil", "Clay", "Clay", 0.1),
  rule("Clay", "Sand", "Clay", "Clay", 0.1),
  rule("Sand", "Soil", "Sand", "Soil", 0.05),
  rule("Salt", "Soil", "Salt", "Salt", 0.05),
  rule("Sand", "Salt", "Sand", "Salt", 0.05),
  rule("Sand", "Glass", "Glass", "Glass", 0.05),
  rule("Limestone", "Rain", "Limestone", "Rain", 0.005),
  rule("Limestone", "Water", "Limestone", "Water", 0.005),
  rule("Limestone", "Steam", "Limestone", null, 0.005),
  rule("Limestone", "Clay", "Stone", "Stone", 0.05),
  rule("Limestone", "Sand", "Stone", "Stone", 0.05),
  rule("Limestone", "Oil", "Limestone", "Oil", 0.05),
  rule("Limestone", "Tar", "Limestone", "Tar", 0.05),
  rule("Limestone", "Sulphur", "Limestone", "Sulphur", 0.05),
  rule("Limestone", "Rust", "Limestone", "Rust", 0.05),
  rule("Limestone", "Salt", "Limestone", "Salt", 0.05),
  rule("Limestone", "Gunpowder", "Limestone", "Fire"),
  rule("Metal", "Gold", "Metal", "Gold"),
  rule("Metal", "Iron Ore", "Metal", "Iron Ore"),
  rule("Metal", "Rust", "Rust", "Rust", 0.01),
  rule("Metal", "Salt", "Metal", null, 0.02),
  rule("Iron Ore", "Salt", "Iron Ore", null, 0.02),
  rule("Rust", "Salt", null, "Salt", 0.05),
  rule("Sulphur", "Metal", "Sulphur", null, 0.02),
  rule("Sulphur", "Iron Ore", "Sulphur", null, 0.02),
  rule("Wood", "Alkali", null, "Alkali", 0.05),
];

const RULE_INDEX = new Map<string, Rule>();
for (const r of RULES) {
  const [x, y] = r.pair;
  const key = x < y ? `${x}|${y}` : `${y}|${x}`;
  if (RULE_INDEX.has(key)) throw new Error(`duplicate outcome rule: ${key}`);
  RULE_INDEX.set(key, r);
}

/**
 * Concrete cell results for a reacting pair, or `null` when the pair leaves
 * both cells untouched (a failed probability roll, or a no-op rule).
 * Slots line up with the argument order. `chance` must come from the world's
 * seeded random source (0..1). Pairs without an explicit rule fall back to
 * generic symbol behaviour, derived from both materials so it does not depend
 * on argument order.
 */
export function resolveOutcome(
  a: MaterialName,
  b: MaterialName,
  sym: ReactionSymbol,
  chance: number,
): Outcome | null {
  const key = a < b ? `${a}|${b}` : `${b}|${a}`;
  const r = RULE_INDEX.get(key);
  if (r) {
    if (r.p !== undefined && chance >= r.p) return null;
    const flipped = r.pair[0] !== a;
    return flipped ? { a: r.b, b: r.a } : { a: r.a, b: r.b };
  }
  return generic(a, b, sym, chance);
}

const BURNS_TO_FIRE = new Set<MaterialName>([
  "Wood", "Coal", "Oil", "Tar", "Sulphur", "Thermite", "Gunpowder", "Phosphor",
  "Wax", "Rubber", "Hydrogen", "Sponge", "Bomb",
]);

/** Property-driven fallback for reacting pairs with no hand-written outcome. */
function generic(
  a: MaterialName,
  b: MaterialName,
  sym: ReactionSymbol,
  chance: number,
): Outcome | null {
  const A = MATERIALS[a];
  const B = MATERIALS[b];
  switch (sym) {
    case "B": {
      // Whatever can burn becomes Fire; the other cell is the fire's fuel bed.
      const aFuel = BURNS_TO_FIRE.has(a);
      const bFuel = BURNS_TO_FIRE.has(b);
      if (aFuel && bFuel) return { a: "Fire", b: "Fire" };
      if (aFuel) return { a: "Fire", b: null };
      if (bFuel) return { a: null, b: "Fire" };
      return { a, b };
    }
    case "M": {
      // The lower melting point gives way first; ties break by name so the
      // answer does not depend on argument order.
      if (A.melt < B.melt) return { a: "Lava", b };
      if (B.melt < A.melt) return { a, b: "Lava" };
      return a < b ? { a, b: "Lava" } : { a: "Lava", b };
    }
    case "F": {
      // The freezable one turns to Ice; ties break by name.
      const aFreeze = A.freezable && !B.freezable;
      const bFreeze = B.freezable && !A.freezable;
      if (aFreeze) return { a: "Ice", b };
      if (bFreeze) return { a, b: "Ice" };
      if (A.freezable && B.freezable) return { a: "Ice", b: "Ice" };
      return a < b ? { a: "Ice", b } : { a, b: "Ice" };
    }
    case "D": {
      // Acid eats the vulnerable cell, slowly; ties break by name.
      if (chance >= 0.05) return null;
      const aAcid = A.acidic && B.acidvuln > 0;
      const bAcid = B.acidic && A.acidvuln > 0;
      if (aAcid && !bAcid) return { a, b: null };
      if (bAcid && !aAcid) return { a: null, b };
      return a < b ? { a, b: null } : { a: null, b };
    }
    case "X": {
      // Blast or shatter: the brittle cell gives way; ties clear both.
      if (A.shatter && !B.shatter) return { a: null, b };
      if (B.shatter && !A.shatter) return { a, b: null };
      return { a: null, b: null };
    }
    default:
      return { a, b };
  }
}
