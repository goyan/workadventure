/** A dance floor is a grid of square tiles, one per tile of the map. */
export const DANCE_FLOOR_TILE_PX = 32;

/** The colours a tile lights up in: cyan, violet, magenta. */
export const DANCE_FLOOR_COLOURS = [0x00f0ff, 0x8a3dff, 0xff2bd6] as const;

export interface FloorGrid {
    cols: number;
    rows: number;
}

/** What a pattern asks of one tile: how lit it is (0 to 1), and in which of the colours. */
export interface FloorTile {
    level: number;
    colour: number;
}

/**
 * A pattern: what each tile does at a phase. The phase is a count of steps (a beat of the music, or a fraction of a
 * second without music) and goes on for ever; nothing is random, the same phase gives the same floor to every player.
 */
export interface FloorPattern {
    name: string;
    at(col: number, row: number, grid: FloorGrid, phase: number): FloorTile;
}

/** The grid of a floor of this size in pixels: whole tiles, as close to 32 px as the size allows. */
export function danceFloorGrid(size: { width: number; height: number }): FloorGrid {
    return {
        cols: Math.max(1, Math.round(size.width / DANCE_FLOOR_TILE_PX)),
        rows: Math.max(1, Math.round(size.height / DANCE_FLOOR_TILE_PX)),
    };
}

/** A number of its own for each floor, from the id of its object: two floors do not move alike. */
export function danceFloorSeed(id: string): number {
    let seed = 0;
    for (let index = 0; index < id.length; index++) {
        seed = (Math.imul(seed, 31) + id.charCodeAt(index)) | 0;
    }
    return seed >>> 0;
}

/** A whole number that looks random, and is always the same for the same three. */
export function floorHash(a: number, b: number, c = 0): number {
    let hash = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1274126177)) | 0;
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
    return (hash ^ (hash >>> 16)) >>> 0;
}

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}

function mod(value: number, period: number): number {
    return ((value % period) + period) % period;
}

/**
 * A band `width` wide that comes back every `period`: 1 inside, falling to 0 over one unit outside. `position` is
 * where the tile stands along the band's way; the band is centred on 0.
 */
function band(position: number, period: number, width: number): number {
    const distance = Math.abs(mod(position + period / 2, period) - period / 2);
    return clamp01(width / 2 + 0.5 - distance);
}

/** Which band a position is in: its colour changes from one band to the next. */
function bandIndex(position: number, period: number): number {
    return mod(Math.floor((position + period / 2) / period), DANCE_FLOOR_COLOURS.length);
}

/** Diagonal bands that roll across the floor, their front waving. */
const waves: FloorPattern = {
    name: "waves",
    at(col, row, _grid, phase) {
        const position = col + row + 0.5 * Math.sin(row * 0.8 + phase * 0.35) - phase;
        return { level: band(position, 6, 2.6), colour: bandIndex(position, 6) };
    },
};

/** Blocks of two by two tiles, one out of two lit, swapping every two steps. */
const checker: FloorPattern = {
    name: "checker",
    at(col, row, _grid, phase) {
        const blockCol = Math.floor(col / 2);
        const blockRow = Math.floor(row / 2);
        const turn = Math.floor(phase / 2);
        return {
            level: mod(blockCol + blockRow + turn, 2) === 0 ? 1 : 0,
            colour: mod(blockCol - blockRow + Math.floor(turn / 2), DANCE_FLOOR_COLOURS.length),
        };
    },
};

/** Three arms turning around the centre. */
const spiral: FloorPattern = {
    name: "spiral",
    at(col, row, grid, phase) {
        const dx = col - (grid.cols - 1) / 2;
        const dy = row - (grid.rows - 1) / 2;
        const radius = Math.hypot(dx, dy);
        // In turns of an arm: 3 arms, wound as they go out, turning with the phase.
        const position = (Math.atan2(dy, dx) / (2 * Math.PI)) * 3 + radius * 0.22 - phase * 0.18;
        // The width of an arm is counted in tiles at this distance of the centre: soft edges near it, sharp far away.
        const tilesPerArm = Math.max(1, (2 * Math.PI * Math.max(radius, 0.7)) / 3);
        const distance = Math.abs(mod(position + 0.5, 1) - 0.5) * tilesPerArm;
        return {
            level: clamp01(0.19 * tilesPerArm + 0.5 - distance),
            colour: mod(Math.floor(position + 0.5), DANCE_FLOOR_COLOURS.length),
        };
    },
};

