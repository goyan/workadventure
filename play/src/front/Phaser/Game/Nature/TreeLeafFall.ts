import { hash01, leafColor } from "../Autumn/LeafPalette";

/** The image of a tree on the map: its top left corner and its size. */
export interface TreeBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** A leaf falling from a tree, in map pixels. */
export interface TreeLeaf {
    x: number;
    y: number;
    color: number;
    /** It fades out on the ground. */
    alpha: number;
    /** 3×4 instead of 4×3: the leaf turns as it sways. */
    vertical: boolean;
}

/** How many leaves a tree drops at once at most. */
export const LEAVES_PER_TREE = 6;
/** Wind (km/h) from which a tree drops as many leaves as it ever does. */
const STRONGEST_WIND_KMH = 80;
/** Share of the leaves falling without any wind. */
const CALM_ACTIVITY = 0.15;
/** A leaf takes 2.5 to 4 seconds to reach the ground. */
const SHORTEST_FALL = 2.5;
const LONGEST_FALL = 4;
/** How far the strongest wind pushes a leaf during its fall, in pixels. */
const STORM_DRIFT = 28;
/** A leaf sways three pixels each way as it falls. */
const FLUTTER = 3;
/** Last share of the fall, during which the leaf fades out. */
const FADE_SHARE = 0.15;
const DEG = Math.PI / 180;
/** Keeps the numbers given to `hash01` small enough to stay exact on every computer. */
const CYCLE_WRAP = 100_000;

const windShare = (windKmh: number): number =>
    Math.max(0, Math.min(STRONGEST_WIND_KMH, Number.isFinite(windKmh) ? windKmh : 0)) / STRONGEST_WIND_KMH;

/** Share of its leaves a tree drops in a wind of `windKmh` km/h: a few in a calm, all of them in a storm. */
export function leafActivity(windKmh: number): number {
    return CALM_ACTIVITY + (1 - CALM_ACTIVITY) * windShare(windKmh);
}

/**
 * The leaves falling from a tree `seconds` into the server time. Each of its six leaves falls again and again in its
 * own time; the wind only decides which falls happen and how far they drift, never when: a leaf does not jump when the
 * wind changes. `windFrom` is where the wind comes from (degrees, 0 north), `seed` (0 to 1) the tree's own draw.
 */
export function treeLeaves(
    seconds: number,
    windKmh: number,
    windFrom: number | undefined,
    seed: number,
    box: TreeBox,
): TreeLeaf[] {
    if (!Number.isFinite(seconds)) return [];
    const tree = Math.floor(seed * 9973);
    const activity = leafActivity(windKmh);
    // Where the wind goes, left to right: a north-west wind without a real one, as the clouds.
    const push = (windFrom === undefined ? Math.SQRT1_2 : -Math.sin(windFrom * DEG)) * windShare(windKmh) * STORM_DRIFT;
    const leaves: TreeLeaf[] = [];
    for (let slot = 0; slot < LEAVES_PER_TREE; slot++) {
        const duration = SHORTEST_FALL + (LONGEST_FALL - SHORTEST_FALL) * hash01(tree, slot, 1);
        const turn = seconds / duration + hash01(tree, slot, 2);
        const fall = Math.floor(turn);
        const progress = turn - fall;
        const draw = (salt: number) => hash01((fall % CYCLE_WRAP) + tree, slot, salt);
        if (draw(3) >= activity) continue;
        const startY = box.y + box.height * (0.25 + 0.3 * draw(5));
        const endY = box.y + box.height - 2 - 6 * draw(6);
        const sway = Math.sin(2 * Math.PI * (2 * progress + draw(7)));
        leaves.push({
            x: box.x + box.width * (0.15 + 0.7 * draw(4)) + push * progress + FLUTTER * sway,
            y: startY + (endY - startY) * progress,
            color: leafColor(draw(8)),
            alpha: progress > 1 - FADE_SHARE ? (1 - progress) / FADE_SHARE : 1,
            vertical: sway > 0,
        });
    }
    return leaves;
}

/** How many leaves lie under a tree at the end of autumn. */
export const GROUND_LEAVES_PER_TREE = 40;

/** A leaf lying on the ground under a tree, in map pixels. */
export interface GroundLeaf {
    x: number;
    y: number;
    color: number;
    vertical: boolean;
}

/**
 * The leaves lying on the ground under a tree: `share` (0 to 1) of all it will ever drop, around its foot and as wide
 * as its foliage. A leaf on the ground stays where it is: more of them come, none moves.
 */
export function groundLeaves(seed: number, share: number, box: TreeBox): GroundLeaf[] {
    const tree = Math.floor(seed * 9973);
    const count = Math.round(GROUND_LEAVES_PER_TREE * Math.max(0, Math.min(1, Number.isFinite(share) ? share : 0)));
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height - 6;
    const radiusX = box.width / 2;
    const radiusY = Math.max(6, box.height * 0.14);
    const leaves: GroundLeaf[] = [];
    for (let index = 0; index < count; index++) {
        const turn = 2 * Math.PI * hash01(tree, index, 11);
        // The square root spreads them evenly over the patch instead of crowding its middle.
        const reach = Math.sqrt(hash01(tree, index, 12));
        leaves.push({
            x: Math.round(centerX + Math.cos(turn) * reach * radiusX),
            y: Math.round(centerY + Math.sin(turn) * reach * radiusY),
            color: leafColor(hash01(tree, index, 13)),
            vertical: hash01(tree, index, 14) < 0.5,
        });
    }
    return leaves;
}

const parisDay = new Intl.DateTimeFormat("en", { timeZone: "Europe/Paris", month: "numeric", day: "numeric" });
/** Days of September, October and November. */
const AUTUMN_DAYS = 91;

/**
 * How far into autumn the Paris date is, 0 on the first of September to 1 on the last of November: the leaves under
 * the trees pile up with it. Half way out of autumn, where only a personal autumn theme shows them.
 */
export function autumnProgress(serverDate: Date): number {
    if (!Number.isFinite(serverDate.getTime())) return 0.5;
    const parts = parisDay.formatToParts(serverDate);
    const month = Number(parts.find((part) => part.type === "month")?.value);
    const day = Number(parts.find((part) => part.type === "day")?.value);
    if (month < 9 || month > 11) return 0.5;
    const before = month === 9 ? 0 : month === 10 ? 30 : 61;
    return (before + day) / AUTUMN_DAYS;
}
