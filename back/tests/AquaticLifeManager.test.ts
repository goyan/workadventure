import { cellKey, WaterGrid, withHeights } from "@workadventure/map-editor";
import type { WAMFileFormat } from "@workadventure/map-editor";
import type { AquaticLifeMessage, SubToPusherRoomMessage } from "@workadventure/messages";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AquaticLifeManager } from "../src/Model/AquaticLifeManager";
import { TerrainWaterManager } from "../src/Model/TerrainWaterManager";
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
            life: {
                enabled,
                reproductionDelay: 60,
                maxLifespan: 600,
                maxSpeed: 1.5,
                huntInterval: 30,
                dolphinReproductionDelay: 120,
                dolphinMaxLifespan: 3600,
            },
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
    const avatars: { x: number; y: number }[] = [];
    const manager = new AquaticLifeManager(
        room,
        water,
        { repository, roomUrl: "room" },
        () => clock.now,
        random,
        () => avatars,
    );
    /** Steps of half a second, the clock moving with them. */
    const steps = (count: number): void => {
        for (let step = 0; step < count; step++) {
            manager.step();
            clock.now += 500;
        }
    };
    return { manager, wam, sent, repository, water, clock, steps, saved, avatars };
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
        // A player who joins gets the same animals (with the history of the life, which the room is not told again).
        expect(manager.snapshot()?.animals).toEqual(sent[0].animals);
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

    it("tells with the animals what happened since the life began, and the waters they have", () => {
        const { manager, sent, steps } = createHarness();
        manager.mapChanged();
        steps(2);
        expect(sent[0].stats).toEqual({
            since: 1_000_000,
            arrivals: 2,
            births: 0,
            diedOfAge: 0,
            eaten: 0,
            diedDry: 0,
            predatorBirths: 0,
            predatorDeaths: 0,
            habitableBodies: 1,
            populatedBodies: 1,
            // A hundred cells: twelve fish.
            capacity: 12,
            history: [],
            historyStepMs: 5000,
        });
        expect(manager.snapshot()?.stats).toMatchObject({ arrivals: 2, capacity: 12 });
    });

    it("gives a player who joins the history of the prey and of the predators, kept across a restart", async () => {
        const first = createHarness();
        first.manager.mapChanged();
        // Twelve seconds: samples at 0, 5 and 10 s.
        first.steps(24);
        const history = first.manager.snapshot()?.stats?.history ?? [];
        expect(history.map((sample) => sample.at)).toEqual([1_000_000, 1_005_000, 1_010_000]);
        expect(history[0]).toMatchObject({ prey: 2, predators: 0 });
        // The messages of every second do not carry it.
        expect(first.sent.at(-1)?.stats?.history).toEqual([]);
        first.manager.stop();

        const second = createHarness({ saved: first.saved });
        await second.manager.restore();
        second.manager.mapChanged();
        expect(second.manager.snapshot()?.stats?.history).toHaveLength(3);
        // Turned off, the life forgets its history.
        if (second.wam.settings?.life) second.wam.settings.life.enabled = false;
        second.manager.mapChanged();
        if (second.wam.settings?.life) second.wam.settings.life.enabled = true;
        second.manager.mapChanged();
        second.steps(2);
        expect(second.manager.snapshot()?.stats?.history).toHaveLength(1);
    });

    it("tells the dolphins of a deep lake with their sex: a male and a female", () => {
        const { manager, sent, steps, water } = createHarness();
        // 20 × 15 cells under 20 px of water: deep enough for a couple of dolphins.
        water.grid = gridOf(20, 15);
        manager.mapChanged();
        steps(2);
        const kinds = sent[0].animals.map((animal) => animal.kind).sort();
        expect(kinds).toEqual([0, 1, 2, 3]);
    });

    it("makes the fish keep away from an avatar standing in the middle of their pond", () => {
        const { manager, sent, steps, avatars } = createHarness();
        manager.mapChanged();
        steps(2);
        // The pond is 160 px wide: an avatar in its middle frightens every fish that comes within 96 px.
        avatars.push({ x: 80, y: 80 });
        let closest = Infinity;
        for (let second = 0; second < 30; second++) {
            steps(2);
            // The first seconds are for swimming away.
            if (second < 6) continue;
            for (const animal of sent.at(-1)?.animals ?? []) {
                closest = Math.min(closest, Math.hypot(animal.x - 80, animal.y - 80));
            }
        }
        expect(closest).toBeGreaterThan(48);
    });

    it("keeps its totals across a restart, and starts them over when the life is turned off and on", async () => {
        const first = createHarness();
        first.manager.mapChanged();
        first.steps(4);
        first.manager.stop();
        const second = createHarness({ saved: first.saved });
        await second.manager.restore();
        second.manager.mapChanged();
        second.clock.now += 60_000;
        second.steps(2);
        expect(second.sent.at(-1)?.stats).toMatchObject({ since: 1_000_000, arrivals: 2 });

        if (second.wam.settings?.life) second.wam.settings.life.enabled = false;
        second.manager.mapChanged();
        if (second.wam.settings?.life) second.wam.settings.life.enabled = true;
        second.manager.mapChanged();
        second.steps(2);
        expect(second.sent.at(-1)?.stats).toMatchObject({ since: second.clock.now - 1000, arrivals: 2 });
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

describe("AquaticLifeManager on the water of a room", () => {
    /** A hollow of 10 × 8 cells, one tile deep, with a strong spring in its middle. */
    function createRoom() {
        const cells = new Map<string, number>();
        for (let y = 0; y < 8; y++) for (let x = 0; x < 10; x++) cells.set(cellKey(x, y), -32);
        const wam: WAMFileFormat = {
            version: "2.1.0",
            mapUrl: "map.tmj",
            areas: [],
            entityCollections: [],
            entities: {
                spring: {
                    x: 5 * 16 + 8,
                    y: 4 * 16 + 8,
                    prefabRef: { collectionName: "eau", id: "x" },
                    properties: [{ id: "s", type: "waterSourcePropertyData", flow: 600_000 }],
                },
            },
            settings: {
                water: { runoff: 0, evaporation: 0, speed: 1, absorption: 0, current: 1 },
                life: {
                    enabled: true,
                    reproductionDelay: 60,
                    maxLifespan: 600,
                    maxSpeed: 1.5,
                    huntInterval: 30,
                    dolphinReproductionDelay: 120,
                    dolphinMaxLifespan: 3600,
                },
            },
            terrain: withHeights(undefined, cells),
        };
        const sent: AquaticLifeMessage[] = [];
        const room = {
            getWam: () => wam,
            sendSubMessageToRoom: (message: SubToPusherRoomMessage): void => {
                if (message.message?.$case === "aquaticLifeMessage") sent.push(message.message.aquaticLifeMessage);
            },
        };
        const water = new TerrainWaterManager(room, { slotsFor: () => undefined });
        const life = new AquaticLifeManager(room, water, undefined, () => 0);
        return { wam, sent, water, life };
    }

    afterEach(() => {
        vi.useRealTimers();
    });

    it("gets its first fish once the hollow holds enough water, and none while it is dry", () => {
        vi.useFakeTimers();
        const { sent, water, life, wam } = createRoom();
        water.mapChanged();
        life.mapChanged();
        life.step();
        life.step();
        expect(sent).toEqual([]);
        for (let step = 0; step < 600; step++) water.step();
        life.step();
        life.step();
        expect(sent.at(-1)?.animals).toHaveLength(2);
        const grid = water.getGrid();
        for (const animal of sent.at(-1)?.animals ?? []) {
            expect(grid?.depthAt(Math.floor(animal.x / 16), Math.floor(animal.y / 16))).toBeGreaterThanOrEqual(8);
        }
        expect(wam.settings?.life?.enabled).toBe(true);
        water.stop();
        life.stop();
    });

    it("is told when the water changes: its number moves while water pours, not once it rests", () => {
        vi.useFakeTimers();
        const { water, wam } = createRoom();
        water.mapChanged();
        const dry = water.waterVersion();
        for (let step = 0; step < 20; step++) water.step();
        expect(water.waterVersion()).toBeGreaterThan(dry);
        // The spring is taken away: the water settles, then nothing changes any more.
        wam.entities = {};
        water.mapChanged();
        for (let step = 0; step < 3000; step++) water.step();
        const settled = water.waterVersion();
        for (let step = 0; step < 50; step++) water.step();
        expect(water.waterVersion()).toBe(settled);
        water.stop();
    });
});
