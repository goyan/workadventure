import { wetBulbTemperature } from "@workadventure/map-editor";
import type { PrecipitationAir } from "@workadventure/map-editor";
import { COPY_SALT, copyShown, shownCopiesBound } from "./ParticleDensity";
import { fallHash, fallSeconds } from "./FallHash";
import type { WeatherView } from "./WeatherFrame";

/**
 * The snow of the weather, drawn from the air it falls through: how much falls (the water rate of its snow part), what
 * kind of flakes (the wet-bulb temperature they fall through), how fast they come down and how the wind carries them.
 * Pure rules; WeatherManager draws them.
 */

/** Map pixels for a metre: a tile of 32 px is about 1.1 m (the height of a character's head above the ground). */
export const PX_PER_METRE = 32 / 1.1;

type Vector = { x: number; y: number };

export interface FlakeKind {
    /** Largest dimension of the flake, mm. */
    diameterMm: number;
    /** Terminal velocity in still air, m/s. */
    fallSpeed: number;
    /** Mass, mg: with the speed, how many flakes carry the same water (flakeCapacity). */
    massMg: number;
    /** How far it sways to each side as it falls, map pixels: a large aggregate flutters, a fine crystal hardly. */
    flutterPx: number;
    /** Shape drawn (FLAKE_SHAPES) in the far and the near plane. */
    sizes: readonly [far: number, near: number];
}

/**
 * Three kinds of flakes, each with a fixed speed and size (a position multiplied by the time must never depend on a
 * value that changes, or every flake would jump): the temperature only says how many of each fall (flakeMix).
 * Speeds and masses are the fits of Locatelli and Hobbs, "Fall speeds and masses of solid precipitation particles",
 * J. Geophys. Res. 79 (1974), 2185-2197, table 1 (V in m/s, D the largest dimension in mm, M in mg):
 * - aggregates of unrimed radiating assemblages of dendrites or dendrites, 2 to 10 mm: V = 0.8 D^0.16, M = 0.073 D^1.4;
 *   the big flakes of a snow near 0 °C (8 mm) and the middle ones (3 mm);
 * - aggregates of unrimed radiating assemblages of plates, side planes, bullets and columns, 0.2 to 3 mm:
 *   V = 0.69 D^0.41, M = 0.037 D^1.9; the fine crystals of a hard frost (1 mm).
 * All about 1 m/s, the size hardly changes it (D^0.16), against 5 to 9 m/s for raindrops (Gunn and Kinzer 1949).
 */
function dendriteAggregate(diameterMm: number, flutterPx: number, sizes: readonly [number, number]): FlakeKind {
    return {
        diameterMm,
        fallSpeed: 0.8 * diameterMm ** 0.16,
        massMg: 0.073 * diameterMm ** 1.4,
        flutterPx,
        sizes,
    };
}

export const FLAKE_KINDS: readonly FlakeKind[] = [
    dendriteAggregate(8, 3, [4, 5]),
    dendriteAggregate(3, 2, [2, 3]),
    { diameterMm: 1, fallSpeed: 0.69, massMg: 0.037, flutterPx: 1, sizes: [1, 1] },
];

/**
 * How many flakes of a kind carry a given water rate, relative: a rate R (mass a second through a square metre) is a
 * number of flakes a cubic metre times their mass and their speed, so N = R / (M V). Fine crystals are some 60 times as
 * many as big aggregates for the same water: shown by the fourth root, under 3 times (a choice: the screen would be
 * white otherwise, a big flake is drawn far bigger than it is, and the flakes are drawn 30 times a second).
 */
export function flakeCapacity(kind: FlakeKind): number {
    return Math.sqrt(Math.sqrt(1 / (kind.massMg * kind.fallSpeed)));
}

/**
 * Flakes of each kind in a view at the heaviest fall of that kind alone, for one unit of capacity: a heavy wet snow
 * shows about 900 big flakes on a usual screen, a heavy fall of fine crystals about 2 000 specks.
 */
export const FLAKES_PER_CAPACITY = 860;

