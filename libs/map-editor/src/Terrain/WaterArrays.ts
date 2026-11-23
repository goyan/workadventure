/**
 * Where a grid of water (WaterGrid) keeps the arrays the passes of its moves read and write (WaterKernel): its
 * depths, its ground, its flows, its speeds. In ordinary memory unless told otherwise; in a memory several threads
 * share when its passes are to be shared between them (WaterBands); in the memory of a compiled kernel when one
 * computes them. One way to allocate for all: the grid asks, and does not know where its arrays live.
 */
export interface WaterArrays {
    /** An array of `length` floats, all zero. */
    floats(length: number): Float32Array;
    /** An array of `length` bytes, all zero. */
    bytes(length: number): Uint8Array;
    /** An array of `length` doubles, all zero. */
    doubles(length: number): Float64Array;
    /** Whether other threads may read and write these arrays. */
    readonly shared: boolean;
}

/** The arrays of a grid in ordinary memory: what a grid does when it is told nothing. */
export const ordinaryWaterArrays: WaterArrays = {
    floats: (length) => new Float32Array(length),
    bytes: (length) => new Uint8Array(length),
    doubles: (length) => new Float64Array(length),
    shared: false,
};

/** The arrays of a grid in a memory threads share, each array in a memory of its own. */
export const sharedWaterArrays: WaterArrays = {
    floats: (length) => new Float32Array(new SharedArrayBuffer(4 * length)),
    bytes: (length) => new Uint8Array(new SharedArrayBuffer(length)),
    doubles: (length) => new Float64Array(new SharedArrayBuffer(8 * length)),
    shared: true,
};

/**
 * What gives a grid the place of its arrays, once its size is known: `cells` cells in `rows` rows. For a memory that
 * is sized once and never grows (that of a compiled kernel), which must know how much the grid will ask for before
 * its first array.
 */
export type WaterArraysMaker = (cells: number, rows: number) => WaterArrays;

/** A place for the arrays of a grid, or what makes one for its size. */
export type WaterArraysSource = WaterArrays | WaterArraysMaker;

/** The place of the arrays of a grid of `cells` cells in `rows` rows, from what it was given. */
export function waterArraysFor(source: WaterArraysSource, cells: number, rows: number): WaterArrays {
    return typeof source === "function" ? source(cells, rows) : source;
}

let usual: WaterArraysSource = ordinaryWaterArrays;

/** Where the grids made from now on, on this thread, keep their arrays, unless they are told another place. */
export function setWaterArrays(arrays: WaterArraysSource): void {
    usual = arrays;
}

export function waterArrays(): WaterArraysSource {
    return usual;
}
