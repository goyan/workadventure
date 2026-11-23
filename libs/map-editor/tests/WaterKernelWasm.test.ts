import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { stepInputOf } from "../src/Terrain/WaterInputs";
import { setWaterKernel, waterKernel, waterKernelInUse, waterKernelNamed } from "../src/Terrain/WaterGrid";
import type { WaterKernelKind } from "../src/Terrain/WaterGrid";
import { affordPass, depthsPass, fluxPass, scalePass } from "../src/Terrain/WaterKernel";
import type { InertiaMove } from "../src/Terrain/WaterKernel";
import { WasmWaterKernel } from "../src/Terrain/WaterKernelWasm";
import { WATER_KERNEL_SOURCE_SHA256 } from "../src/Terrain/WaterKernelWasm.generated";
import { DEFAULT_WATER_SETTINGS } from "../src/types";
import {
    arrayOf,
    fill,
    HILL_TOP,
    inLake,
    LAKE_CENTRE,
    newGrid,
    playScenario,
    SCENARIO_TIMEOUT_MS,
    SCENARIOS,
    STATE_ARRAYS,
} from "./helpers/WaterScenarios";
import type { Run, Scenario } from "./helpers/WaterScenarios";

/**
 * The kernel of the water compiled to WebAssembly (kernel/water_kernel.c) against the passes written in TypeScript
 * (src/Terrain/WaterKernel.ts), which are the reference: the same water, to the bit. Every scenario of
 * helpers/WaterScenarios.ts is played on two grids side by side, one for each kernel, and everything they hold is
 * compared at every step; each also ends on the fingerprint recorded before either kernel was cut out.
 */

const KERNELS: readonly WaterKernelKind[] = ["typescript", "wasm"];

/** Plays a scenario on a grid for each kernel, comparing them at every step. */
function sideBySide(scenario: Scenario): void {
    const runs = KERNELS.map((kernel): Run => ({ grid: newGrid(false, kernel), notes: [], kernel }));
    for (const [at, run] of runs.entries()) expect(run.grid.kernelName()).toBe(KERNELS[at]);
    for (const run of runs) scenario.setup?.(run);
    for (let step = 0; step < scenario.steps; step++) {
        const tallies = runs.map((run) => {
            const input = scenario.each(run, step);
            return input ? run.grid.step(input) : undefined;
        });
        expect(tallies[1], `tally of step ${step}`).toStrictEqual(tallies[0]);
        for (const name of STATE_ARRAYS) {
            if (Buffer.compare(arrayOf(runs[1].grid, name), arrayOf(runs[0].grid, name)) === 0) continue;
            expect.fail(`${name} differs after step ${step}`);
        }
    }
    expect(runs[1].notes).toStrictEqual(runs[0].notes);
    expect(runs[1].grid.kernelName()).toBe("wasm");
}

