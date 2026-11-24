import { hash01 } from "../Autumn/LeafPalette";
import { COPY_SALT } from "./ParticleDensity";
import { RAIN_FALL_SPEEDS, rainCell, rainDropsExpected, rainRateOfLevel } from "./Rain";
import type { RainLocal, RainWind } from "./Rain";
import { FLAKE_KINDS, flakeCapacity, flakeFadeIn, FLAKES_PER_CAPACITY, PX_PER_METRE } from "./Snowfall";
import type { SnowFall } from "./Snowfall";
import type { WeatherView } from "./WeatherFrame";

/**
 * The rain and the snow seen from a camera above the map, in perspective (a personal setting, off by default): the
 * camera is a point over the middle of the screen, at the height that shows the screen under a field of view of
 * FIELD_DEGREES. A drop or a flake at a height z is drawn at c + (p - c) * H / (H - z), c the middle of the screen, p
 * the point of the ground under it, H the height of the camera: near the camera it is big, fast and far from the
 * middle; as it falls it shrinks and slides towards the middle (the nadir, where the verticals meet), and it reaches
 * the ground where it truly lands. Its streak, a vertical stretch of its fall, is drawn along the line to the middle.
 * Pure rules; WeatherManager draws them.
 */

/** The field of view of the camera across the screen, degrees: a usual lens. */
export const FIELD_DEGREES = 60;
/** The drops and flakes fall from this share of the height of the camera: drawn up to 1 / (1 - it) times bigger. */
export const TOP_SHARE = 0.8;
/**
 * A drop is drawn as the stretch it falls in this long (s): the streak the eye catches, its time of integration
 * (Bloch's law: about a tenth of a second); a drop of 3 mm leaves a streak of 80 cm, as rain is seen.
 */
export const EXPOSURE_S = 0.1;
/** The drops and flakes kept within the view of the camera at a height, on the mean over their fall: (1 - z/H)². */
export const SEEN_SHARE = (1 - (1 - TOP_SHARE) ** 3) / 3 / TOP_SHARE;

const HASH_WRAP = 4096;
const CYCLES = 100_000;
const wrap = (value: number): number => ((value % HASH_WRAP) + HASH_WRAP) % HASH_WRAP;

export interface PerspectiveCamera {
    /** The point of the map under the camera, map pixels. */
    x: number;
    y: number;
    /** Its height over the map, map pixels. */
    height: number;
}

/** The camera over the screen (the part of the map on the screen): over its middle, at the height of FIELD_DEGREES. */
export function perspectiveCamera(screen: WeatherView): PerspectiveCamera {
    return {
        x: screen.x + screen.width / 2,
        y: screen.y + screen.height / 2,
        height: screen.width / 2 / Math.tan((FIELD_DEGREES * Math.PI) / 360),
    };
}

/** Where a point of the air at a height z (map pixels) is drawn, and how many times bigger than on the ground. */
export function project(
    camera: PerspectiveCamera,
    x: number,
    y: number,
    z: number,
): { x: number; y: number; scale: number } {
    const scale = camera.height / Math.max(1e-6, camera.height - z);
    return { x: camera.x + (x - camera.x) * scale, y: camera.y + (y - camera.y) * scale, scale };
}

/**
 * The share of the drops of each size of the rain (RAIN_FALL_SPEEDS: 1.4, 3, 5 mm), by number, for a rate in mm an
 * hour: the distribution of Marshall and Palmer (J. Meteor. 5, 1948), N(D) = N0 exp(-Λ D), Λ = 4.1 R^-0.21 mm⁻¹,
 * counted over the sizes each stands for (0.5 to 2.2, 2.2 to 4, 4 to 6 mm). The big drops come with the downpours.
 */
const DROP_BINS: readonly (readonly [number, number])[] = [
    [0.5, 2.2],
    [2.2, 4],
    [4, 6],
];
export function dropShares(rate: number): number[] {
    const lambda = 4.1 * Math.max(0.1, rate) ** -0.21;
    const counts = DROP_BINS.map(([from, to]) => (Math.exp(-lambda * from) - Math.exp(-lambda * to)) / lambda);
    const total = counts.reduce((sum, count) => sum + count, 0);
    return counts.map((count) => count / total);
}

export interface PerspectiveDrop {
    /** The tail and the head of its streak as drawn, map pixels. */
    tailX: number;
    tailY: number;
    headX: number;
    headY: number;
    /** How many times bigger than on the ground it is drawn. */
    scale: number;
    /** Where it lands, map pixels. */
    landX: number;
    landY: number;
    /** 0: 1.4 mm, 1: 3 mm, 2: 5 mm. */
    size: number;
}

