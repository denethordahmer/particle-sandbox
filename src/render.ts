// Rendering (Step C). Canvas 2D, hybrid look:
//   solids and powders  crisp one-cell rectangles, no glow
//   liquids             crisp body plus a soft halo
//   gases and energy    soft glow only, with trails
//
// How it works: the world is painted into two tiny offscreen buffers, one
// pixel per cell. The crisp buffer is upscaled with smoothing OFF so cells
// stay sharp; the glow buffer is upscaled with smoothing ON so a mass of
// liquid or gas blooms into a soft cloud. That is two drawImage calls per
// frame regardless of how many cells are on screen, which keeps a busy
// scene fast.
import { MATERIAL_NAMES, MATERIALS, type MaterialName } from "./materials";
import { EMPTY, type World } from "./sim";

export interface Palette {
  readonly bg: readonly [number, number, number];
  /** Solid/powder colours, fully opaque. */
  readonly body: Record<MaterialName, string>;
  /** Soft glow colours for liquids, gases and energy. */
  readonly glow: Record<MaterialName, string>;
  /** Extra-bright core for energy materials. */
  readonly core: Record<MaterialName, string>;
}

function rgb(c: readonly [number, number, number]): string {
  return `rgb(${c[0]} ${c[1]} ${c[2]})`;
}

function rgba(c: readonly [number, number, number], a: number): string {
  return `rgb(${c[0]} ${c[1]} ${c[2]} / ${a})`;
}

/** Lift a colour toward white; used for the hot core of energy materials. */
function lighten(c: readonly [number, number, number], t: number): readonly [number, number, number] {
  return [
    Math.round(c[0] + (255 - c[0]) * t),
    Math.round(c[1] + (255 - c[1]) * t),
    Math.round(c[2] + (255 - c[2]) * t),
  ];
}

export function buildPalette(): Palette {
  const body: Record<string, string> = {};
  const glow: Record<string, string> = {};
  const core: Record<string, string> = {};
  for (const name of MATERIAL_NAMES) {
    const p = MATERIALS[name];
    body[name] = rgb(p.col);
    switch (p.state) {
      case "solid":
      case "powder":
        glow[name] = "transparent";
        core[name] = "transparent";
        break;
      case "liquid":
        glow[name] = rgba(p.col, 0.75);
        core[name] = rgb(lighten(p.col, 0.3));
        break;
      case "gas":
        glow[name] = rgba(p.col, 0.5);
        core[name] = rgb(lighten(p.col, 0.45));
        break;
      case "energy":
        glow[name] = rgba(p.col, 0.9);
        core[name] = rgb(lighten(p.col, 0.8));
        break;
    }
  }
  return {
    bg: [15, 17, 21],
    body: body as Record<MaterialName, string>,
    glow: glow as Record<MaterialName, string>,
    core: core as Record<MaterialName, string>,
  };
}

export interface Renderer {
  resize(cssWidth: number, cssHeight: number, dpr: number): void;
  draw(world: World): void;
  readonly palette: Palette;
}

/**
 * Screen layout: the world is measured in cells, and the canvas is sized so
 * cells land on whole device pixels where possible. Returned dimensions are
 * in cells, which is what createWorld() wants.
 */
export function worldSizeFor(
  cssWidth: number,
  cssHeight: number,
  cellPx: number,
): { width: number; height: number } {
  const width = Math.max(1, Math.floor(cssWidth / cellPx));
  const height = Math.max(1, Math.floor(cssHeight / cellPx));
  return { width, height };
}