/**
 * Which kinds fall, by wet-bulb temperature (°C, the temperature a falling flake feels: it cools as it evaporates).
 * Near 0 °C the ice is sticky and the crystals cling into big flakes, the largest of all; colder, they cling less, with
 * a second maximum of the dendrites around -12 °C (Hobbs, Chang and Locatelli, "The dimensions and aggregation of ice
 * crystals in natural clouds", J. Geophys. Res. 79 (1974), 2199-2206); below about -20 °C, single small crystals. The
 * shares between those points are a choice.
 */
const MIX: readonly (readonly [wetBulb: number, aggregate: number, middle: number, fine: number])[] = [
    [-25, 0, 0, 1],
    [-20, 0, 0.2, 0.8],
    [-12, 0.1, 0.6, 0.3],
    [-6, 0.3, 0.6, 0.1],
    [-2, 0.7, 0.3, 0],
];
/** The air of a snow whose air is not known (a weather set by hand): a usual snow, just under 0 °C. */
const USUAL_WET_BULB = -3;

/** The share of each kind of FLAKE_KINDS, summing to 1, for the air the snow falls through. */
export function flakeMix(air: PrecipitationAir | undefined): number[] {
    const bulb = air ? wetBulbTemperature(air.temperature, air.humidity) : USUAL_WET_BULB;
    const at = Number.isFinite(bulb) ? bulb : USUAL_WET_BULB;
    if (at <= MIX[0][0]) return MIX[0].slice(1);
    for (let index = 1; index < MIX.length; index++) {
        const [t0, ...w0] = MIX[index - 1];
        const [t1, ...w1] = MIX[index];
        if (at <= t1) {
            const share = (at - t0) / (t1 - t0);
            return w0.map((weight, kind) => weight + (w1[kind] - weight) * share);
        }
    }
    return MIX[MIX.length - 1].slice(1);
}

/**
 * How hard the snow falls, 0 to 1, for its water rate (mm of water an hour, what falls as snow): about 1 cm of fresh
 * snow an hour per mm of water. Light under 1 mm/h, heavy from 2.5 mm/h, the usual classes; the curve between them is
 * a choice, like that of the rain (rainIntensity). Never nothing while it snows.
 */
const SNOW_LEVELS: readonly (readonly [rate: number, level: number])[] = [
    [0, 0.08],
    [0.25, 0.2],
    [1, 0.45],
    [2.5, 0.75],
    [5, 1],
];
/** A snow whose rate is not known (a weather set by hand): a moderate one; a storm falls heavy. */
const USUAL_SNOW = 0.5;
const STORM_SNOW = 0.85;

export function snowLevel(rate: number | undefined, snowShare: number, storm = false): number {
    if (!(snowShare > 0)) return 0;
    const share = Math.min(1, snowShare);
    if (rate === undefined || !Number.isFinite(rate)) return (storm ? STORM_SNOW : USUAL_SNOW) * share;
    const water = Math.max(0, rate) * share;
    let level = SNOW_LEVELS[SNOW_LEVELS.length - 1][1];
    for (let index = 1; index < SNOW_LEVELS.length; index++) {
        const [rate0, level0] = SNOW_LEVELS[index - 1];
        const [rate1, level1] = SNOW_LEVELS[index];
        if (water <= rate1) {
            level = level0 + ((level1 - level0) * (water - rate0)) / (rate1 - rate0);
            break;
        }
    }
    return storm ? Math.max(STORM_SNOW * share, level) : level;
}

/** What falls as snow: how hard (snowLevel, times the personal amount) and which kinds (flakeMix). */
export interface SnowFall {
    level: number;
    mix: readonly number[];
}

const DEG = Math.PI / 180;
/**
 * The wind a flake falling a few metres above the ground feels, for the wind given at 10 m: the logarithmic profile
 * over open grass (roughness 0.03 m, WMO-No. 8) gives ln(3/0.03) / ln(10/0.03), about 0.8, at 3 m.
 */
const NEAR_GROUND_WIND = Math.log(3 / 0.03) / Math.log(10 / 0.03);
/** A wind of unknown direction comes from the north-west, like the clouds; of unknown speed, a light breeze. */
const USUAL_WIND_FROM = 315;
const USUAL_WIND_KMH = 10;

/**
 * How fast the air carries the flakes on the map, map pixels a second (x east, y south): blown away from `windFrom`
 * (degrees, 0 north, 90 east) at the speed of the wind near the ground, both parts of it like the clouds (a wind from
 * the south carries the snow up the screen). A flake is light: within a tenth of a second it goes with the air.
 * `lean` is the personal setting of the rain (0 to 2).
 */