/**
 * Cells of each size of drop (1.4, 3, 5 mm) for one base cell of the rain, each way: enough for the share of that size
 * in a downpour (Marshall and Palmer: nearly all small), no more (every cell is looked at at every image).
 */
const DROP_SPLITS = [8, 2, 1];

/**
 * The drops of a rain of this intensity (0 to 1, Rain.rainIntensity) over the view, seen from the camera: as many on
 * the screen as the drops of the flat rain at the same intensity (rainDropsExpected), shared between the sizes by
 * Marshall and Palmer. Each falls at its terminal velocity from TOP_SHARE of the height of the camera, carried by the
 * air (`shift`: how far the air has gone since the start of the clock, `wind`: its speed now, map px a second). The
 * same for everyone at the same server time. `copies` (the personal density, see densityPlan): that many drops in
 * each cell instead of one, the first being the drop of the usual rain.
 */
export function perspectiveDrops(
    epoch: number,
    view: WeatherView,
    camera: PerspectiveCamera,
    intensity: number,
    air: { shift: RainWind; wind: RainWind },
    local?: RainLocal,
    copies = 1,
): PerspectiveDrop[] {
    const drops: PerspectiveDrop[] = [];
    if (!(intensity > 0)) return drops;
    const time = epoch / 1000;
    const wanted = rainDropsExpected(view, intensity);
    const shares = dropShares(rainRateOfLevel(intensity));
    const top = TOP_SHARE * camera.height;
    shares.forEach((share, size) => {
        const cell = rainCell(view) / DROP_SPLITS[size];
        const cells = (view.width * view.height) / (cell * cell);
        const shown = (wanted * share) / (cells * SEEN_SHARE);
        if (!(shown > 0)) return;
        const fallPx = RAIN_FALL_SPEEDS[size] * PX_PER_METRE;
        // The cells move with the air: the drops of the cells over the view are those seen.
        const left = view.x - air.shift.x;
        const upper = view.y - air.shift.y;
        for (let copy = 0; copy < copies; copy++) {
            const salt = copy * COPY_SALT;
            for (let row = Math.floor(upper / cell); row <= Math.floor((upper + view.height) / cell); row++) {
                const hashRow = wrap(row);
                for (let column = Math.floor(left / cell); column <= Math.floor((left + view.width) / cell); column++) {
                    const hashColumn = wrap(column);
                    const pick = hash01(hashColumn, hashRow, 301 + size + salt);
                    if (pick >= shown * (local ? 1.5 : 1)) continue;
                    // Each drop a little faster or slower than its size: no curtain falling as one.
                    const speed = fallPx * (0.9 + 0.2 * hash01(hashColumn, hashRow, 311 + size + salt));
                    const falls = hash01(hashColumn, hashRow, 321 + size + salt) + (time * speed) / top;
                    const cycle = Math.floor(falls) % CYCLES;
                    const z = top * (1 - (falls - Math.floor(falls)));
                    const x = (column + hash01(hashColumn + cycle, hashRow, 331 + size + salt)) * cell + air.shift.x;
                    const y = (row + hash01(hashColumn, hashRow + cycle, 341 + size + salt)) * cell + air.shift.y;
                    // Where it lands: the air carries it on until then.
                    const landX = x + (air.wind.x * z) / speed;
                    const landY = y + (air.wind.y * z) / speed;
                    if (local && pick >= shown * local(landX, landY)) continue;
                    const head = project(camera, x, y, z);
                    if (
                        head.x < view.x ||
                        head.x > view.x + view.width ||
                        head.y < view.y ||
                        head.y > view.y + view.height
                    ) {
                        continue;
                    }
                    // Its streak: where it was EXPOSURE_S before, higher and upwind.
                    const tail = project(
                        camera,
                        x - air.wind.x * EXPOSURE_S,
                        y - air.wind.y * EXPOSURE_S,
                        Math.min(camera.height * 0.99, z + speed * EXPOSURE_S),
                    );
                    drops.push({
                        tailX: tail.x,
                        tailY: tail.y,
                        headX: head.x,
                        headY: head.y,
                        scale: head.scale,
                        landX,
                        landY,
                        size,
                    });
                }
            }
        }
    });
    return drops;
}

export interface PerspectiveFlake {
    /** Where it is drawn, map pixels, and how many times bigger than on the ground. */
    x: number;
    y: number;
    scale: number;
    /** Where it will land (map pixels): it shows only over the outdoors. */
    landX: number;
    landY: number;
    /** Its kind (FLAKE_KINDS) and how opaque it is (fading in as it appears at the top). */
    kind: number;
    alpha: number;
}