/** Pre-parsed RGB triples so the pixel loop never parses strings. */
interface RgbTriple {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

function parseColours(palette: Palette): {
  body: RgbTriple[];
  glow: RgbTriple[];
  core: RgbTriple[];
} {
  const parse = (s: string): RgbTriple => {
    if (s === "transparent") return { r: 0, g: 0, b: 0 };
    const m = /rgb\((\d+) (\d+) (\d+)/.exec(s);
    if (!m) return { r: 0, g: 0, b: 0 };
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  };
  const body: RgbTriple[] = [];
  const glow: RgbTriple[] = [];
  const core: RgbTriple[] = [];
  for (let i = 0; i < MATERIAL_NAMES.length; i++) {
    const name = MATERIAL_NAMES[i]!;
    body[i] = parse(palette.body[name]);
    glow[i] = parse(palette.glow[name]);
    core[i] = parse(palette.core[name]);
  }
  return { body, glow, core };
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("2D canvas unavailable");
  const palette = buildPalette();
  const colours = parseColours(palette);

  // Two offscreen buffers, one pixel per world cell.
  const crisp = document.createElement("canvas");
  const glow = document.createElement("canvas");
  const crispCtx = crisp.getContext("2d")!;
  const glowCtx = glow.getContext("2d")!;
  let crispImage: ImageData | null = null;
  let glowImage: ImageData | null = null;
  let bufW = 0;
  let bufH = 0;

  function ensureBuffers(w: number, h: number): void {
    if (bufW === w && bufH === h && crispImage && glowImage) return;
    bufW = w;
    bufH = h;
    crisp.width = w;
    crisp.height = h;
    glow.width = w;
    glow.height = h;
    crispImage = crispCtx.createImageData(w, h);
    glowImage = glowCtx.createImageData(w, h);
  }

  let cssW = 0;
  let cssH = 0;

  function resize(w: number, h: number, dpr: number): void {
    cssW = w;
    cssH = h;
    // Only the backing store is set here; the CSS box (100% of the stage) is
    // left to stylesheet layout so the canvas always fills its container.
    const pxW = Math.max(1, Math.round(w * dpr));
    const pxH = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== pxW) canvas.width = pxW;
    if (canvas.height !== pxH) canvas.height = pxH;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function paintBuffers(world: World): void {
    ensureBuffers(world.width, world.height);
    const cd = crispImage!.data;
    const gd = glowImage!.data;
    const cells = world.cells;
    const total = world.width * world.height;

    for (let i = 0; i < total; i++) {
      const id = cells[i]!;
      const p = i * 4;
      if (id === EMPTY) {
        cd[p + 3] = 0;
        gd[p + 3] = 0;
        continue;
      }
      const idx = id - 1;
      const name = MATERIAL_NAMES[idx];
      const state = name ? MATERIALS[name].state : "solid";

      // Crisp buffer: the cell's own colour. Energy materials use their hot
      // core colour so flames and lightning stay bright against their glow.
      const bc = state === "energy" ? colours.core[idx]! : colours.body[idx]!;
      cd[p] = bc.r;
      cd[p + 1] = bc.g;
      cd[p + 2] = bc.b;
      cd[p + 3] = 255;

      // Glow buffer: only soft materials bloom; solids stay transparent so
      // they never smear into a halo.
      if (state === "liquid" || state === "gas" || state === "energy") {
        const gc = colours.glow[idx]!;
        gd[p] = gc.r;
        gd[p + 1] = gc.g;
        gd[p + 2] = gc.b;
        // Energy and gas read stronger than liquids.
        gd[p + 3] = state === "liquid" ? 110 : state === "gas" ? 130 : 210;
      } else {
        gd[p + 3] = 0;
      }
    }

    crispCtx.putImageData(crispImage!, 0, 0);
    glowCtx.putImageData(glowImage!, 0, 0);
  }

  function draw(world: World): void {
    const fit = Math.min(cssW / world.width, cssH / world.height);
    const drawW = world.width * fit;
    const drawH = world.height * fit;
    const offsetX = (cssW - drawW) / 2;
    const offsetY = (cssH - drawH) / 2;

    ctx!.fillStyle = rgb(palette.bg);
    ctx!.fillRect(0, 0, cssW, cssH);

    paintBuffers(world);

    // Glow pass: smooth upscale, slightly enlarged so the bloom spills past
    // the cell edges into the surrounding dark.
    const bloom = Math.max(2, fit * 1.8);
    ctx!.imageSmoothingEnabled = true;
    ctx!.globalAlpha = 0.85;
    ctx!.drawImage(
      glow,
      offsetX - bloom / 2,
      offsetY - bloom / 2,
      drawW + bloom,
      drawH + bloom,
    );
    ctx!.globalAlpha = 1;

    // Crisp pass: nearest-neighbour upscale keeps cells as sharp squares.
    ctx!.imageSmoothingEnabled = false;
    ctx!.drawImage(crisp, offsetX, offsetY, drawW, drawH);
  }

  return { resize, draw, palette };
}
