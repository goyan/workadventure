import { describe, expect, it } from "vitest";
import { affordPass, depthsPass, fluxPass, scalePass } from "../src/Terrain/WaterKernel";
import type { InertiaMove } from "../src/Terrain/WaterKernel";

/** A grid of 41 by 29 cells: a rough relief, water in most cells, flows and speeds left by moves before. */
function move(): InertiaMove {
    const width = 41;
    const height = 29;
    const cells = width * height;
    let seed = 20261123;
    const random = (): number => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
    const floats = (make: () => number): Float32Array => Float32Array.from({ length: cells }, make);
    return {
        width,
        height,
        depth: floats(() => (random() < 0.25 ? 0 : random() * 60)),
        ground: floats(() => Math.round(random() * 40 - 30)),
        spill: floats(() => 5),
        rough: floats(() => 0.2 + random()),
        east: floats(() => random() * 8 - 4),
        south: floats(() => random() * 8 - 4),
        afford: floats(() => 1),
        speedEast: floats(() => random() - 0.5),
        speedSouth: floats(() => random() - 0.5),
        nextSpeedEast: floats(() => 0),
        nextSpeedSouth: floats(() => 0),
        closed: Uint8Array.from({ length: cells }, () => (random() < 0.05 ? 1 + Math.floor(random() * 15) : 0)),
        hollow: Uint8Array.from({ length: cells }, () => (random() < 0.7 ? 1 : 0)),
        powers: Float32Array.from({ length: 513 }, (_, eighths) => Math.pow(Math.max(1, eighths) / 8, -4 / 3)),
        dt: 0.0333,
        swiftest: 15,
        pull: 0.0333 * 0.6,
        pulled: 180,
        edgeShare: 0.2 / 3,
        top: 256,
        roughness: 1,
        damping: 0.02,
        breaking: 4,
        carried: 1,
        compiled: undefined,
    };
}

const ARRAYS = ["depth", "east", "south", "afford", "nextSpeedEast", "nextSpeedSouth"] as const;

describe("the passes of a move of the water with inertia", () => {
    it("give the same figures over the whole grid and over bands of rows, the water lost included", () => {
        const whole = move();
        const banded = move();
        const bands = [0, 9, 10, 23, whole.height];
        const inBands = (pass: (rowFrom: number, rowTo: number) => void): void => {
            // Not in their order: a thread may be done with its rows before another starts.
            for (const band of [2, 0, 3, 1]) pass(bands[band], bands[band + 1]);
        };
        const same = (): void => {
            for (const name of ARRAYS) expect(Array.from(banded[name]), name).toStrictEqual(Array.from(whole[name]));
        };
        fluxPass(whole, 0, whole.height);
        inBands((from, to) => fluxPass(banded, from, to));
        same();
        affordPass(whole, 0, whole.height);
        inBands((from, to) => affordPass(banded, from, to));
        same();
        const moved = scalePass(whole, 0, whole.height);
        let movedInBands = false;
        inBands((from, to) => {
            if (scalePass(banded, from, to)) movedInBands = true;
        });
        expect(movedInBands).toBe(moved);
        same();
        const rowLost = new Float64Array(whole.height);
        const rowLostInBands = new Float64Array(whole.height).fill(NaN);
        const lost = depthsPass(whole, 0, whole.height, rowLost);
        let lostInBands = false;
        inBands((from, to) => {
            if (depthsPass(banded, from, to, rowLostInBands)) lostInBands = true;
        });
        expect(lostInBands).toBe(lost);
        same();
        // Each row has its own sum: whoever computed it, the rows add up to the same water lost.
        expect(Array.from(rowLostInBands)).toStrictEqual(Array.from(rowLost));
        expect(rowLost.some((row) => row > 0)).toBe(true);
    });
});