export function groundWind(windFrom: number | undefined, windSpeed: number | undefined, lean = 1): Vector {
    const from = windFrom === undefined || !Number.isFinite(windFrom) ? USUAL_WIND_FROM : windFrom;
    const kmh = windSpeed === undefined || !Number.isFinite(windSpeed) ? USUAL_WIND_KMH : Math.max(0, windSpeed);
    const speed = (kmh / 3.6) * NEAR_GROUND_WIND * PX_PER_METRE * Math.max(0, lean);
    return { x: -Math.sin(from * DEG) * speed, y: Math.cos(from * DEG) * speed };
}

/** Where the air has carried the snow (integrated wind, SkyDrift) and how fast it goes now, map pixels. */
export interface SnowAir {
    shift: Vector;
    velocity: Vector;
}

export interface Snowflake {
    x: number;
    y: number;
    /** Its shape, FLAKE_SHAPES. */
    size: number;
    alpha: number;
    /** Which kind (FLAKE_KINDS) and plane (0 far, 1 near) it is, its cell in the air and which of its falls. */
    kind: number;
    plane: number;
    column: number;
    row: number;
    cycle: number;
    /** Seconds since it appeared; it lies on the ground once its fall is over. */
    age: number;
    lying: boolean;
}

interface SnowPlane {
    /** Screen speed for the speed of a flake: the near ones pass faster, the far ones slower. */
    parallax: number;
    /** Share of the flakes of a kind in this plane. */
    share: number;
    alpha: number;
}

const SNOW_PLANES: readonly SnowPlane[] = [
    { parallax: 0.8, share: 0.75, alpha: 0.7 },
    { parallax: 1.25, share: 0.25, alpha: 0.95 },
];

/** A flake falls this long (seconds, its own between them), so from 9 to 15 m at 1 m/s, then lies a moment. */
const FALL_MIN_S = 9;
const FALL_SPAN_S = 6;
const LIE_S = 0.8;
const SMALLEST_CELL = 8;

/**
 * Side of the cells of a kind and plane for this view: a power of two, so a small scroll or zoom keeps the grid, no
 * larger than the cell holding one flake of `flakes` in the view (snowflakes then shows that share of its cells).
 */
export function snowCell(view: WeatherView, flakes: number): number {
    const wanted = Math.sqrt((view.width * view.height) / Math.max(1, flakes));
    return Math.max(SMALLEST_CELL, 2 ** Math.floor(Math.log2(Math.max(1, wanted))));
}

/**
 * The cells of a kind of flakes in a plane read for the view: a grid fixed to the air, which the wind carries and the
 * flakes fall through at their speed (snowPlanes). `copies` flakes are looked at in each (copyShown).
 */
export interface SnowPlaneCells {
    kind: number;
    plane: number;
    cell: number;
    firstColumn: number;
    firstRow: number;
    columns: number;
    rows: number;
    copies: number;
    /** The share of its cells showing a flake, for a local factor of 1. */
    amount: number;
    /** How far the cells moved with the air and the fall since the start of the clock, and how fast now, map pixels. */
    shiftX: number;
    shiftY: number;
    speedX: number;
    speedY: number;
}

/** The local factor of the snow is never over this (rainUnderCloud, at most 1.4): the cells over it are left out. */
const LOCAL_MOST = 1.5;

/**
 * The kinds and planes of a snow over the view, `copies` flakes a cell at most (cellCopies). Each kind and plane is a
 * grid of cells fixed to the air, which the wind carries (`air.shift`) and the flakes fall through at their speed: a
 * flake goes with the air the whole time, so it never jumps when the wind, the cold or the rate changes, and nothing
 * but the view says which cells are read, whatever the wind. `seconds`: the clock of the fall (epoch / 1000, 0 when
 * nothing moves).
 */
