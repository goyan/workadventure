import { pixelRun, ringPixels } from "./WaterFoam";

/** What the strokes are drawn with: the part of a Phaser graphics they use. */
export interface StrokeGraphics {
    lineStyle(width: number, color: number, alpha: number): unknown;
    lineBetween(fromX: number, fromY: number, toX: number, toY: number): unknown;
    strokeCircle(x: number, y: number, radius: number): unknown;
    fillStyle(color: number, alpha: number): unknown;
    fillRect(x: number, y: number, width: number, height: number): unknown;
}

const LINE_PX = 1.5;
/** Over the ground drawn flat: white, fading. */
const FOAM_LINE_COLOR = 0xffffff;
/** Over the relief in pixel art: the foam of its shores (WaterPixel), and its fading shade. */
const FOAM_PIXEL_COLOR = 0xd6ecf6;
const FOAM_FADING = 0x9fc3db;
const WHIRL_COLOR = 0xe8f6ff;

/**
 * A streak of foam carried by the current. Over the ground drawn flat, a smooth line that fades; over the relief
 * shown in 3/4 (`pixelArt`), whole pixels of two shades, as the rest of its ground: no smoothed line.
 */
export function strokeStreak(
    graphics: StrokeGraphics,
    streak: { fromX: number; fromY: number; toX: number; toY: number; alpha: number },
    pixelArt: boolean,
): void {
    if (!pixelArt) {
        graphics.lineStyle(LINE_PX, FOAM_LINE_COLOR, streak.alpha);
        graphics.lineBetween(streak.fromX, streak.fromY, streak.toX, streak.toY);
        return;
    }
    graphics.fillStyle(streak.alpha > 0.5 ? FOAM_PIXEL_COLOR : FOAM_FADING, 1);
    for (const pixel of pixelRun(streak.fromX, streak.fromY, streak.toX, streak.toY)) {
        graphics.fillRect(pixel.x, pixel.y, 1, 1);
    }
}

/** A ring over a source: a circle that fades, or its pixels over the relief in pixel art. */
export function strokeRing(
    graphics: StrokeGraphics,
    x: number,
    y: number,
    ring: { radius: number; alpha: number },
    pixelArt: boolean,
): void {
    if (!pixelArt) {
        graphics.lineStyle(LINE_PX, WHIRL_COLOR, ring.alpha);
        graphics.strokeCircle(x, y, ring.radius);
        return;
    }
    graphics.fillStyle(ring.alpha > 0.5 ? WHIRL_COLOR : FOAM_FADING, 1);
    for (const pixel of ringPixels(x, y, ring.radius)) graphics.fillRect(pixel.x, pixel.y, 1, 1);
}

/**
 * A streak as it is drawn on a water drawn lower than its place (a stream at the bottom of a hollow, the relief seen
 * in 3/4): both its ends as much lower. Itself where there is no drop.
 */
export function streakLowered<S extends { fromY: number; toY: number }>(streak: S, drop: number): S {
    return drop === 0 ? streak : { ...streak, fromY: streak.fromY + drop, toY: streak.toY + drop };
}
