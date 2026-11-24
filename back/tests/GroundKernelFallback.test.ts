import { Worker } from "node:worker_threads";
import { DEFAULT_FIRE_THRESHOLDS, NEUTRAL_FIRE_CONDITIONS } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import type { GroundCommand, GroundRoomState, GroundTold } from "../src/Model/Ground/GroundProtocol";
import { GROUND_MAP_CELLS, GROUND_NOW, GROUND_SEED, groundWam } from "./helpers/GroundScenario";

/**
 * WATER_KERNEL=wasm on a server where the compiled kernel of the water cannot be loaded: the thread of the grounds
 * says so and computes in TypeScript, the same water, alone or with bands. It must never end for that: the server
 * would start it again, for ever.
 */

const STEPS = 60;

function stateAt(step: number): GroundRoomState {
    return {
        mapSize: { width: GROUND_MAP_CELLS.width * 32, height: GROUND_MAP_CELLS.height * 32 },
        walkers: [],
        downpours: [],
        drains: [],
        balls: [],
        grazers: [],
        air: undefined,
        fire: NEUTRAL_FIRE_CONDITIONS,
        thresholds: DEFAULT_FIRE_THRESHOLDS,
        slots: undefined,
        now: GROUND_NOW + step * 100,
    };
}

/** Sixty steps of the water of a room on a real thread of the grounds: what it told, what it wrote, how it ended. */
async function live(
    file: string,
    kernel: string,
    bands: number,
): Promise<{ waters: string[]; errors: string[]; output: string; exited: number | undefined }> {
    const worker = new Worker(new URL(file, import.meta.url), {
        workerData: { bands },
        execArgv: ["--import", "tsx"],
        env: { ...process.env, WATER_KERNEL: kernel },
        stdout: true,
        stderr: true,
    });
    let output = "";
    worker.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    worker.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    let exited: number | undefined;
    const waters: string[] = [];
    const errors: string[] = [];
    const waiting = new Map<string, () => void>();
    const until = (key: string): Promise<void> =>
        new Promise((resolve) => {
            waiting.set(key, resolve);
        });
    const failed = new Promise<never>((_, reject) => {
        worker.on("error", reject);
        worker.on("exit", (code) => {
            exited = code;
            reject(new Error(`the thread of the grounds ended (${code})\n${output}`));
        });
    });
    worker.on("message", (told: GroundTold) => {
        if (told.kind === "told" && told.water) waters.push(Buffer.from(told.water.bytes).toString("base64"));
        if (told.kind === "error") errors.push(told.message);
        const key = told.kind === "started" ? `started:${told.part}` : told.kind;
        waiting.get(key)?.();
        waiting.delete(key);
    });
    const post = (command: GroundCommand): void => worker.postMessage(command);
    try {
        post({
            kind: "open",
            room: 1,
            roomUrl: "fallback",
            wam: groundWam(),
            state: stateAt(0),
            manual: { seed: GROUND_SEED },
        });
        let next = until("started:water");
        post({ kind: "startWater", room: 1, stored: {} });
        await Promise.race([next, failed]);
        for (let step = 1; step <= STEPS; step++) {
            next = until("stepped");
            post({ kind: "step", room: 1, reply: step, water: 1, meadow: 0, state: stateAt(step) });
            // eslint-disable-next-line no-await-in-loop -- one step after the other, as the room asks for them
            await Promise.race([next, failed]);
        }
        return { waters, errors, output, exited };
    } finally {
        failed.catch(() => undefined);
        worker.removeAllListeners("exit");
        await worker.terminate();
    }
}

describe("the thread of the grounds where the compiled kernel of the water cannot be loaded", () => {
    it("computes in TypeScript, the same water, and says so, with WATER_KERNEL=wasm: alone and with two bands", async () => {
        const reference = await live("../src/Model/Ground/GroundWorker.ts", "typescript", 1);
        expect(reference.errors).toEqual([]);
        // The water of the map moved and was told: there is something to compare.
        expect(reference.waters.length).toBeGreaterThan(5);
        expect(new Set(reference.waters).size).toBeGreaterThan(5);

        // Where it can be loaded, the thread says it computes with it: the setting reaches the thread.
        const compiled = await live("../src/Model/Ground/GroundWorker.ts", "wasm", 1);
        expect(compiled.output).toContain("A thread of the ground computes its water with the WebAssembly kernel");
        expect(compiled.waters).toEqual(reference.waters);

        for (const bands of [1, 2]) {
            // eslint-disable-next-line no-await-in-loop -- one thread after the other
            const fallen = await live("./helpers/GroundWorkerRefusedKernel.ts", "wasm", bands);
            expect(fallen.exited, `${bands} band(s)`).toBeUndefined();
            expect(fallen.errors, `${bands} band(s)`).toEqual([]);
            expect(fallen.output).toContain(
                "A thread of the ground computes its water with the TypeScript kernel: the WebAssembly one could not be loaded (refused for the test)",
            );
            expect(fallen.output).toContain(
                "The compiled kernel of the water could not be loaded: computing in TypeScript",
            );
            expect(fallen.waters, `${bands} band(s)`).toEqual(reference.waters);
        }
    }, 120_000);
});
