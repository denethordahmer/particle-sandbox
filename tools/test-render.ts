// Step C tests for the pure layout maths and the palette contract.
// Run from the repo root: bun tools/test-render.ts
import { worldSizeFor, buildPalette } from "../src/render";
import { MATERIAL_NAMES, MATERIALS } from "../src/materials";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail = ""): void {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}${detail ? " — " + detail : ""}`);
  }
}

// ---- world sizing: ~100 cells across the short edge
{
  // A typical narrow phone in portrait.
  const cssW = 390;
  const cssH = 700;
  const cellPx = Math.min(cssW, cssH) / 100;
  const { width, height } = worldSizeFor(cssW, cssH, cellPx);
  check("portrait phone holds ~100 cells across", width === 100, `width=${width}`);
  check("portrait phone is taller than wide", height > width, `height=${height}`);
  check("no cell overflow", width * cellPx <= cssW && height * cellPx <= cssH);
}

// ---- a tablet stays proportional
{
  const cssW = 800;
  const cssH = 1100;
  const cellPx = Math.min(cssW, cssH) / 100;
  const { width, height } = worldSizeFor(cssW, cssH, cellPx);
  check("tablet holds ~100 across", width === 100, `width=${width}`);
  check("tablet aspect matches screen", Math.abs(width / height - cssW / cssH) < 0.02,
    `${width}x${height} vs ${cssW}x${cssH}`);
}

// ---- tiny and huge screens still produce a usable world
{
  const tiny = worldSizeFor(120, 160, 1.6);
  check("tiny screen has positive size", tiny.width > 0 && tiny.height > 0, JSON.stringify(tiny));
  const huge = worldSizeFor(2400, 3200, 24);
  check("huge screen holds 100 across", huge.width === 100, `width=${huge.width}`);
}

// ---- degenerate sizes never yield zero cells
{
  for (const [w, h, c] of [[1, 1, 1], [10, 10, 50], [0.4, 0.4, 1]] as const) {
    const s = worldSizeFor(w, h, c);
    if (s.width < 1 || s.height < 1) {
      check(`degenerate ${w}x${h}/${c} clamped`, false, JSON.stringify(s));
      break;
    }
  }
  check("degenerate sizes clamped to at least one cell", true);
}

// ---- palette: every material has a body colour; soft materials glow
{
  const pal = buildPalette();
  let missing = 0;
  let softMissing = 0;
  for (const name of MATERIAL_NAMES) {
    if (!pal.body[name]) missing++;
    const state = MATERIALS[name].state;
    if ((state === "liquid" || state === "gas" || state === "energy") && pal.glow[name] === "transparent") {
      softMissing++;
    }
  }
  check("every material has a body colour", missing === 0, `missing=${missing}`);
  check("soft materials all have a glow", softMissing === 0, `missing=${softMissing}`);
}

// ---- solids and powders emit no glow, so they read as crisp cells
{
  const pal = buildPalette();
  let leaky = 0;
  for (const name of MATERIAL_NAMES) {
    const state = MATERIALS[name].state;
    if ((state === "solid" || state === "powder") && pal.glow[name] !== "transparent") leaky++;
  }
  check("solids and powders do not glow", leaky === 0, `leaky=${leaky}`);
}

// ---- energy materials need a hot core colour, brighter than their body
{
  const pal = buildPalette();
  let missing = 0;
  for (const name of MATERIAL_NAMES) {
    if (MATERIALS[name].state === "energy" && pal.core[name] === "transparent") missing++;
  }
  check("every energy material has a core colour", missing === 0, `missing=${missing}`);
}

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log("RENDER TESTS PASS");
