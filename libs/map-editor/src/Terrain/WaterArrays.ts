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

let usual: WaterArrays | (() => WaterArrays) = ordinaryWaterArrays;

/**
 * Where the grids made from now on, on this thread, keep their arrays, unless they are told another place: one
 * place for all, or what makes a place for each grid (a compiled kernel has a memory for each grid, sized for it).
 */
export function setWaterArrays(arrays: WaterArrays | (() => WaterArrays)): void {
    usual = arrays;
}

export function waterArrays(): WaterArrays {
    return typeof usual === "function" ? usual() : usual;
}