/** A flake goes round its swirl (the air it falls through turning) in this many seconds, its own between them. */
const SWIRL_MIN_S = 2;
const SWIRL_SPAN_S = 2.5;

/**
 * The flakes of a snow over the view, seen from the camera: of the kinds the air makes (fall.mix), as many on the
 * screen as the flat snow shows at the same level (FLAKES_PER_CAPACITY), falling at their terminal velocity (about
 * 1 m/s: some 25 s from the top) carried by the air (`air`, as perspectiveDrops), each swirling round as it falls.
 * `copies` (the personal density, see densityPlan): that many flakes in each cell instead of one.
 */
export function perspectiveFlakes(
    epoch: number,
    view: WeatherView,
    camera: PerspectiveCamera,
    fall: SnowFall,
    air: { shift: RainWind; velocity: RainWind },
    local?: RainLocal,
    still = false,
    copies = 1,
): PerspectiveFlake[] {
    const flakes: PerspectiveFlake[] = [];
    if (!(fall.level > 0)) return flakes;
    const time = still ? 0 : epoch / 1000;
    const top = TOP_SHARE * camera.height;
    const area = view.width * view.height;
    FLAKE_KINDS.forEach((kind, kindIndex) => {
        const wanted = fall.level * (fall.mix[kindIndex] ?? 0) * flakeCapacity(kind) * FLAKES_PER_CAPACITY;
        if (!(wanted > 0)) return;
        // Cells enough for the heaviest fall of this kind alone, a power of two (a zoom keeps the same grid).
        const most = (flakeCapacity(kind) * FLAKES_PER_CAPACITY) / SEEN_SHARE;
        const cell = 2 ** Math.floor(Math.log2(Math.max(2, Math.sqrt(area / most))));
        const shown = (wanted * cell * cell) / (area * SEEN_SHARE);
        const fallPx = kind.fallSpeed * PX_PER_METRE;
        const left = view.x - air.shift.x;
        const upper = view.y - air.shift.y;
        for (let copy = 0; copy < copies; copy++) {
            const salt = copy * COPY_SALT;
            for (let row = Math.floor(upper / cell); row <= Math.floor((upper + view.height) / cell); row++) {
                const hashRow = wrap(row);
                for (let column = Math.floor(left / cell); column <= Math.floor((left + view.width) / cell); column++) {
                    const hashColumn = wrap(column);
                    const pick = hash01(hashColumn, hashRow, 401 + kindIndex + salt);
                    if (pick >= shown * (local ? 1.5 : 1)) continue;
                    const own = hash01(hashColumn, hashRow, 411 + kindIndex + salt);
                    const speed = fallPx * (0.85 + 0.3 * own);
                    const fallS = top / speed;
                    const falls = ((own * 37.3) % 1) + time / fallS;
                    const cycle = Math.floor(falls) % CYCLES;
                    const age = (falls - Math.floor(falls)) * fallS;
                    const z = top - speed * age;
                    // The swirl: round and round, as wide as the flake flutters, its own pace and way round.
                    const turnS = SWIRL_MIN_S + SWIRL_SPAN_S * ((own * 13.7) % 1);
                    const way = (own * 5.3) % 1 < 0.5 ? 1 : -1;
                    const angle = 2 * Math.PI * (way * (age / turnS) + ((own * 71.9) % 1));
                    const radius = 2 * kind.flutterPx;
                    const x =
                        (column + hash01(hashColumn + cycle, hashRow, 421 + kindIndex + salt)) * cell + air.shift.x;
                    const y = (row + hash01(hashColumn, hashRow + cycle, 431 + kindIndex + salt)) * cell + air.shift.y;
                    const landX = x + (air.velocity.x * z) / speed;
                    const landY = y + (air.velocity.y * z) / speed;
                    if (local && pick >= shown * local(landX, landY)) continue;
                    const seen = project(camera, x + radius * Math.cos(angle), y + radius * Math.sin(angle), z);
                    if (
                        seen.x < view.x ||
                        seen.x > view.x + view.width ||
                        seen.y < view.y ||
                        seen.y > view.y + view.height
                    ) {
                        continue;
                    }
                    flakes.push({
                        x: seen.x,
                        y: seen.y,
                        scale: seen.scale,
                        landX,
                        landY,
                        kind: kindIndex,
                        alpha: still ? 1 : flakeFadeIn(age),
                    });
                }
            }
        }
    });
    return flakes;
}