/** Rings that leave the centre one after the other. */
const ripples: FloorPattern = {
    name: "ripples",
    at(col, row, grid, phase) {
        const dx = col - (grid.cols - 1) / 2;
        const dy = row - (grid.rows - 1) / 2;
        const farthest = Math.hypot((grid.cols - 1) / 2, (grid.rows - 1) / 2);
        // A small floor has room for small rings only: there is always one on it, and never one that covers it.
        const period = Math.min(6, Math.max(2.6, farthest));
        const position = Math.hypot(dx, dy) - phase * 0.5;
        return { level: band(position, period, period * 0.5), colour: bandIndex(position, period) };
    },
};

const DROP_LENGTH = 3;
const DROP_LEVELS = [1, 0.75, 0.4];

/** Drops that fall down the columns, a bright head and a fading tail. */
const rain: FloorPattern = {
    name: "rain",
    at(col, row, grid, phase) {
        // A drop is on the floor during the whole of its fall: its head enters at the top as its tail leaves.
        const fall = grid.rows + DROP_LENGTH - 1;
        const time = phase + (floorHash(col, 11) % fall);
        const drop = Math.floor(time / fall);
        // One column out of three always has a drop; the others, more than half of the time.
        const falling = col % 3 === 0 || floorHash(col, drop, 5) % 5 < 3;
        const behind = Math.floor(mod(time, fall)) - row;
        return {
            level: falling && behind >= 0 && behind < DROP_LENGTH ? DROP_LEVELS[behind] : 0,
            colour: floorHash(col, drop, 3) % DANCE_FLOOR_COLOURS.length,
        };
    },
};

/** Straight bands that cross the floor: from the left, from the top, from the right, from the bottom. */
const sweep: FloorPattern = {
    name: "sweep",
    at(col, row, _grid, phase) {
        const way = mod(Math.floor(phase / 16), 4);
        const along = way % 2 === 0 ? col : row;
        const position = way < 2 ? along - phase : along + phase;
        return { level: band(position, 5, 2.4), colour: bandIndex(position, 5) };
    },
};

/** Shapes of a group, in a cell of three tiles by two: a bar of two, a bar of three, a column, a square. */
const GROUP_SHAPES: readonly (readonly [number, number])[][] = [
    [
        [0, 0],
        [1, 0],
    ],
    [
        [0, 1],
        [1, 1],
        [2, 1],
    ],
    [
        [1, 0],
        [1, 1],
    ],
    [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
    ],
    [
        [1, 0],
        [2, 0],
        [2, 1],
    ],
];
const GROUP_LIFE = 4;

/** Groups of two to four tiles that light up here and there, each for a few steps. */
const groups: FloorPattern = {
    name: "groups",
    at(col, row, _grid, phase) {
        const cellCol = Math.floor(col / 3);
        const cellRow = Math.floor(row / 2);
        // Each cell changes at its own moment: the floor never changes all at once.
        const life = Math.floor((phase + (floorHash(cellCol, cellRow, 17) % GROUP_LIFE)) / GROUP_LIFE);
        // Some cells are lit by turns, so that the floor is never dark; the others, about half of the time.
        const turn = mod(cellCol + 2 * cellRow + Math.floor(phase / GROUP_LIFE), 3) === 0;
        const lit = turn || floorHash(cellCol, cellRow, life) % 100 < 45;
        const shape = GROUP_SHAPES[floorHash(cellCol, cellRow, life + 101) % GROUP_SHAPES.length];
        const inShape = shape.some(([x, y]) => x === col - cellCol * 3 && y === row - cellRow * 2);
        return {
            level: lit && inShape ? 1 : 0,
            colour: floorHash(cellCol, cellRow, life + 211) % DANCE_FLOOR_COLOURS.length,
        };
    },
};

export const DANCE_FLOOR_PATTERNS: readonly FloorPattern[] = [groups, waves, ripples, checker, rain, spiral, sweep];
