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
