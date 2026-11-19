import {
    METEOR_DISC_CELLS,
    METEOR_WAVE_CELLS,
    METEOR_WAVE_CELLS_PER_STEP,
    TERRAIN_CELL,
    WATER_STEP_MS,
} from "@workadventure/map-editor";

export interface MeteorFrame {
    /** 0.2 at launch, 1 at impact. */
    shadowScale: number;
    /** The meteor relative to the impact point: (-240, -480) at launch, (0, 0) at impact. */
    offset: { x: number; y: number };
    /** 0..1: 1 at impact, 0 after 120 ms. */
    flash: number;
    /** 0..1 over the 600 ms after impact; undefined before it. */
    burst: number | undefined;
    /** True 600 ms after impact. */
    done: boolean;
}

const START_SHADOW_SCALE = 0.2;
const START_OFFSET = { x: -240, y: -480 };
const FLASH_MS = 120;
const BURST_MS = 600;

/**
 * What the fall of a meteor looks like `elapsedMs` after its launch. Everything is linear in time. For who asked for
 * less motion, the meteor does not fly in and nothing flashes: the shadow and the burst remain.
 */
export function meteorFrame(elapsedMs: number, fallMs: number, reducedMotion: boolean): MeteorFrame {
    const fall = Math.min(Math.max(elapsedMs / fallMs, 0), 1);
    const sinceImpact = elapsedMs - fallMs;
    const flash = sinceImpact < 0 ? 0 : Math.max(0, 1 - sinceImpact / FLASH_MS);
    return {
        shadowScale: START_SHADOW_SCALE + (1 - START_SHADOW_SCALE) * fall,
        offset: reducedMotion ? { x: 0, y: 0 } : { x: START_OFFSET.x * (1 - fall), y: START_OFFSET.y * (1 - fall) },
        flash: reducedMotion ? 0 : flash,
        burst: sinceImpact < 0 ? undefined : Math.min(sinceImpact / BURST_MS, 1),
        done: sinceImpact >= BURST_MS,
    };
}

/** Whether the flash of an impact may show: never sooner than `minIntervalMs` after the previous flash began. */
export function flashAllowed(impactAt: number, lastFlashAt: number | undefined, minIntervalMs: number): boolean {
    return lastFlashAt === undefined || impactAt - lastFlashAt >= minIntervalMs;
}

/** How far behind the front each following circle of the wave is, in map pixels. */
const WAVE_CIRCLE_GAP_PX = 24;
/** How strong each circle is next to the front: the front, then the two behind it. */
const WAVE_CIRCLE_STRENGTHS = [1, 0.6, 0.35];
const WAVE_FRONT_ALPHA = 0.7;
/** How long the wave of the server runs: from the rim of the crater as far as it goes. */
const WAVE_MS = ((METEOR_WAVE_CELLS - METEOR_DISC_CELLS) / METEOR_WAVE_CELLS_PER_STEP) * WATER_STEP_MS;

/**
 * The circles of the wave an impact sends over the water, `sinceImpactMs` after it: the front, where the wave of the
 * server is at that time, and two fainter ones behind it, all fading as they go. Radii in map pixels. None before
 * the impact nor once the wave ended.
 */
export function waveCircles(sinceImpactMs: number): { radius: number; alpha: number }[] {
    if (sinceImpactMs < 0 || sinceImpactMs >= WAVE_MS) return [];
    const cells = METEOR_DISC_CELLS + (sinceImpactMs / WATER_STEP_MS) * METEOR_WAVE_CELLS_PER_STEP;
    const front = cells * TERRAIN_CELL;
    const fade = 1 - sinceImpactMs / WAVE_MS;
    return WAVE_CIRCLE_STRENGTHS.map((strength, index) => ({
        radius: front - index * WAVE_CIRCLE_GAP_PX,
        alpha: WAVE_FRONT_ALPHA * fade * strength,
    })).filter((circle) => circle.radius > 0);
}
