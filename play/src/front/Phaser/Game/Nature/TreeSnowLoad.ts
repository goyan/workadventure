import type { TreeBox } from "./TreeLeafFall";

/** What is left on a tree right after its snow fell: it is never quite bare while it snows. */
export const SNOW_MIN_LOAD = 0.15;
/** How long the snow takes to fall from the foliage to the ground. */
export const SNOW_DUMP_SECONDS = 0.9;
/** How long the puff of snow lasts on the ground. */
const PUFF_SECONDS = 0.4;
/** A tree reaches its threshold in 150 to 270 seconds. */
const SHORTEST_PERIOD = 150;
const LONGEST_PERIOD = 270;

/** How long a tree takes to load up to its threshold, in seconds: its own, from `phase` (0 to 1). */
export function snowCyclePeriod(phase: number): number {
    return SHORTEST_PERIOD + (LONGEST_PERIOD - SHORTEST_PERIOD) * ((phase * 7.31) % 1);
}

/**
 * Where a tree is in its snow cycle `seconds` into the server time: its load, from nearly bare up to the threshold (1)
 * where the snow falls off, and the seconds since it last fell. The same for everyone.
 */
export function treeSnowCycle(seconds: number, phase: number): { load: number; sinceDump: number } {
    if (!Number.isFinite(seconds)) return { load: SNOW_MIN_LOAD, sinceDump: Infinity };
    const period = snowCyclePeriod(phase);
    const turn = seconds / period + phase;
    const progress = turn - Math.floor(turn);
    return { load: SNOW_MIN_LOAD + (1 - SNOW_MIN_LOAD) * progress, sinceDump: progress * period };
}

/** The snow a tree carries, 0 to 1: its cycle, with no more snow than covers the map (`coverage`, 0 to 1). */
export function treeSnowLoad(coverage: number, cycleLoad: number): number {
    const covered = Number.isFinite(coverage) ? Math.max(0, Math.min(1, coverage)) : 0;
    return covered * cycleLoad;
}

/** A lump of snow in the air, or a bit of the puff it makes on the ground, in map pixels. */
export interface SnowClump {
    x: number;
    y: number;
    width: number;
    height: number;
    alpha: number;
}

/** The lumps of each side: where across the side (pixels, outwards), how late, how big. */
const LUMPS = [
    { out: 0, late: 0, width: 7, height: 5 },
    { out: 5, late: 0.12, width: 5, height: 4 },
    { out: -4, late: 0.22, width: 4, height: 3 },
];

/**
 * The snow falling off a tree `sinceDump` seconds after it reached its threshold: lumps on each side of the foliage,
 * faster and faster down to the foot of the tree, then a puff that spreads and fades. Nothing once it is over.
 */
export function snowClumps(sinceDump: number, box: TreeBox): SnowClump[] {
    if (!(sinceDump >= 0) || sinceDump > SNOW_DUMP_SECONDS + PUFF_SECONDS) return [];
    const middle = box.x + box.width / 2;
    const top = box.y + box.height * 0.4;
    const ground = box.y + box.height;
    const clumps: SnowClump[] = [];
    for (const side of [-1, 1]) {
        const edge = middle + side * box.width * 0.32;
        if (sinceDump <= SNOW_DUMP_SECONDS) {
            for (const lump of LUMPS) {
                const fallen = Math.max(0, Math.min(1, sinceDump / SNOW_DUMP_SECONDS - lump.late) / (1 - lump.late));
                // Gravity: slow at first, fast at the end.
                const drop = fallen * fallen;
                clumps.push({
                    x: Math.round(edge + side * (lump.out + 6 * fallen) - lump.width / 2),
                    y: Math.round(Math.min(ground - lump.height, top + (ground - lump.height - top) * drop)),
                    width: lump.width,
                    height: lump.height,
                    alpha: 1,
                });
            }
            continue;
        }
        const spread = (sinceDump - SNOW_DUMP_SECONDS) / PUFF_SECONDS;
        for (const bit of [-1, 0, 1]) {
            clumps.push({
                x: Math.round(edge + side * 6 + bit * (3 + 7 * spread) - 2),
                y: Math.round(ground - 3 - (bit === 0 ? 4 * spread : 2 * spread)),
                width: 3,
                height: 3,
                alpha: 0.9 * (1 - spread),
            });
        }
    }
    return clumps.filter((clump) => clump.alpha > 0);
}
