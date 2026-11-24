import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { cellKey, withHeights } from "../src/Terrain/TerrainGrid";
import { setWaterKernel, WaterGrid, waterKernel, waterKernelInUse, waterKernelNamed } from "../src/Terrain/WaterGrid";
import { stepInputOf } from "../src/Terrain/WaterInputs";
import { affordPass, depthsPass, fluxPass, scalePass } from "../src/Terrain/WaterKernel";
import type { InertiaMove } from "../src/Terrain/WaterKernel";
import { WasmWaterKernel } from "../src/Terrain/WaterKernelWasm";
import { WATER_KERNEL_SOURCE_SHA256 } from "../src/Terrain/WaterKernelWasm.generated";
import { DEFAULT_WATER_SETTINGS } from "../src/types";
import { tsunamiSea } from "../src/Catastrophe/Tsunami";

/**
 * The kernel of the water compiled to WebAssembly (kernel/water_kernel.c) against the passes written in TypeScript
 * (src/Terrain/WaterKernel.ts), which are the reference: the same figures, to the bit. The scenarios of a whole map
 * are in WaterFingerprints.test.ts, which plays them with this kernel too, alone and on bands of rows.
 */

/** A lake dug in a plain of 60 by 40 cells, with sloping shores. */
function lake(arrays?: WasmWaterKernel): WaterGrid {
    const heights = new Map<string, number>();
    for (let y = 8; y < 32; y++) {
        for (let x = 10; x < 50; x++)
            heights.set(cellKey(x, y), -Math.min(40, 5 * (Math.min(x - 10, y - 8, 49 - x, 31 - y) + 1)));
    }
    return new WaterGrid(
        withHeights(undefined, heights),
        { x: 0, y: 0, width: 60, height: 40 },
        undefined,
        undefined,
        undefined,
        arrays,
    );
}

const bytesOf = (array: Float32Array | Float64Array | Uint8Array): Uint8Array =>
    new Uint8Array(array.buffer, array.byteOffset, array.byteLength);

