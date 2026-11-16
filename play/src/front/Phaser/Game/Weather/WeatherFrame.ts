import { WeatherType } from "@workadventure/map-editor";
import type { AutoWeatherSettings } from "@workadventure/map-editor";
import { snowPossibleAt } from "../Nature/SeasonClock";
import { SeasonalTheme } from "../Seasonal/SeasonalTheme";
import { hash01, leafColor } from "../Autumn/LeafPalette";
import { autoWeatherAt, slotStart } from "./WeatherSchedule";

export interface WeatherView {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * The view grown by `share` of its size on each side: the weather is drawn beyond the screen, so a scroll between two
 * drawings uncovers weather already there instead of a bare band.
 */
export function paddedView(view: WeatherView, share: number): WeatherView {
    return {
        x: view.x - view.width * share,
        y: view.y - view.height * share,
        width: view.width * (1 + 2 * share),
        height: view.height * (1 + 2 * share),
    };
}

/** Whether `view` keeps at least `slack` of its size inside `drawn` on every side. */
export function wellInside(drawn: WeatherView, view: WeatherView, slack: number): boolean {
    const x = view.width * slack;
    const y = view.height * slack;
    return (
        view.x - drawn.x >= x &&
        view.y - drawn.y >= y &&
        drawn.x + drawn.width - (view.x + view.width) >= x &&
        drawn.y + drawn.height - (view.y + view.height) >= y
    );
}

export interface WeatherParticle {
    x: number;
    y: number;
    length: number;
}

/** A field fixed to world coordinates, so camera movement never drags the rain along. */
export function weatherParticles(weather: WeatherType, epoch: number, view: WeatherView): WeatherParticle[] {
    if (weather === WeatherType.Clear) return [];
    const cellSize = Math.max(64, Math.ceil(Math.sqrt((view.width * view.height) / 350)));
    const snow = weather === WeatherType.Snow;
    const speed = snow ? 18 : weather === WeatherType.Storm ? 210 : 150;
    const time = epoch / 1000;
    const particles: WeatherParticle[] = [];
    for (let row = Math.floor(view.y / cellSize) - 1; row <= Math.ceil((view.y + view.height) / cellSize); row++) {
        for (let col = Math.floor(view.x / cellSize) - 1; col <= Math.ceil((view.x + view.width) / cellSize); col++) {
            const seed = Math.abs(Math.sin(col * 127.1 + row * 311.7) * 43758.5453) % 1;
            particles[particles.length] = {
                x: col * cellSize + seed * cellSize + (snow ? Math.sin(time + seed * 20) * 5 : 0),
                y: row * cellSize + ((seed * cellSize + time * speed) % cellSize),
                length: snow ? 2 : weather === WeatherType.Storm ? 13 : 9,
            };
        }
    }
    return particles;
}

export interface LeafParticle {
    x: number;
    y: number;
    color: number;
    /** 3×4 instead of 4×3: the leaf turns as it sways. */
    vertical: boolean;
}

/** Leaves fall slower than snow, sway, and drift with a light wind; about three times fewer than snowflakes. */
export function leafParticles(epoch: number, view: WeatherView): LeafParticle[] {
    const snowCell = Math.max(64, Math.ceil(Math.sqrt((view.width * view.height) / 350)));
    const cellSize = Math.round(snowCell * Math.sqrt(3));
    const time = epoch / 1000;
    const particles: LeafParticle[] = [];
    for (let row = Math.floor(view.y / cellSize) - 1; row <= Math.ceil((view.y + view.height) / cellSize); row++) {
        for (let col = Math.floor(view.x / cellSize) - 1; col <= Math.ceil((view.x + view.width) / cellSize); col++) {
            const seed = hash01(col, row);
            const sway = (time * 2 * Math.PI) / 3 + seed * 20;
            particles[particles.length] = {
                x: col * cellSize + ((seed * cellSize + time * 6) % cellSize) + Math.sin(sway) * 8,
                y: row * cellSize + ((hash01(col, row, 1) * cellSize + time * 12) % cellSize),
                color: leafColor(hash01(col, row, 2)),
                vertical: Math.cos(sway) > 0,
            };
        }
    }
    return particles;
}

export interface StormStrike {
    /** Server time of the strike, in milliseconds. */
    at: number;
    /** Picks the shape and place of the bolt. */
    seed: number;
}

/** One strike about every 21 seconds, moved by up to 4.5 s either way: 12 to 30 s apart, never a fixed rhythm. */
const STRIKE_SPACING = 21000;
const STRIKE_JITTER = 4500;

function strikeAt(index: number): StormStrike {
    return { at: index * STRIKE_SPACING + Math.round((hash01(index, 5, 9) * 2 - 1) * STRIKE_JITTER), seed: index };
}

/** The last strike at or before this server time: the same for everyone, nothing stored. */
export function lastStrike(epoch: number): StormStrike {
    const index = Math.floor(epoch / STRIKE_SPACING);
    for (const candidate of [index + 1, index]) {
        const strike = strikeAt(candidate);
        if (strike.at <= epoch) return strike;
    }
    return strikeAt(index - 1);
}

function triangle(elapsed: number, start: number, end: number, peak: number): number {
    if (elapsed <= start || elapsed >= end) return 0;
    const middle = (start + end) / 2;
    return peak * (elapsed < middle ? (elapsed - start) / (middle - start) : (end - elapsed) / (end - middle));
}

/**
 * How bright the storm flash is, this long after a strike: two quick flashes within 0.4 s. When motion is reduced,
 * a single gentle glow over 1.2 s instead.
 */
export function stormFlash(elapsed: number, reducedMotion: boolean): number {
    if (reducedMotion) {
        return elapsed > 0 && elapsed < 1200 ? Math.sin((elapsed / 1200) * Math.PI) * 0.12 : 0;
    }
    return Math.max(triangle(elapsed, 0, 120, 0.45), triangle(elapsed, 200, 400, 0.3));
}

const BOLT_MS = 300;
const BOLT_SEGMENTS = 8;
const BOLT_TRIES = 6;

/**
 * The bolt of a strike, from the sky down to a point outdoors in the view, for 0.3 s; undefined otherwise. Several
 * places are tried; a bolt is only drawn where all its points are outdoors, so it never crosses a room.
 */
export function lightningBolt(
    strike: StormStrike,
    elapsed: number,
    view: WeatherView,
    isOutdoor: ((x: number, y: number) => boolean) | undefined,
): { x: number; y: number }[] | undefined {
    if (elapsed < 0 || elapsed >= BOLT_MS) return undefined;
    const clampX = (x: number): number => Math.min(view.x + view.width, Math.max(view.x, x));
    for (let attempt = 0; attempt < BOLT_TRIES; attempt++) {
        const targetX = view.x + view.width * (0.15 + 0.7 * hash01(strike.seed, attempt, 31));
        const targetY = view.y + view.height * (0.45 + 0.4 * hash01(strike.seed, attempt, 37));
        const length = view.height * 0.35;
        const drift = (hash01(strike.seed, attempt, 41) * 2 - 1) * 60;
        const points: { x: number; y: number }[] = [];
        for (let step = 0; step <= BOLT_SEGMENTS; step++) {
            const share = step / BOLT_SEGMENTS;
            const jitter =
                step === 0 || step === BOLT_SEGMENTS ? 0 : (hash01(strike.seed, attempt * 16 + step, 43) * 2 - 1) * 18;
            points.push({
                x: Math.round(clampX(targetX + drift * (1 - share) + jitter)),
                y: Math.round(targetY - length * (1 - share)),
            });
        }
        if (!isOutdoor || points.every((point) => isOutdoor(point.x, point.y))) return points;
    }
    return undefined;
}

/** The seasonal schedule is shared by every client: same Paris date and settings, same weather. */
export function weatherAtTime(
    configured: WeatherType,
    serverDate: Date | undefined,
    auto?: AutoWeatherSettings,
): WeatherType {
    // A cloudy sky is a clear one: its clouds are drawn apart (cloudiness), never as rain.
    if (configured === WeatherType.Cloudy) return WeatherType.Clear;
    if (configured === WeatherType.Snow) {
        if (!serverDate || !Number.isFinite(serverDate.getTime())) return WeatherType.Clear;
        return snowPossibleAt(serverDate) ? WeatherType.Snow : WeatherType.Rain;
    }
    if (configured !== WeatherType.Automatic) return configured;
    if (!serverDate || !Number.isFinite(serverDate.getTime())) return WeatherType.Clear;
    return autoWeatherAt(serverDate, auto);
}

/** Weather only falls outdoors: particles above an indoor cell are not drawn. No grid means no filtering. */
export function keepOutdoorParticles<T extends { x: number; y: number }>(
    particles: T[],
    isOutdoor: ((x: number, y: number) => boolean) | undefined,
): T[] {
    return isOutdoor ? particles.filter((particle) => isOutdoor(particle.x, particle.y)) : particles;
}

/** The personal Christmas theme shows snow, whatever the map weather; autumn keeps the map weather. */
export function effectiveWeather(weather: WeatherType, theme: SeasonalTheme | undefined): WeatherType {
    return theme === SeasonalTheme.Christmas ? WeatherType.Snow : weather;
}

const SLOT_MS = 30 * 60 * 1000;
const FOG_FADE_MS = 3 * 60 * 1000;

/**
 * How thick the fog is, from 0 to 1. A fixed fog is always full; in a slot of automatic fog, it rises over three
 * minutes when the previous slot has none and fades over the last three when the next one has none. A real fog
 * (`startedAt`, `endsAt`, see withRealWeather) does the same over its run of quarter hours.
 */
export function fogStrength(
    configured: WeatherType,
    date: Date,
    auto?: AutoWeatherSettings,
    startedAt?: number,
    endsAt?: number,
): number {
    if (configured === WeatherType.Fog) {
        if (startedAt === undefined || !Number.isFinite(date.getTime())) return 1;
        const time = date.getTime();
        const fadeIn = (time - startedAt) / FOG_FADE_MS;
        const fadeOut = endsAt === undefined ? 1 : (endsAt - time) / FOG_FADE_MS;
        return Math.max(0, Math.min(1, fadeIn, fadeOut));
    }
    if (configured !== WeatherType.Automatic) return 0;
    const time = date.getTime();
    if (!Number.isFinite(time) || autoWeatherAt(date, auto) !== WeatherType.Fog) return 0;
    const start = slotStart(date).getTime();
    let strength = 1;
    if (autoWeatherAt(new Date(start - 1), auto) !== WeatherType.Fog) {
        strength = Math.min(strength, (time - start) / FOG_FADE_MS);
    }
    if (autoWeatherAt(new Date(start + SLOT_MS), auto) !== WeatherType.Fog) {
        strength = Math.min(strength, (start + SLOT_MS - time) / FOG_FADE_MS);
    }
    return Math.max(0, Math.min(1, strength));
}

export interface FogPatch {
    x: number;
    y: number;
    radius: number;
    /** How much the patch counts, 0 to 1 (a cloud fading in); 1 when absent. */
    weight?: number;
}

const FOG_PATCHES = 4;
const FOG_DRIFT = { x: 3.2, y: 2.4 };
/** The fog patches are a square repeated over the map, fixed to it like the clouds (map pixels). */
const FOG_PERIOD = 1400;
const FOG_RADIUS = 340;

/**
 * A few soft patches fixed to the map that drift slowly (4 px a second): a square of patches repeated over the whole
 * map, so the camera, its zoom and the size of the screen never move nor resize them.
 */
export function fogPatches(epoch: number, view: WeatherView, still: boolean): FogPatch[] {
    const time = still ? 0 : epoch / 1000;
    const patches: FogPatch[] = [];
    for (let index = 0; index < FOG_PATCHES; index++) {
        const radius = Math.round(FOG_RADIUS * (0.8 + 0.2 * hash01(index, 21)));
        const square = {
            x: hash01(index, 7) * FOG_PERIOD + time * FOG_DRIFT.x,
            y: hash01(index, 13) * FOG_PERIOD + time * FOG_DRIFT.y,
        };
        for (const centre of repeatedOverView(square, FOG_PERIOD, view, FOG_RADIUS)) {
            patches.push({ ...centre, radius });
        }
    }
    return patches;
}

/**
 * Every copy, over the view and a margin around it, of a point of a square repeated over the whole map (period in map
 * pixels): what the fog patches and the clouds are made of, so the camera and its zoom never move them.
 */
export function repeatedOverView(
    point: { x: number; y: number },
    period: number,
    view: WeatherView,
    margin: number,
): { x: number; y: number }[] {
    const wrap = (value: number): number => ((value % period) + period) % period;
    const left = view.x - margin;
    const top = view.y - margin;
    const right = view.x + view.width + margin;
    const bottom = view.y + view.height + margin;
    const inSquare = { x: wrap(point.x), y: wrap(point.y) };
    const copies: { x: number; y: number }[] = [];
    for (let x = inSquare.x + Math.ceil((left - inSquare.x) / period) * period; x <= right; x += period) {
        for (let y = inSquare.y + Math.ceil((top - inSquare.y) / period) * period; y <= bottom; y += period) {
            copies.push({ x, y });
        }
    }
    return copies;
}

/** How many thicknesses a fog block can have, from 1 (thin) to this value (the centre of a patch). */
export const FOG_LEVELS = 8;

export interface FogBlock {
    x: number;
    y: number;
    width: number;
    height: number;
    /** From 1 to FOG_LEVELS. */
    level: number;
}

interface RowSpan {
    patch: FogPatch;
    start: number;
    end: number;
}

/** Where each patch covers a horizontal line, sorted by start; the patches missing the line are left out. */
function rowSpans(patches: readonly FogPatch[], lineY: number): RowSpan[] {
    const spans: RowSpan[] = [];
    for (const patch of patches) {
        const reach = patch.radius ** 2 - (lineY - patch.y) ** 2;
        if (reach <= 0) continue;
        const halfWidth = Math.sqrt(reach);
        spans.push({ patch, start: patch.x - halfWidth, end: patch.x + halfWidth });
    }
    return spans.sort((a, b) => a.start - b.start);
}

/**
 * The fog patches cut into square blocks inside the outdoor runs, so a patch stops at the walls instead of covering
 * a room. Each block takes the thickness at its centre (soft towards the edge of a patch); neighbours of the same
 * thickness on a row are merged into one rectangle.
 */
export function fogBlocks(runs: readonly WeatherView[], patches: readonly FogPatch[], block: number): FogBlock[] {
    const blocks: FogBlock[] = [];
    if (patches.length === 0) return blocks;
    for (const run of runs) {
        const right = run.x + run.width;
        const bottom = run.y + run.height;
        // On a grid fixed to the map, cut by the run: moving or zooming the view never shifts a block.
        for (let gridY = Math.floor(run.y / block) * block; gridY < bottom; gridY += block) {
            const y = Math.max(gridY, run.y);
            const height = Math.min(gridY + block, bottom) - y;
            const centreY = gridY + block / 2;
            // Only the patches crossing this row, by where they start on it: a block then looks at the few patches
            // over it instead of all of them (thousands when zoomed out, at every image).
            const crossing = rowSpans(patches, centreY);
            const active: RowSpan[] = [];
            let next = 0;
            let current: FogBlock | undefined;
            for (let gridX = Math.floor(run.x / block) * block; gridX < right; gridX += block) {
                const x = Math.max(gridX, run.x);
                const width = Math.min(gridX + block, right) - x;
                // The thickness of the whole grid block, whatever part of it the run keeps.
                const centreX = gridX + block / 2;
                while (next < crossing.length && crossing[next].start < centreX) active.push(crossing[next++]);
                let thickness = 0;
                for (let index = active.length - 1; index >= 0; index--) {
                    const span = active[index];
                    if (span.end <= centreX) {
                        active.splice(index, 1);
                        continue;
                    }
                    const patch = span.patch;
                    const share = 1 - ((centreX - patch.x) ** 2 + (centreY - patch.y) ** 2) / patch.radius ** 2;
                    if (share > 0) thickness += (patch.weight ?? 1) * share * share;
                }
                const level = Math.round(Math.min(1, thickness) * FOG_LEVELS);
                if (level === 0) {
                    current = undefined;
                } else if (current && current.level === level) {
                    current.width += width;
                } else {
                    current = { x, y, width, height, level };
                    blocks.push(current);
                }
            }
        }
    }
    return blocks;
}
