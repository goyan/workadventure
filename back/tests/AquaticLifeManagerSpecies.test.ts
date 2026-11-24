import { WaterGrid } from "@workadventure/map-editor";
import type { WAMFileFormat } from "@workadventure/map-editor";
import type { AquaticLifeMessage, SubToPusherRoomMessage } from "@workadventure/messages";
import { describe, expect, it, vi } from "vitest";
import { AquaticLifeManager } from "../src/Model/AquaticLifeManager";
import type { VariablesRepositoryInterface } from "../src/Services/Repository/VariablesRepositoryInterface";

const FISH = 0;
const DOLPHIN = 1;

function harness(saved: Record<string, string> = {}) {
    const grid = new WaterGrid(undefined, { x: 0, y: 0, width: 10, height: 10 });
    const bytes = new Uint8Array(200);
    for (let index = 0; index < 100; index++) bytes[index * 2] = 160;
    grid.readDepths(bytes);
    const wam: WAMFileFormat = {
        version: "2.1.0",
        mapUrl: "map.tmj",
        areas: [],
        entityCollections: [],
        entities: {},
        settings: {
            life: {
                enabled: true,
                reproductionDelay: 60,
                maxLifespan: 600,
                maxSpeed: 1.5,
                huntInterval: 30,
                dolphinReproductionDelay: 120,
                dolphinMaxLifespan: 3600,
                drinkInterval: 120,
            },
        },
    };
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
    const clock = { now: 1_000_000 };
    let seed = 7;
    const random = (): number => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x80000000;
    };
    const manager = new AquaticLifeManager(
        room,
        { getGrid: () => grid, waterVersion: () => 1 },
        { repository, roomUrl: "room" },
        () => clock.now,
        random,
    );
    const steps = (count: number): void => {
        for (let step = 0; step < count; step++) {
            manager.step();
            clock.now += 500;
        }
    };
    return { manager, sent, steps, saved, clock };
}

const animal = (id: number, kind: "fish" | "dolphin", more: Record<string, unknown> = {}) => ({
    id,
    kind,
    sex: "male",
    x: 88,
    y: 88,
    bornAt: 1_000_000,
    lifespanMs: 1e12,
    readyAt: 1e15,
    ...more,
});
const speciesOf = (message: AquaticLifeMessage | undefined, species: number) =>
    message?.species.find((entry) => entry.species === species);

describe("AquaticLifeManager, species by species", () => {
    it("tells how many of each species live, how many its waters hold, and those that came", () => {
        const { manager, steps } = harness();
        steps(2);
        const fish = speciesOf(manager.snapshot(), FISH);
        expect(fish).toMatchObject({ species: FISH, males: 1, females: 1, cap: 12, arrivals: 2, births: 0 });
        expect(speciesOf(manager.snapshot(), DOLPHIN)).toBeUndefined();
    });

    it("tells what a predator ate, and what was eaten", async () => {
        const saved = {
            state: JSON.stringify({
                animals: [animal(1, "fish"), animal(2, "dolphin", { readyAt: 0, ateAt: 1_000_000 })],
                nextId: 3,
            }),
        };
        const { manager, steps } = harness(saved);
        await manager.restore();
        steps(2);
        const message = manager.snapshot();
        expect(speciesOf(message, DOLPHIN)).toMatchObject({ males: 1, meals: [{ species: FISH, count: 1 }] });
        expect(speciesOf(message, FISH)).toMatchObject({ eaten: 1 });
        expect(message?.stats?.eaten).toBe(1);
    });

    it("gives the history with the count of each species to who joins, not every second", () => {
        const { manager, sent, steps } = harness();
        steps(2);
        const joined = manager.snapshot();
        expect(joined?.stats?.history[0].counts).toEqual([{ species: FISH, count: 2 }]);
        expect(joined?.stats?.ranges[0].samples[0].counts).toEqual([{ species: FISH, count: 2 }]);
        expect(sent[sent.length - 1].stats?.history).toEqual([]);
    });

    it("starts the figures of each species from the totals of a state saved before they were kept", async () => {
        const saved = {
            state: JSON.stringify({
                animals: [animal(1, "fish"), animal(2, "dolphin", { ateAt: 1_000_000 })],
                nextId: 3,
                since: 5,
                totals: {
                    arrivals: 4,
                    births: 30,
                    diedOfAge: 7,
                    eaten: 9,
                    diedDry: 1,
                    predatorBirths: 2,
                    predatorDeaths: 3,
                },
                history: { stepMs: 5000, samples: [{ at: 10, prey: 5, predators: 1 }] },
            }),
        };
        const { manager, steps } = harness(saved);
        await manager.restore();
        steps(2);
        const message = manager.snapshot();
        expect(speciesOf(message, FISH)).toMatchObject({
            arrivals: 4,
            births: 30,
            diedOfAge: 7,
            eaten: 9,
            diedDry: 1,
            starved: 0,
        });
        expect(speciesOf(message, DOLPHIN)).toMatchObject({
            births: 2,
            diedOfAge: 3,
            meals: [{ species: FISH, count: 9 }],
        });
        expect(message?.stats).toMatchObject({ arrivals: 4, births: 30, eaten: 9, predatorBirths: 2 });
        expect(message?.stats?.history[0]).toEqual({ at: 10, prey: 5, predators: 1, counts: [] });
    });

    it("brings the figures of each species back after a restart", async () => {
        const first = harness({
            state: JSON.stringify({
                animals: [animal(1, "fish"), animal(2, "dolphin", { readyAt: 0, ateAt: 1_000_000 })],
                nextId: 3,
            }),
        });
        await first.manager.restore();
        first.steps(2);
        first.manager.stop();
        const second = harness(first.saved);
        await second.manager.restore();
        second.steps(2);
        expect(speciesOf(second.manager.snapshot(), DOLPHIN)).toMatchObject({
            meals: [{ species: FISH, count: 1 }],
        });
        expect(speciesOf(second.manager.snapshot(), FISH)).toMatchObject({ eaten: 1 });
    });

    it("tells nothing of a species that never lived in a room restored from before the species were counted", async () => {
        const saved = {
            state: JSON.stringify({
                animals: [animal(1, "fish")],
                nextId: 2,
                totals: {
                    arrivals: 2,
                    births: 3,
                    diedOfAge: 1,
                    eaten: 0,
                    diedDry: 0,
                    predatorBirths: 0,
                    predatorDeaths: 0,
                },
            }),
        };
        const { manager, steps } = harness(saved);
        await manager.restore();
        steps(2);
        expect(manager.snapshot()?.species.map((entry) => entry.species)).toEqual([FISH]);
    });

    it("tells who lives to a player who joins right after a restart, before the first step", async () => {
        const saved = {
            state: JSON.stringify({ animals: [animal(1, "fish"), animal(2, "fish", { sex: "female" })], nextId: 3 }),
        };
        const { manager } = harness(saved);
        await manager.restore();
        expect(speciesOf(manager.snapshot(), FISH)).toMatchObject({ males: 1, females: 1 });
    });
});