describe("the kernel of the water compiled to WebAssembly", () => {
    it("was built from the water_kernel.c of the repository: run kernel/build.sh after changing it", () => {
        // Run from libs/map-editor, or from play (whose checks run this test too).
        const path = ["kernel/water_kernel.c", "../libs/map-editor/kernel/water_kernel.c"].find((candidate) =>
            existsSync(candidate),
        );
        if (!path) throw new Error("water_kernel.c not found from " + process.cwd());
        expect(createHash("sha256").update(readFileSync(path)).digest("hex")).toBe(WATER_KERNEL_SOURCE_SHA256);
    });

    it("gives the same water on a map that goes faster than reality: several steps of its time in a step of the clock", () => {
        // A map sixty times faster, its water with inertia: three steps of its time at each step of the clock, with
        // the rain, the source and the sink sixty times as strong (the true acceleration of the water).
        const water = { ...DEFAULT_WATER_SETTINGS, speed: 60, inertia: true, precision: 4, maxSurface: 256 };
        const objects = [
            { cellX: 5, cellY: 5, litresPerMinute: 400, radiusCells: 1 },
            { cellX: 30, cellY: 20, litresPerMinute: -300, radiusCells: 3 },
        ];
        const grids = [lake(), lake(new WasmWaterKernel())];
        expect(grids.map((grid) => grid.kernelName())).toStrictEqual(["typescript", "wasm"]);
        for (const grid of grids) grid.rainOn(30, 20, 9, 20);
        for (let step = 0; step < 150; step++) {
            const input = stepInputOf(water, step < 60 ? 4 : 0, objects, 0.1);
            const tallies = grids.map((grid) => [grid.step(input), grid.step(input), grid.step(input)]);
            expect(tallies[1], `tallies of step ${step}`).toStrictEqual(tallies[0]);
            for (const name of ["depth", "flowEast", "flowSouth", "speedEast", "speedSouth"]) {
                const [one, other] = grids.map((grid) => bytesOf(Reflect.get(grid, name) as Float32Array));
                if (Buffer.compare(one, other) !== 0) expect.fail(`${name} differs after step ${step}`);
            }
        }
        expect(grids[0].totalPx()).toBeGreaterThan(1000);
    });

    it("gives the same water under a tsunami: the sea laid on the coast between two moves", () => {
        const water = { ...DEFAULT_WATER_SETTINGS, inertia: true, precision: 8, maxSurface: 256 };
        const grids = [lake(), lake(new WasmWaterKernel())];
        const tsunami = { id: 1, startedAt: 0, metres: 6, durationMs: 60_000 };
        for (let step = 0; step < 300; step++) {
            const input = stepInputOf(water, 0, [], 0.1);
            const tallies = grids.map((grid) => {
                grid.setSea(tsunamiSea(tsunami, step * 100));
                return grid.step(input);
            });
            expect(tallies[1], `tallies of step ${step}`).toStrictEqual(tallies[0]);
            for (const name of ["depth", "flowEast", "flowSouth", "speedEast", "speedSouth"]) {
                const [one, other] = grids.map((grid) => bytesOf(Reflect.get(grid, name) as Float32Array));
                if (Buffer.compare(one, other) !== 0) expect.fail(`${name} differs after step ${step}`);
            }
        }
        expect(grids[0].totalPx()).toBeGreaterThan(10_000);
    });

    it("gives the same figures pass by pass, over ranges of rows: what threads call each on its rows", () => {
        const width = 41;
        const height = 29;
        const cells = width * height;
        const powers = Float32Array.from({ length: 513 }, (_, eighths) => Math.pow(Math.max(1, eighths) / 8, -4 / 3));
        // The same grid twice, one in plain arrays and one in the memory of the kernel: a rough relief, water in
        // most cells, flows and speeds left by moves before.
        let seed = 20261123;
        const random = (): number => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
        const floats = (make: () => number): Float32Array => Float32Array.from({ length: cells }, make);
        const plain = {
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
            // A low over the grid: the heights its pressure holds (AirPressure), read by the flows.
            head: floats(() => -random() * 20),
            windEast: floats(() => random() * 40 - 20),
            windSouth: floats(() => random() * 40 - 20),
        };
        const figures = {
            width,
            height,
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
            pressed: 1,
        };
        // A memory threads share: a second kernel joins it, as a thread that follows the passes does.
        const kernel = new WasmWaterKernel({ shared: true });
        const names = Object.keys(plain) as (keyof typeof plain)[];
        const inMemory = Object.fromEntries(
            names.map((name) => {
                const array = name === "closed" || name === "hollow" ? kernel.bytes(cells) : kernel.floats(cells);
                array.set(plain[name]);
                return [name, array];
            }),
        ) as typeof plain;
        expect(kernel.ready()).toBe(true);
        const memory = kernel.threadMemory();
        if (!memory) throw new Error("no shared memory");
        const kernels = [kernel, WasmWaterKernel.join(memory)];
        // Each has a stack of its own in that memory: 4 KiB apart, never the same.
        const stacks = kernels.map((one) => one.stackTop() ?? -1);
        expect(stacks[0]).toBeGreaterThan(0);
        expect(Math.abs(stacks[1] - stacks[0])).toBeGreaterThanOrEqual(4096);
        const reference: InertiaMove = { ...figures, ...plain, powers, compiled: undefined };
        const compiled: InertiaMove = { ...figures, ...inMemory, powers: kernel.table(powers), compiled: kernel };
        const same = (pass: string): void => {
            for (const name of names) {
                if (Buffer.compare(bytesOf(plain[name]), bytesOf(inMemory[name])) !== 0) {
                    expect.fail(`${name} differs after ${pass}`);
                }
            }
        };
        // Four bands of rows, the two kernels in turn, not in the order of the rows.
        const bands = [0, 9, 10, 23, height];
        const inBands = (pass: (kernel: WasmWaterKernel, rowFrom: number, rowTo: number) => void): void => {
            for (const [turn, band] of [2, 0, 3, 1].entries()) pass(kernels[turn % 2], bands[band], bands[band + 1]);
        };
        fluxPass(reference, 0, height);
        inBands((one, from, to) => one.fluxPass(compiled, from, to));
        same("the flows");
        affordPass(reference, 0, height);
        inBands((one, from, to) => one.affordPass(compiled, from, to));
        same("what the cells can afford");
        const moved = scalePass(reference, 0, height);
        let movedInBands = false;
        inBands((one, from, to) => {
            if (one.scalePass(compiled, from, to)) movedInBands = true;
        });
        expect(movedInBands).toBe(moved);
        same("the flows cut down");
        const rowLost = new Float64Array(height);
        const rowLostInBands = kernel.doubles(height);
        const depthsMoved = depthsPass(reference, 0, height, rowLost);
        let movedByBands = false;
        inBands((one, from, to) => {
            if (one.depthsPass(compiled, from, to, rowLostInBands)) movedByBands = true;
        });
        // Each row has its own sum of what it lost: the very same, whoever computed it.
        expect(Array.from(rowLostInBands)).toStrictEqual(Array.from(rowLost));
        expect(rowLost.some((row) => row > 0)).toBe(true);
        expect(movedByBands).toBe(depthsMoved);
        same("the depths");
    });

    it("keeps the arrays of a grid in a memory of its own, or in one threads share when asked", () => {
        const own = lake(new WasmWaterKernel());
        const shared = lake(new WasmWaterKernel({ shared: true }));
        for (const grid of [own, shared]) {
            grid.rainOn(30, 20, 9, 20);
            grid.step({ rainPx: 0, evaporationPx: 0, absorptionPx: 0, flows: [], inertia: true });
            expect(grid.kernelName()).toBe("wasm");
        }
        const buffer = (grid: WaterGrid, name: string): unknown => (Reflect.get(grid, name) as Float32Array).buffer;
        // By their tag, not by their class: this test also runs where the page has classes of its own (play).
        expect(Object.prototype.toString.call(buffer(own, "depth"))).toBe("[object ArrayBuffer]");
        expect(Object.prototype.toString.call(buffer(shared, "depth"))).toBe("[object SharedArrayBuffer]");
        for (const name of ["ground", "next", "spill", "closed", "flowEast", "nextSpeedSouth", "rowLost"]) {
            expect(buffer(own, name), name).toBe(buffer(own, "depth"));
            expect(buffer(shared, name), name).toBe(buffer(shared, "depth"));
        }
        // The same water in the one and in the other.
        expect(
            Buffer.compare(
                bytesOf(Reflect.get(own, "depth") as Float32Array),
                bytesOf(Reflect.get(shared, "depth") as Float32Array),
            ),
        ).toBe(0);
    });

    it("is chosen by a setting that says wasm, and says what really computes", () => {
        expect(waterKernelNamed("wasm")).toBe("wasm");
        for (const setting of ["typescript", "", "WASM", "1", null, undefined]) {
            expect(waterKernelNamed(setting)).toBe("typescript");
        }
        expect(waterKernel()).toBe("typescript");
        expect(waterKernelInUse()).toStrictEqual({ kernel: "typescript" });
        expect(lake().kernelName()).toBe("typescript");
        const kept = globalThis.WebAssembly;
        try {
            setWaterKernel("wasm");
            expect(waterKernelInUse()).toStrictEqual({ kernel: "wasm" });
            expect(lake().kernelName()).toBe("wasm");
            // Where it cannot be loaded, the grids compute in TypeScript, the same water, and the reason is told.
            Reflect.deleteProperty(globalThis, "WebAssembly");
            expect(waterKernelInUse()).toStrictEqual({
                kernel: "typescript",
                fallback: "WebAssembly is not available here",
            });
            const fallen = lake();
            expect(fallen.kernelName()).toBe("typescript");
            fallen.rainOn(30, 20, 9, 20);
            expect(fallen.step({ rainPx: 0, evaporationPx: 0, absorptionPx: 0, flows: [], inertia: true }).moved).toBe(
                true,
            );
        } finally {
            globalThis.WebAssembly = kept;
            setWaterKernel("typescript");
        }
        expect(lake().kernelName()).toBe("typescript");
    });

    it("computes in TypeScript, and says so once, where its module is refused", () => {
        const warned = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const refused = vi.spyOn(WebAssembly, "Instance").mockImplementation(function refusedInstance(): never {
            throw new Error("refused for the test");
        });
        try {
            setWaterKernel("wasm");
            expect(waterKernelInUse()).toStrictEqual({ kernel: "typescript", fallback: "refused for the test" });
            const reference = lake();
            // Two grids, as two rooms: the same water as the passes written in TypeScript, and one warning.
            for (const fallen of [lake(), lake()]) {
                expect(fallen.kernelName()).toBe("typescript");
                fallen.rainOn(30, 20, 9, 20);
            }
            expect(warned).toHaveBeenCalledTimes(1);
            expect(warned).toHaveBeenCalledWith(
                "The compiled kernel of the water could not be loaded: computing in TypeScript",
                expect.objectContaining({ message: "refused for the test" }),
            );
            setWaterKernel("typescript");
            reference.rainOn(30, 20, 9, 20);
            setWaterKernel("wasm");
            const fallen = lake();
            fallen.rainOn(30, 20, 9, 20);
            const input = { rainPx: 0, evaporationPx: 0, absorptionPx: 0, flows: [], inertia: true };
            for (let step = 0; step < 20; step++) {
                expect(fallen.step(input).moved).toBe(reference.step(input).moved);
            }
            expect(Buffer.from(fallen.writeDepths(true)).equals(Buffer.from(reference.writeDepths(true)))).toBe(true);
        } finally {
            refused.mockRestore();
            warned.mockRestore();
            setWaterKernel("typescript");
        }
        // Loaded again once it can be.
        setWaterKernel("wasm");
        expect(waterKernelInUse()).toStrictEqual({ kernel: "wasm" });
        setWaterKernel("typescript");
    });
});
