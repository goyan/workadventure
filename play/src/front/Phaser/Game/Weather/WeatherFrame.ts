import { precipitationWeather, WeatherType } from "@workadventure/map-editor";
import type { AutoWeatherSettings } from "@workadventure/map-editor";
import { hash01 } from "../Autumn/LeafPalette";
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

/** A flake falls this many map pixels a second: far slower than a drop, so the wind carries it further sideways. */
const FLAKE_SPEED = 18;
/** Sideways pixels a flake is carried for one pixel down, for a rain leaning by 1 (see rainLean). */
const FLAKE_DRIFT = 3;

/**
 * How many of the flakes show, 0 to 1, for a precipitation of this intensity (0 to 1, rainIntensity) of which `snow`
 * (0 to 1, snowShare) falls as snow: none in a rain, some among the drops of a sleet, a thick fall for a heavy
 * precipitation in the cold.
 */
export function snowfall(intensity: number, snow: number): number {
    if (!(snow > 0) || !(intensity > 0)) return 0;
    return Math.min(1, snow * (0.3 + 0.7 * intensity));
}

/**
 * The snowflakes of a precipitation falling as snow, a field fixed to world coordinates, so camera movement never
 * drags them along: `amount` (0 to 1, snowfall) says which of them show, always the same ones first; `lean` carries
 * them with the wind as it leans the rain (rainLean). The drops of the rain are apart (Rain.ts).
 */