describe("the kernel of the water compiled to WebAssembly", () => {
    it("was built from the water_kernel.c of the repository: run kernel/build.sh after changing it", () => {
        // Run from libs/map-editor, or from play (whose checks run this test too).
        const path = ["kernel/water_kernel.c", "../libs/map-editor/kernel/water_kernel.c"].find((candidate) =>
            existsSync(candidate),
        );
        if (!path) throw new Error("water_kernel.c not found from " + process.cwd());
        const source = readFileSync(path);
        expect(createHash("sha256").update(source).digest("hex")).toBe(WATER_KERNEL_SOURCE_SHA256);
    });

    for (const scenario of SCENARIOS) {
        it(
            `gives the same water as the TypeScript one, to the bit: ${scenario.name}`,
            () => {
                sideBySide(scenario);
                expect(playScenario(scenario, "wasm").whole).toBe(scenario.fingerprint);
            },
            SCENARIO_TIMEOUT_MS,
        );
    }

    it(
        "gives the same water on a map that goes faster than reality: several steps of its time in a step of the clock",
        () => {
            // A map sixty times faster, its water with inertia: three steps of its time at each step, with the rain,
            // the source and the sink sixty times as strong (the true acceleration of the water).
            const water = { ...DEFAULT_WATER_SETTINGS, speed: 60, inertia: true, precision: 4, maxSurface: 256 };
            const objects = [
                { ...HILL_TOP, litresPerMinute: 400, radiusCells: 1 },
                { ...LAKE_CENTRE, litresPerMinute: -300, radiusCells: 3 },
            ];
            sideBySide({
                name: "a fast map",
                steps: 150,
                fingerprint: "",
                setup: (run) => fill(run.grid, -6, inLake),
                each: (run, step) => {
                    const input = stepInputOf(water, step < 60 ? 4 : 0, objects, 0.1);
                    run.notes.push(run.grid.step(input).lostPx, run.grid.step(input).lostPx);
                    return input;
                },
            });
        },
        SCENARIO_TIMEOUT_MS,
    );

    it("gives the same figures pass by pass, over ranges of rows: what threads will call each on its rows", () => {
        const width = 41;
        const height = 29;
        const cells = width * height;
        const powers = Float32Array.from({ length: 513 }, (_, eighths) => Math.pow(Math.max(1, eighths) / 8, -4 / 3));
        const kernel = WasmWaterKernel.create(cells, powers.length, height);
        if (!kernel) throw new Error("no compiled kernel");
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
        };
        const figures = {
            width,
            height,
            powers,
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
        };
        const reference: InertiaMove = { ...figures, ...plain };
        const names = Object.keys(plain) as (keyof typeof plain)[];
        const inMemory = Object.fromEntries(
            names.map((name) => {
                const array = name === "closed" || name === "hollow" ? kernel.bytes(cells) : kernel.floats(cells);
                array.set(plain[name]);
                return [name, array];
            }),
        ) as typeof plain;
        const compiled: InertiaMove = { ...figures, ...inMemory };
        const same = (pass: string): void => {
            for (const name of names) {
                const one = new Uint8Array(plain[name].buffer, plain[name].byteOffset, plain[name].byteLength);
                const other = new Uint8Array(
                    inMemory[name].buffer,
                    inMemory[name].byteOffset,
                    inMemory[name].byteLength,
                );
                if (Buffer.compare(one, other) !== 0) expect.fail(`${name} differs after ${pass}`);
            }
        };
        const bands = [0, 9, 10, 23, height];
        fluxPass(reference, 0, height);
        for (let band = 0; band + 1 < bands.length; band++) kernel.fluxPass(compiled, bands[band], bands[band + 1]);
        same("the flows");
        affordPass(reference, 0, height);
        for (let band = 0; band + 1 < bands.length; band++) kernel.affordPass(compiled, bands[band], bands[band + 1]);
        same("what the cells can afford");
        const moved = scalePass(reference, 0, height);
        let movedInBands = false;
        for (let band = 0; band + 1 < bands.length; band++) {
            if (kernel.scalePass(compiled, bands[band], bands[band + 1])) movedInBands = true;
        }
        expect(movedInBands).toBe(moved);
        same("the flows cut down");
        const rowLost = new Float64Array(height);
        const rowLostInBands = kernel.doubles(height);
        const depthsMoved = depthsPass(reference, 0, height, rowLost);
        let movedByBands = false;
        for (let band = 0; band + 1 < bands.length; band++) {
            if (kernel.depthsPass(compiled, bands[band], bands[band + 1], rowLostInBands)) movedByBands = true;
        }
        // Each row has its own sum of what it lost: the very same, whoever computed it.
        expect(Array.from(rowLostInBands)).toStrictEqual(Array.from(rowLost));
        expect(rowLost.some((row) => row > 0)).toBe(true);
        expect(movedByBands).toBe(depthsMoved);
        same("the depths");
    });

    it("computes in TypeScript, the same water, where it cannot be loaded", () => {
        const kept = globalThis.WebAssembly;
        try {
            Reflect.deleteProperty(globalThis, "WebAssembly");
            const grid = newGrid(false, "wasm");
            expect(grid.kernelName()).toBe("typescript");
        } finally {
            globalThis.WebAssembly = kept;
        }
        expect(newGrid(false, "wasm").kernelName()).toBe("wasm");
        // And a grid asks for none unless it is told, or the usual kernel is set.
        expect(newGrid().kernelName()).toBe("typescript");
    });

    it("is chosen by a setting that says wasm, and says what really computes", () => {
        expect(waterKernelNamed("wasm")).toBe("wasm");
        for (const setting of ["typescript", "", "WASM", "1", null, undefined]) {
            expect(waterKernelNamed(setting)).toBe("typescript");
        }
        expect(waterKernel()).toBe("typescript");
        expect(waterKernelInUse()).toStrictEqual({ kernel: "typescript" });
        const kept = globalThis.WebAssembly;
        try {
            setWaterKernel("wasm");
            expect(waterKernelInUse()).toStrictEqual({ kernel: "wasm" });
            expect(newGrid().kernelName()).toBe("wasm");
            // Where it cannot be loaded, the grids compute in TypeScript and the reason is told.
            Reflect.deleteProperty(globalThis, "WebAssembly");
            expect(waterKernelInUse()).toStrictEqual({
                kernel: "typescript",
                fallback: "WebAssembly is not available here",
            });
            expect(newGrid().kernelName()).toBe("typescript");
        } finally {
            globalThis.WebAssembly = kept;
            setWaterKernel("typescript");
        }
        expect(newGrid().kernelName()).toBe("typescript");
    });
});