export function snowPlanes(
    view: WeatherView,
    fall: SnowFall,
    air: SnowAir,
    seconds: number,
    local: boolean,
    still: boolean,
    copies: number,
): SnowPlaneCells[] {
    const planes: SnowPlaneCells[] = [];
    if (!(fall.level > 0)) return planes;
    FLAKE_KINDS.forEach((kind, kindIndex) => {
        const share = fall.level * (fall.mix[kindIndex] ?? 0);
        if (!(share > 0)) return;
        const fallPx = kind.fallSpeed * PX_PER_METRE;
        SNOW_PLANES.forEach((plane, planeIndex) => {
            const most = flakeCapacity(kind) * FLAKES_PER_CAPACITY * plane.share;
            const cell = snowCell(view, most);
            // The cells are smaller than a flake each at the heaviest fall: only that share of them ever shows one.
            const amount = (share * cell * cell * most) / Math.max(1, view.width * view.height);
            // The cells of this plane moved with the air and by the fall of its flakes since the start of the clock.
            const shiftX = plane.parallax * air.shift.x;
            const shiftY = plane.parallax * (air.shift.y + fallPx * seconds);
            const speedX = still ? 0 : plane.parallax * air.velocity.x;
            const speedY = still ? 0 : plane.parallax * (air.velocity.y + fallPx);
            // A lying flake stays where it landed while its cell goes on: read the cells it may have come from.
            const margin = kind.flutterPx + 2;
            const left = Math.min(view.x, view.x + speedX * LIE_S) - margin - shiftX;
            const right = Math.max(view.x + view.width, view.x + view.width + speedX * LIE_S) + margin - shiftX;
            const top = Math.min(view.y, view.y + speedY * LIE_S) - margin - shiftY;
            const bottom = Math.max(view.y + view.height, view.y + view.height + speedY * LIE_S) + margin - shiftY;
            const firstColumn = Math.floor(left / cell);
            const firstRow = Math.floor(top / cell);
            const looked = shownCopiesBound(copies, amount * (local ? LOCAL_MOST : 1));
            if (looked <= 0) return;
            planes.push({
                kind: kindIndex,
                plane: planeIndex,
                cell,
                firstColumn,
                firstRow,
                columns: Math.floor(right / cell) - firstColumn + 1,
                rows: Math.floor(bottom / cell) - firstRow + 1,
                copies: looked,
                amount,
                shiftX,
                shiftY,
                speedX,
                speedY,
            });
        });
    });
    return planes;
}

/** The salt of the hashes of a kind and plane of flakes, and of a copy of its cells. */
export function snowSalt(kind: number, plane: number, copy: number): number {
    return kind * 10 + plane + copy * COPY_SALT;
}

/**
 * The flake `copy` of a cell of a plane of snowPlanes at `seconds` (fallSeconds; 0 when nothing moves), `copies` the
 * most a cell holds: undefined when it does not show or is out of the view. Each cell lets one flake fall at a time,
 * for 9 to 15 s, which then lies on the ground a moment where it landed; the next one appears elsewhere in the cell.
 * `local` (1 the same) makes the snow thicker under a cloud, read where the flake appeared. What PrecipitationLayer
 * works out on the graphics card.
 */
export function snowflakeAt(
    plane: SnowPlaneCells,
    column: number,
    row: number,
    copy: number,
    seconds: number,
    view: WeatherView,
    copies: number,
    still: boolean,
    local?: (x: number, y: number) => number,
): Snowflake | undefined {
    const kind = FLAKE_KINDS[plane.kind];
    const salt = snowSalt(plane.kind, plane.plane, copy);
    const pick = fallHash(column, row, 101 + salt);
    // Never shown, even under the thickest cloud (rainUnderCloud: at most 1.4).
    if (!copyShown(copy, copies, plane.amount * (local ? LOCAL_MOST : 1), pick)) return undefined;
    // Its own hashes for the length of its falls, the moment they start and how it sways: apart, so that the last
    // digits of one (the graphics card rounds them its own way) do not move the others.
    const own = fallHash(column, row, 131 + salt);
    const falls = FALL_MIN_S + FALL_SPAN_S * own;
    const period = falls + LIE_S;
    const clock = seconds + fallHash(column, row, 137 + salt) * period;
    const turn = Math.floor(clock / period);
    const age = clock - turn * period;
    const lying = age >= falls;
    // Where the parcel of air it fell from is now, and where it lands (or landed): the air goes on carrying the parcel
    // at its speed, the flake falls through it, then lies where it landed.
    const { cell, speedX, speedY } = plane;
    const anchorX = (column + fallHash(column + turn, row, 191 + salt)) * cell + plane.shiftX;
    const anchorY = (row + fallHash(column, row + turn, 211 + salt)) * cell + plane.shiftY;
    const { x, y } = fallingFlake({
        landX: anchorX + speedX * (falls - age),
        landY: anchorY + speedY * (falls - age),
        descentX: speedX * falls,
        descentY: speedY * falls,
        fall: age / falls,
        swayPx: kind.flutterPx,
        sways: (0.35 + 0.4 * fallHash(column, row, 139 + salt)) * falls,
        phase: fallHash(column, row, 149 + salt),
    });
    if (x < view.x || x > view.x + view.width || y < view.y || y > view.y + view.height) return undefined;
    // Where it appeared: a flake shows or not for its whole fall.
    if (local && !copyShown(copy, copies, plane.amount * local(anchorX - speedX * age, anchorY - speedY * age), pick)) {
        return undefined;
    }
    const fadeIn = still ? 1 : flakeFadeIn(age);
    const fadeOut = lying ? 1 - (age - falls) / LIE_S : 1;
    return {
        x,
        y,
        size: kind.sizes[plane.plane],
        alpha: SNOW_PLANES[plane.plane].alpha * fadeIn * fadeOut,
        kind: plane.kind,
        plane: plane.plane,
        column,
        row,
        cycle: turn,
        age,
        lying,
    };
}

