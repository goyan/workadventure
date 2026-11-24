import { WaterGrid } from "@workadventure/map-editor";
import type { Animal, LifeSettings, WAMFileFormat } from "@workadventure/map-editor";
import type { AquaticLifeMessage, SubToPusherRoomMessage } from "@workadventure/messages";
import { describe, expect, it, vi } from "vitest";
import { AquaticLifeManager } from "../src/Model/AquaticLifeManager";
import type { VariablesRepositoryInterface } from "../src/Services/Repository/VariablesRepositoryInterface";

const START = 1_000_000;
const GULL_SPECIES = 5;
const base = { bornAt: START, lifespanMs: 1e12, readyAt: 1e13, ateAt: START };
const fish = (count: number): Animal[] =>
    Array.from({ length: count }, (_, index) => ({
        ...base,
        id: 100 + index,
        kind: "fish" as const,
        sex: "male" as const,
        x: 24 + (index % 20) * 16,
        y: 24 + (index % 7) * 16,
    }));

/** A map of 60 × 40 cells whose 30 left columns are a lake of deep water, with the animals given already there. */
async function harness(animals: Animal[], life: Partial<LifeSettings> = {}) {
    const grid = new WaterGrid(undefined, { x: 0, y: 0, width: 60, height: 40 });
    const bytes = new Uint8Array(60 * 40 * 2);
    for (let y = 0; y < 40; y++) for (let x = 0; x < 30; x++) bytes[(y * 60 + x) * 2] = 160;
    grid.readDepths(bytes);
    const settings: Partial<LifeSettings> = {
        enabled: true,
        reproductionDelay: 3600,
        maxLifespan: 86400,
        maxSpeed: 1.5,
        huntInterval: 3600,
        dolphinReproductionDelay: 3600,
        dolphinMaxLifespan: 86400,
        drinkInterval: 120,
        gullsEnabled: true,
        ...life,
    };
    const wam: WAMFileFormat = {
        version: "2.1.0",
        mapUrl: "map.tmj",
        areas: [],
        entityCollections: [],
        entities: {},
        settings: { life: settings as LifeSettings },
    };
    const saved: Record<string, string> = { state: JSON.stringify({ animals, nextId: 1000 }) };
    const sent: AquaticLifeMessage[] = [];
    const repository = {
        loadVariables: vi.fn((_roomUrl: string) => Promise.resolve(saved)),
        saveVariable: vi.fn((_roomUrl: string, key: string, value: string) => {
            saved[key] = value;
            return Promise.resolve(1);
        }),
    } satisfies VariablesRepositoryInterface;
    const room = {
        getWam: () => wam,
        sendSubMessageToRoom: (message: SubToPusherRoomMessage): void => {
            if (message.message?.$case === "aquaticLifeMessage") sent.push(message.message.aquaticLifeMessage);
        },
    };
    const clock = { now: START };
    const manager = new AquaticLifeManager(
        room,
        { getGrid: () => grid, waterVersion: () => 1 },
        { repository, roomUrl: "room" },
        () => clock.now,
        () => 0.5,
        () => [],
        () => ({ width: 60, height: 40 }),
    );
    await manager.restore();
    const steps = (count: number): void => {
        for (let step = 0; step < count; step++) {
            manager.step();
            clock.now += 500;
        }
    };
    const gulls = () => (manager.snapshot()?.animals ?? []).filter((animal) => animal.kind >> 1 === GULL_SPECIES);
    return { manager, sent, steps, wam, gulls, settings };
}

describe("AquaticLifeManager, the gulls", () => {
    it("brings a couple of gulls over a lake with fish, told in flight, and counts them for the dashboard", async () => {
        const { steps, gulls, sent } = await harness(fish(40));
        steps(2);
        expect(
            gulls()
                .map((gull) => gull.kind)
                .sort(),
        ).toEqual([10, 11]);
        for (const gull of gulls()) expect(gull.state).toBe(1);
        const stats = sent[sent.length - 1].species.find((entry) => entry.species === GULL_SPECIES);
        expect(stats).toMatchObject({ males: 1, females: 1, arrivals: 2 });
        expect(stats?.cap).toBeGreaterThanOrEqual(2);
    });

    it("tells a landed gull as landed, and lands it on the shore though the land is switched off", async () => {
        const gull: Animal = { ...base, id: 1, kind: "gull", sex: "male", x: 200, y: 300, homeX: 200, homeY: 300 };
        const { steps, gulls } = await harness([gull, ...fish(5)]);
        steps(120);
        expect(gulls()[0]).toMatchObject({ state: 2 });
        // The first dry column beside the lake.
        expect(Math.floor(gulls()[0].x / 16)).toBe(30);
    });

    it("has no gull, and no column for them, on a map where they are off", async () => {
        const { steps, gulls, sent } = await harness(fish(40), { gullsEnabled: false });
        steps(4);
        expect(gulls()).toHaveLength(0);
        expect(sent[sent.length - 1].species.some((entry) => entry.species === GULL_SPECIES)).toBe(false);
    });

    it("sends the gulls away when they are switched off, and when the water is", async () => {
        const gull: Animal = { ...base, id: 1, kind: "gull", sex: "male", x: 200, y: 300, homeX: 200, homeY: 300 };
        const off = await harness([gull, ...fish(5)]);
        off.settings.gullsEnabled = false;
        off.manager.mapChanged();
        expect(off.gulls()).toHaveLength(0);
        expect(off.manager.snapshot()?.animals).toHaveLength(5);
        const dry = await harness([gull, ...fish(5)], { landEnabled: true });
        dry.settings.enabled = false;
        dry.manager.mapChanged();
        expect(dry.gulls()).toHaveLength(0);
    });

    it("does not count a gull for the presence sensors", async () => {
        const gull: Animal = { ...base, id: 1, kind: "gull", sex: "male", x: 200, y: 300, perchedAt: START };
        const { manager } = await harness([gull]);
        expect(manager.landAnimals()).toEqual([]);
    });
});