export function snowflakes(epoch: number, view: WeatherView, amount: number, lean = 0): WeatherParticle[] {
    if (!(amount > 0)) return [];
    const cellSize = Math.max(64, Math.ceil(Math.sqrt((view.width * view.height) / 350)));
    const time = epoch / 1000;
    const particles: WeatherParticle[] = [];
    for (let row = Math.floor(view.y / cellSize) - 1; row <= Math.ceil((view.y + view.height) / cellSize); row++) {
        for (let col = Math.floor(view.x / cellSize) - 1; col <= Math.ceil((view.x + view.width) / cellSize); col++) {
            // Which flakes show is drawn apart from where they are: a light fall is not a corner of a thick one.
            if (hash01(col, row, 83) >= amount) continue;
            const seed = Math.abs(Math.sin(col * 127.1 + row * 311.7) * 43758.5453) % 1;
            const fallen = (seed * cellSize + time * FLAKE_SPEED) % cellSize;
            particles[particles.length] = {
                x: col * cellSize + seed * cellSize + Math.sin(time + seed * 20) * 5 + lean * FLAKE_DRIFT * fallen,
                y: row * cellSize + fallen,
                length: 2,
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
    // A map saved with a snow: a rain, which the cold alone turns to snow (snowShare).
    if (configured !== WeatherType.Automatic) return precipitationWeather(configured);
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

/** The patches crossing a horizontal line, and the width of the widest crossing. */
interface Row {
    spans: RowSpan[];
    widest: number;
}

/** Where each patch covers a horizontal line, sorted by start; the patches missing the line are left out. */
function rowSpans(patches: readonly FogPatch[], lineY: number): Row {
    const spans: RowSpan[] = [];
    let widest = 0;
    for (const patch of patches) {
        const reach = patch.radius ** 2 - (lineY - patch.y) ** 2;
        if (reach <= 0) continue;
        const halfWidth = Math.sqrt(reach);
        spans.push({ patch, start: patch.x - halfWidth, end: patch.x + halfWidth });
        widest = Math.max(widest, 2 * halfWidth);
    }
    return { spans: spans.sort((a, b) => a.start - b.start), widest };
}

/** Cells over the map: the top left corner of the first (map pixels), how many across and down. */
export interface CellArea {
    x: number;
    y: number;
    columns: number;
    rows: number;
}

/**
 * The thickness of the patches (0 to FOG_LEVELS) at the centre of each cell of `area`, `size` map pixels wide, row by
 * row: one pass over the patches for the whole area, the walls applied when painting (outdoorCells).
 */
export function fieldLevels(area: CellArea, size: number, patches: readonly FogPatch[]): Uint8Array {
    const levels = new Uint8Array(area.columns * area.rows);
    if (patches.length === 0) return levels;
    for (let line = 0; line < area.rows; line++) {
        const centreY = area.y + (line + 0.5) * size;
        const spans = rowSpans(patches, centreY).spans;
        const active: RowSpan[] = [];
        let next = 0;
        for (let column = 0; column < area.columns; column++) {
            const centreX = area.x + (column + 0.5) * size;
            while (next < spans.length && spans[next].start < centreX) active.push(spans[next++]);
            let thickness = 0;
            for (let index = active.length - 1; index >= 0; index--) {
                const span = active[index];
                if (span.end <= centreX) {
                    active[index] = active[active.length - 1];
                    active.pop();
                    continue;
                }
                const patch = span.patch;
                const share = 1 - ((centreX - patch.x) ** 2 + (centreY - patch.y) ** 2) / patch.radius ** 2;
                if (share > 0) thickness += (patch.weight ?? 1) * share * share;
            }
            levels[line * area.columns + column] = Math.round(Math.min(1, thickness) * FOG_LEVELS);
        }
    }
    return levels;
}

/** 1 for each cell of `area` whose centre is in one of the outdoor runs, 0 for the others. */
export function outdoorCells(area: CellArea, size: number, runs: readonly WeatherView[]): Uint8Array {
    const outdoor = new Uint8Array(area.columns * area.rows);
    // The first cell whose centre is at or after `value`, and the first one after `end` (excluded), in cells.
    const from = (value: number, origin: number) => Math.max(0, Math.ceil((value - origin) / size - 0.5));
    for (const run of runs) {
        const top = from(run.y, area.y);
        const bottom = Math.min(area.rows, from(run.y + run.height, area.y));
        const left = from(run.x, area.x);
        const right = Math.min(area.columns, from(run.x + run.width, area.x));
        for (let line = top; line < bottom; line++)
            outdoor.fill(1, line * area.columns + left, line * area.columns + right);
    }
    return outdoor;
}

/**
 * The cells of `area` the fog passes over once the map is seen from far (see WeatherManager): 1 for each cell that is
 * not outdoors (rooms, walls, raised floors), but the cells of the room the avatar stands in, kept clear at every zoom.
 * `roomAt` is read at the centre of each cell; `keptRoom` undefined (the avatar outdoors) covers the whole inside.
 */
export function farFogCells(
    area: CellArea,
    size: number,
    outdoor: Uint8Array,
    roomAt: (x: number, y: number) => number | undefined,
    keptRoom: number | undefined,
): Uint8Array {
    const cells = new Uint8Array(area.columns * area.rows);
    for (let line = 0; line < area.rows; line++) {
        const centreY = area.y + (line + 0.5) * size;
        for (let column = 0; column < area.columns; column++) {
            const cell = line * area.columns + column;
            if (outdoor[cell]) continue;
            if (keptRoom !== undefined && roomAt(area.x + (column + 0.5) * size, centreY) === keptRoom) continue;
            cells[cell] = 1;
        }
    }
    return cells;
}

/**
 * Index of a span of the row (sorted by start) from which on any span may reach `x`: every span before it starts more
 * than the widest span away on the left, so it ends before `x`.
 */
function firstReaching(row: Row, x: number): number {
    const { spans, widest } = row;
    let low = 0;
    let high = spans.length;
    while (low < high) {
        const middle = (low + high) >> 1;
        if (spans[middle].start < x - widest) low = middle + 1;
        else high = middle;
    }
    return low;
}

/**
 * The fog patches cut into square blocks inside the outdoor runs, so a patch stops at the walls instead of covering
 * a room. Each block takes the thickness at its centre (soft towards the edge of a patch); neighbours of the same
 * thickness on a row are merged into one rectangle.
 */
export function fogBlocks(runs: readonly WeatherView[], patches: readonly FogPatch[], block: number): FogBlock[] {
    const blocks: FogBlock[] = [];
    if (patches.length === 0) return blocks;
    // The patches crossing each row, found once for all the runs of that row (hundreds when walls cut the outside).
    const rows = new Map<number, Row>();
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
            let row = rows.get(centreY);
            if (!row) {
                row = rowSpans(patches, centreY);
                rows.set(centreY, row);
            }
            const crossing = row.spans;
            // The first patch that may reach this run, found by halving: the ones before end on its left.
            let next = firstReaching(row, run.x);
            const active: RowSpan[] = [];
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