/** The opacity of the flakes of a plane (0 far, 1 near), for the graphics card. */
export function snowPlaneAlpha(plane: number): number {
    return SNOW_PLANES[plane].alpha;
}

/**
 * The flakes of a snow over the view (snowPlanes, snowflakeAt). `local` (1 the same) makes the snow thicker under a
 * cloud. `still` (reduced motion): the flakes stand still. `copies` (cellCopies): the most flakes each cell holds, 1
 * for the snow of the first version.
 */
export function snowflakes(
    epoch: number,
    view: WeatherView,
    fall: SnowFall,
    air: SnowAir,
    local?: (x: number, y: number) => number,
    still = false,
    copies = 1,
): Snowflake[] {
    const flakes: Snowflake[] = [];
    // The grid moves with the whole time, the clock of each flake goes round with fallSeconds.
    const planes = snowPlanes(view, fall, air, still ? 0 : epoch / 1000, local !== undefined, still, copies);
    const seconds = still ? 0 : fallSeconds(epoch);
    for (const plane of planes) {
        for (let copy = 0; copy < plane.copies; copy++) {
            for (let row = plane.firstRow; row < plane.firstRow + plane.rows; row++) {
                for (let column = plane.firstColumn; column < plane.firstColumn + plane.columns; column++) {
                    const flake = snowflakeAt(plane, column, row, copy, seconds, view, copies, still, local);
                    if (flake) flakes.push(flake);
                }
            }
        }
    }
    return flakes;
}

/**
 * One flake on its way down, the same for the weather and the downpour (DownpourFall), each placing its own flakes:
 * it lands at (`landX`, `landY`) once `fall` (0 as it appears, 1 as it lands) reaches 1, having come down `descent`
 * (map pixels, its fall and the drift of the wind over it), swaying `swayPx` to each side `sways` times over its fall,
 * less and less as it nears the ground. From 1 on it lies where it landed.
 */
export interface FallingFlake {
    landX: number;
    landY: number;
    descentX: number;
    descentY: number;
    fall: number;
    swayPx: number;
    sways: number;
    /** Where its sway starts, 0 to 1: its own. */
    phase: number;
}

export function fallingFlake(flake: FallingFlake): { x: number; y: number } {
    const left = Math.max(0, 1 - flake.fall);
    if (left === 0) return { x: flake.landX, y: flake.landY };
    const sway = Math.sin((Math.min(1, flake.fall) * flake.sways + flake.phase) * 2 * Math.PI) * flake.swayPx * left;
    return { x: flake.landX - left * flake.descentX + sway, y: flake.landY - left * flake.descentY };
}

/** A flake fades in over this long as it comes out of the sky (seconds): that of the downpour, a sixth of its fall. */
const FADE_IN_S = 0.43;

/** How much of a flake shows this long after it appeared (seconds). */
export function flakeFadeIn(seconds: number): number {
    return Math.min(1, Math.max(0, seconds / FADE_IN_S));
}

