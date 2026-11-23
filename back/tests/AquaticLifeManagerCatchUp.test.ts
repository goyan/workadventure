import { WaterGrid } from "@workadventure/map-editor";
import type { WAMFileFormat } from "@workadventure/map-editor";
import type { SubToPusherRoomMessage } from "@workadventure/messages";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AquaticLifeManager } from "../src/Model/AquaticLifeManager";
import { plain } from "./helpers/GroundScenario";

/** A lake of 40 × 30 cells under 20 px of water: deep enough for everything that swims. */
function lake(): WaterGrid {
    const grid = new WaterGrid(undefined, { x: 0, y: 0, width: 40, height: 30 });
    const bytes = new Uint8Array(40 * 30 * 2);
    for (let index = 0; index < 40 * 30; index++) bytes[index * 2] = 160;
    grid.readDepths(bytes);
    return grid;
}

const wam: WAMFileFormat = {
    version: "2.1.0",
    mapUrl: "map.tmj",
    areas: [],
    entityCollections: [],
    entities: {},
    settings: {
        life: {
            enabled: true,
            reproductionDelay: 20,
            maxLifespan: 600,
            maxSpeed: 1.5,
            huntInterval: 30,
            dolphinReproductionDelay: 120,
            dolphinMaxLifespan: 3600,
            drinkInterval: 120,
        },
    },
};

/** A life over the lake, with its own luck, its clock, its store, and a stopwatch the test moves. */
function life(saved: Record<string, string> = {}) {
    const grid = lake();
    const told: string[] = [];
    const clock = { now: 1_000_000 };
    const watch = { now: 0, perStep: 0 };
    let seed = 7;
    const random = (): number => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x80000000;
    };
    const manager = new AquaticLifeManager(
        {
            getWam: () => wam,
            sendSubMessageToRoom: (message: SubToPusherRoomMessage): void => {
                told.push(plain(message));
            },
        },
        { getGrid: () => grid, waterVersion: () => 1 },
        {
            roomUrl: "room",
            repository: {
                loadVariables: () => Promise.resolve(saved),
                saveVariable: (_key: string, field: string, value: string) => {
                    saved[field] = value;
                    return Promise.resolve(1);
                },
            },
        },
        () => clock.now,
        random,
    );
    // Each step of the life takes `perStep` ms of the stopwatch: what a slice of the missed time is timed by.
    const step = manager.step.bind(manager);
    const steps = { count: 0, slices: [] as number[] };
    manager.step = (): void => {
        step();
        steps.count++;
        watch.now += watch.perStep;
    };
    manager.timeCatchUpWith(() => watch.now);
    return { manager, told, saved, clock, watch, steps };
}

/** A life that lived two minutes, saved as its room closed. */
function livedAndSaved(): Record<string, string> {
    const first = life();
    first.manager.mapChanged();
    for (let step = 0; step < 240; step++) {
        first.manager.step();
        first.clock.now += 500;
    }
    first.manager.stop();
    return first.saved;
}

/** The room opens again `minutes` later, its steps taking `perStep` ms each: what it lives until it caught up. */
async function reopened(saved: Record<string, string>, minutes: number, perStep: number) {
    const again = life({ ...saved });
    again.clock.now = 1_000_000 + 240 * 500 + minutes * 60_000;
    again.watch.perStep = perStep;
    await again.manager.restore();
    again.manager.mapChanged();
    expect(again.manager.catchingUp()).toBe(true);
    // The steps each turn of the timers made: a slice of the missed time, then its pause.
    let before = again.steps.count;
    for (let turn = 0; turn < 20_000 && again.manager.catchingUp(); turn++) {
        vi.advanceTimersToNextTimer();
        if (again.steps.count > before) again.steps.slices.push(again.steps.count - before);
        before = again.steps.count;
    }
    expect(again.manager.catchingUp()).toBe(false);
    again.manager.stop();
    return again;
}

describe("AquaticLifeManager, the time a room missed", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("is lived by slices that hold the thread a few milliseconds, whatever a step of the life costs", async () => {
        vi.useFakeTimers();
        const saved = livedAndSaved();
        // Steps of 3 ms: three of them fill the 8 ms a slice may take.
        const slow = await reopened(saved, 10, 3);
        expect(Math.max(...slow.steps.slices)).toBe(3);
        // Ten minutes at two steps a second, all lived.
        expect(slow.steps.count).toBe(1200);
        // Steps that cost nothing (a small map): the slices are as long as they ever were.
        const quick = await reopened(saved, 10, 0);
        expect(Math.max(...quick.steps.slices)).toBe(120);
        expect(quick.steps.count).toBe(1200);
        // A step that takes longer than a slice by itself still goes: one at a time.
        const heavy = await reopened(saved, 2, 40);
        expect(Math.max(...heavy.steps.slices)).toBe(1);
        expect(heavy.steps.count).toBe(240);
    }, 60_000);

    it("ends with the same animals however it was sliced: the same steps in the same order", async () => {
        vi.useFakeTimers();
        const saved = livedAndSaved();
        const whole = await reopened(saved, 30, 0);
        const sliced = await reopened(saved, 30, 3);
        const single = await reopened(saved, 30, 40);
        const state = JSON.parse(whole.saved.state) as { animals: unknown[] };
        expect(state.animals.length).toBeGreaterThan(2);
        expect(sliced.saved.state).toBe(whole.saved.state);
        expect(single.saved.state).toBe(whole.saved.state);
        expect(sliced.told).toEqual(whole.told);
        expect(single.told).toEqual(whole.told);
    }, 60_000);

    it("stops its slices when the room closes", async () => {
        vi.useFakeTimers();
        const again = life({ ...livedAndSaved() });
        again.clock.now = 1_000_000 + 240 * 500 + 30 * 60_000;
        again.watch.perStep = 3;
        await again.manager.restore();
        again.manager.mapChanged();
        vi.advanceTimersByTime(600);
        const lived = again.steps.count;
        expect(lived).toBeGreaterThan(0);
        again.manager.stop();
        vi.advanceTimersByTime(5000);
        expect(again.steps.count).toBe(lived);
        expect(vi.getTimerCount()).toBe(0);
    }, 60_000);
});
