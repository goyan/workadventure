import { WaterGrid } from "@workadventure/map-editor";
import type { WAMFileFormat } from "@workadventure/map-editor";
import type { AquaticLifeMessage, SubToPusherRoomMessage } from "@workadventure/messages";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AquaticLifeManager } from "../src/Model/AquaticLifeManager";
import type { VariablesRepositoryInterface } from "../src/Services/Repository/VariablesRepositoryInterface";

/** A grid of that many cells, all under 20 px of water (deep enough for everything) or dry. */
function gridOf(width: number, height: number, wet = true): WaterGrid {
    const grid = new WaterGrid(undefined, { x: 0, y: 0, width, height });
    const bytes = new Uint8Array(width * height * 2);
    if (wet) for (let index = 0; index < width * height; index++) bytes[index * 2] = 160;
    grid.readDepths(bytes);
    return grid;
}

function wamWith(enabled: boolean): WAMFileFormat {
    return {
        version: "2.1.0",
        mapUrl: "map.tmj",
        areas: [],
        entityCollections: [],
        entities: {},
        settings: {
            life: { enabled, reproductionDelay: 60, maxLifespan: 600, maxSpeed: 1.5, huntInterval: 30 },
        },
    };
}

function createHarness({
    enabled = true,
    noWater = false,
    saved = {},
    failingStore = false,
}: { enabled?: boolean; noWater?: boolean; saved?: Record<string, string>; failingStore?: boolean } = {}) {
    const grid: WaterGrid | undefined = noWater ? undefined : gridOf(10, 10);
    const sent: AquaticLifeMessage[] = [];
    const wam = wamWith(enabled);
    const repository = {
        loadVariables: vi.fn((_roomUrl: string) =>
            failingStore ? Promise.reject(new Error("down")) : Promise.resolve(saved),
        ),
        saveVariable: vi.fn((_roomUrl: string, key: string, value: string) => {
            saved[key] = value;
            return failingStore ? Promise.reject(new Error("down")) : Promise.resolve(1);
        }),
    } satisfies VariablesRepositoryInterface;
    const room = {
        getWam: () => wam,
        sendSubMessageToRoom: (message: SubToPusherRoomMessage): void => {
            if (message.message?.$case === "aquaticLifeMessage") sent.push(message.message.aquaticLifeMessage);
        },
    };
    const water = { grid, version: 1, getGrid: () => water.grid, waterVersion: () => water.version };
    const clock = { now: 1_000_000 };
    let seed = 7;
    const random = (): number => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x80000000;
    };
    const manager = new AquaticLifeManager(room, water, { repository, roomUrl: "room" }, () => clock.now, random);
    /** Steps of half a second, the clock moving with them. */
    const steps = (count: number): void => {
        for (let step = 0; step < count; step++) {
            manager.step();
            clock.now += 500;
        }
    };
    return { manager, wam, sent, repository, water, clock, steps, saved };
}

describe("AquaticLifeManager", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it("arms no timer and tells nothing while the life of the map is off", () => {
        vi.useFakeTimers();
        const { manager, sent } = createHarness({ enabled: false });
        manager.start();
        expect(vi.getTimerCount()).toBe(0);
        vi.advanceTimersByTime(5000);
        expect(sent).toEqual([]);
        expect(manager.snapshot()).toBeUndefined();
    });

    it("arms no timer on a map without water", () => {
        vi.useFakeTimers();
        const { manager } = createHarness({ noWater: true });
        manager.start();
        expect(vi.getTimerCount()).toBe(0);
    });

    it("steps twice a second once the life is on, and stops with the room", () => {
        vi.useFakeTimers();
        const { manager, sent } = createHarness();
        manager.start();
        expect(vi.getTimerCount()).toBe(1);
        vi.advanceTimersByTime(1000);
        expect(sent).toHaveLength(1);
        manager.stop();
        expect(vi.getTimerCount()).toBe(0);
    });

    it("tells the room its first fish at its first message: a male and a female, in map pixels", () => {
        const { manager, sent, steps } = createHarness();
        manager.mapChanged();
        steps(2);
        expect(sent).toHaveLength(1);
        expect(sent[0].animals.map((animal) => animal.kind).sort()).toEqual([0, 1]);
        for (const animal of sent[0].animals) {
            expect(animal.x).toBeGreaterThanOrEqual(0);
            expect(animal.x).toBeLessThan(160);
            expect(Number.isInteger(animal.x)).toBe(true);
        }
        expect(manager.snapshot()).toEqual(sent[0]);
    });

    it("tells the room every second", () => {
        const { manager, sent, steps } = createHarness();
        manager.mapChanged();
        steps(10);
        expect(sent).toHaveLength(5);
    });

    it("empties the water when the life is turned off: one last empty message, then nothing", () => {
        const { manager, sent, steps, wam } = createHarness();
        manager.mapChanged();
        steps(2);
        if (wam.settings?.life) wam.settings.life.enabled = false;
        manager.mapChanged();
        expect(sent.at(-1)?.animals).toEqual([]);
        const told = sent.length;
        steps(6);
        expect(sent).toHaveLength(told);
        expect(manager.snapshot()).toBeUndefined();
    });

    it("saves the animals and brings them back after a restart, with their dates", async () => {
        const first = createHarness();
        first.manager.mapChanged();
        first.steps(4);
        first.manager.stop();
        expect(first.repository.saveVariable).toHaveBeenCalledWith("aquatic-life:room", "state", expect.any(String));
        const before = first.manager.snapshot();

        const second = createHarness({ saved: first.saved });
        await second.manager.restore();
        second.manager.mapChanged();
        expect(
            second.manager
                .snapshot()
                ?.animals.map((animal) => animal.id)
                .sort(),
        ).toEqual(before?.animals.map((animal) => animal.id).sort());
        const state: unknown = JSON.parse(first.saved.state);
        expect(state).toMatchObject({ animals: [{ bornAt: 1_000_000 }, { bornAt: 1_000_000 }] });
    });

    it("starts from an empty water when what was saved cannot be read, or the store does not answer", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        const harnesses = [
            createHarness({ saved: { state: "{not json" } }),
            createHarness({ saved: { state: JSON.stringify({ animals: [{ id: "x" }], nextId: 1 }) } }),
            createHarness({ failingStore: true }),
        ];
        await Promise.all(harnesses.map((harness) => expect(harness.manager.restore()).resolves.toBeUndefined()));
        for (const harness of harnesses) {
            harness.manager.mapChanged();
            harness.steps(2);
            expect(harness.sent[0].animals).toHaveLength(2);
        }
    });

    it("keeps the animals when the grid is replaced, and lets those left without water die after five seconds", () => {
        const { manager, sent, steps, water } = createHarness();
        manager.mapChanged();
        steps(2);
        expect(sent.at(-1)?.animals).toHaveLength(2);
        // The relief changed: a new grid, the same water.
        water.grid = gridOf(10, 10);
        water.version++;
        manager.mapChanged();
        steps(2);
        expect(sent.at(-1)?.animals).toHaveLength(2);
        // Now the water is gone.
        water.grid = gridOf(10, 10, false);
        water.version++;
        manager.mapChanged();
        steps(8);
        expect(sent.at(-1)?.animals).toHaveLength(2);
        steps(6);
        expect(sent.at(-1)?.animals).toEqual([]);
    });

    it("stops the life of the room, without throwing, when a step fails", () => {
        vi.useFakeTimers();
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const { manager, water } = createHarness();
        manager.start();
        water.getGrid = () => {
            throw new Error("broken");
        };
        expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
        expect(error).toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });
});