/** A pixel of a flake: its place from the top left corner, its width and height, lit (0) or shaded (1). */
export type FlakeRect = readonly [dx: number, dy: number, width: number, height: number, tone: 0 | 1];

/**
 * The flakes in pixel art, by size (1 to 5 px), rounded blobs, centred on their place: lit from the top left like the clouds, a
 * shaded pixel at the bottom right that keeps them in sight over a white ground. No blur.
 */
export const FLAKE_SHAPES: readonly (readonly FlakeRect[])[] = [
    [],
    [[0, 0, 1, 1, 0]],
    [
        [0, 0, 2, 1, 0],
        [0, 1, 1, 1, 0],
        [1, 1, 1, 1, 1],
    ],
    [
        [0, 0, 2, 1, 0],
        [0, 1, 2, 1, 0],
        [2, 1, 1, 1, 1],
        [1, 2, 2, 1, 1],
    ],
    [
        [1, 0, 2, 1, 0],
        [0, 1, 4, 1, 0],
        [0, 2, 3, 1, 0],
        [3, 2, 1, 1, 1],
        [1, 3, 2, 1, 1],
    ],
    [
        [1, 0, 3, 1, 0],
        [0, 1, 5, 1, 0],
        [0, 2, 4, 1, 0],
        [0, 3, 3, 1, 0],
        [4, 2, 1, 1, 1],
        [3, 3, 2, 1, 1],
        [1, 4, 3, 1, 1],
    ],
];

/** The lit and the shaded colour of a flake by day; at night they darken to the blue-grey of the night (snowTones). */
export const FLAKE_LIGHT = 0xf6f9ff;
export const FLAKE_SHADE = 0x9aa8c0;
const FLAKE_LIGHT_NIGHT = 0xc6d0e2;
const FLAKE_SHADE_NIGHT = 0x67738c;
/** How much of its opacity a flake keeps at full night: lit only by what is left of the sky. */
const NIGHT_ALPHA = 0.85;

function mixColor(day: number, night: number, share: number): number {
    let color = 0;
    for (const shift of [16, 8, 0]) {
        const a = (day >> shift) & 0xff;
        const b = (night >> shift) & 0xff;
        color |= Math.round(a + (b - a) * share) << shift;
    }
    return color;
}

/**
 * The colours and the opacity factor of the flakes for how night it is (0 day, 1 night): white by day, blue-grey and
 * fainter at night, as the snow on the ground under the night veil. The lamps do not light them (a choice).
 */
export function snowTones(night: number): { light: number; shade: number; alpha: number } {
    const share = Math.min(1, Math.max(0, Number.isFinite(night) ? night : 0));
    return {
        light: mixColor(FLAKE_LIGHT, FLAKE_LIGHT_NIGHT, share),
        shade: mixColor(FLAKE_SHADE, FLAKE_SHADE_NIGHT, share),
        alpha: 1 - (1 - NIGHT_ALPHA) * share,
    };
}

/** What a flake is drawn on: the graphics of the weather or of a downpour. */
export interface FlakeCanvas {
    fillStyle(color: number, alpha?: number): unknown;
    fillRect(x: number, y: number, width: number, height: number): unknown;
}

/** One flake of this size at a place (map pixels), `pixel` map pixels a pixel of the flake (1 at usual zooms). */
export function drawFlake(
    canvas: FlakeCanvas,
    x: number,
    y: number,
    size: number,
    alpha: number,
    tones: { light: number; shade: number },
    pixel = 1,
): void {
    const shape = FLAKE_SHAPES[Math.max(1, Math.min(FLAKE_SHAPES.length - 1, Math.round(size)))];
    // Snapped to the pixel grid of the flake, centred on its place.
    const left = Math.round(x / pixel - size / 2) * pixel;
    const top = Math.round(y / pixel - size / 2) * pixel;
    for (const tone of [0, 1] as const) {
        let styled = false;
        for (const [dx, dy, width, height, rectTone] of shape) {
            if (rectTone !== tone) continue;
            if (!styled) canvas.fillStyle(tone === 0 ? tones.light : tones.shade, alpha);
            styled = true;
            canvas.fillRect(left + dx * pixel, top + dy * pixel, width * pixel, height * pixel);
        }
    }
}
