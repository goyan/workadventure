import {
    FIREBALL_EMBER_REACH,
    METEOR_WAVE_CELLS_PER_STEP,
    TERRAIN_CELL,
    WATER_STEP_MS,
} from "@workadventure/map-editor";
import type { MeteorShape } from "@workadventure/map-editor";

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
/**
 * The circles of the wave an impact sends over the water, `sinceImpactMs` after it: the front, where the wave of the
 * server is at that time for a meteor of that shape, and two fainter ones behind it, all fading as they go. Radii in map pixels. None before
 * the impact nor once the wave ended.
 */
export function waveCircles(sinceImpactMs: number, shape: MeteorShape): { radius: number; alpha: number }[] {
    // How long the wave of the server runs: from the rim of the crater as far as it goes.
    const waveMs = ((shape.waveCells - shape.discCells) / METEOR_WAVE_CELLS_PER_STEP) * WATER_STEP_MS;
    if (sinceImpactMs < 0 || sinceImpactMs >= waveMs) return [];
    const cells = shape.discCells + (sinceImpactMs / WATER_STEP_MS) * METEOR_WAVE_CELLS_PER_STEP;
    const front = cells * TERRAIN_CELL;
    const fade = 1 - sinceImpactMs / waveMs;
    return WAVE_CIRCLE_STRENGTHS.map((strength, index) => ({
        radius: front - index * WAVE_CIRCLE_GAP_PX,
        alpha: WAVE_FRONT_ALPHA * fade * strength,
    })).filter((circle) => circle.radius > 0);
}

/** The front of the wave of a comet as the water shader draws it: a ring of raised water, 0 to 1 strong. */
export interface WaterRing {
    x: number;
    y: number;
    radius: number;
    strength: number;
}

/** The front of the wave of a comet fallen into water, `sinceImpactMs` after its impact; undefined once it has run. */
export function waterRingOf(
    meteor: { x: number; y: number; shape: MeteorShape },
    sinceImpactMs: number,
): WaterRing | undefined {
    const front = waveCircles(sinceImpactMs, meteor.shape)[0];
    if (!front) return undefined;
    return { x: meteor.x, y: meteor.y, radius: front.radius, strength: front.alpha / WAVE_FRONT_ALPHA };
}

/**
 * The stretches of a circle that lie on water, from what was read at `wet.length` points evenly spaced along it:
 * each from a point to the one after its last (so `to` goes past the number of points for the stretch that goes
 * round the start). The whole circle is one stretch from 0.
 */
export function wetStretches(wet: readonly boolean[]): { from: number; to: number }[] {
    const count = wet.length;
    const firstDry = wet.indexOf(false);
    if (firstDry === -1) return count > 0 ? [{ from: 0, to: count }] : [];
    const stretches: { from: number; to: number }[] = [];
    // Start right after a dry point, so that no stretch is cut in two by the start of the circle.
    let from: number | undefined;
    for (let step = 1; step <= count; step++) {
        const point = firstDry + step;
        if (wet[point % count]) {
            from ??= point;
        } else if (from !== undefined) {
            stretches.push({ from: from % count, to: (from % count) + (point - from) });
            from = undefined;
        }
    }
    return stretches.sort((one, other) => one.from - other.from);
}

const SPARKS_MS = 900;
/** The golden angle: sparks turned by it from one to the next never line up. */
const GOLDEN_TURN = 2.399963229728653;
/**
 * The sparks a fireball throws out of its crater, `sinceImpactMs` after it lands: where each is from the impact
 * point (map pixels) and how bright. They fly out to FIREBALL_EMBER_REACH times the radius of the crater at most,
 * each at its own pace, on a low arc, fading as they go. Always the same for the same time. None before the impact
 * nor once they are out.
 */
export function fireballSparks(
    sinceImpactMs: number,
    craterPx: number,
    count: number,
): { x: number; y: number; alpha: number }[] {
    if (sinceImpactMs < 0 || sinceImpactMs >= SPARKS_MS) return [];
    const time = sinceImpactMs / SPARKS_MS;
    const sparks: { x: number; y: number; alpha: number }[] = [];
    for (let index = 0; index < count; index++) {
        const turn = index * GOLDEN_TURN;
        // From half the reach to all of it, by turns.
        const pace = 0.5 + (0.5 * ((index * 7) % 10)) / 9;
        const far = craterPx * FIREBALL_EMBER_REACH * pace * time;
        // The arc lifts a spark above the straight line, never past the reach: it only shortens the way out.
        const lift = Math.sin(time * Math.PI) * 0.15;
        sparks.push({
            x: Math.cos(turn) * far,
            y: Math.sin(turn) * far * (1 - lift),
            alpha: 1 - time,
        });
    }
    return sparks;
}

const STEAM_MS = 2000;
const STEAM_PUFFS = 5;
/**
 * The steam above a fireball that fell into water, `sinceImpactMs` after it: puffs that rise (`rise`, map pixels
 * above the impact point), widen and fade. None before the impact nor once it is gone.
 */
export function steamPuffs(sinceImpactMs: number, craterPx: number): { radius: number; rise: number; alpha: number }[] {
    if (sinceImpactMs < 0 || sinceImpactMs >= STEAM_MS) return [];
    const time = sinceImpactMs / STEAM_MS;
    const puffs: { radius: number; rise: number; alpha: number }[] = [];
    for (let index = 0; index < STEAM_PUFFS; index++) {
        const share = (index + 1) / STEAM_PUFFS;
        puffs.push({
            radius: craterPx * (0.3 + 0.5 * time) * (1.2 - 0.6 * share),
            rise: craterPx * 1.5 * time * share,
            alpha: 0.5 * (1 - time),
        });
    }
    return puffs;
}
