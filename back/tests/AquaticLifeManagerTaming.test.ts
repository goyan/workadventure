import type { Animal, LifeSettings, WAMFileFormat } from "@workadventure/map-editor";
import type { AquaticLifeMessage, SubToPusherRoomMessage } from "@workadventure/messages";
import { describe, expect, it, vi } from "vitest";
import { AquaticLifeManager } from "../src/Model/AquaticLifeManager";
import type { VariablesRepositoryInterface } from "../src/Services/Repository/VariablesRepositoryInterface";

const START = 1_000_000;
const lion = (id: number, x: number, y: number, more: Partial<Animal> = {}): Animal => ({
    id,
    kind: "lion",
    sex: "male",
    x,
    y,
    bornAt: START,
    lifespanMs: 1e12,
    // Fed: it does not hunt during the test.
    readyAt: 1e13,
    ateAt: START,
    ...more,
});

/** A map of 60 × 40 dry cells whose land is alive, with the animals given already there. */
async function harness(animals: Animal[]) {
    const settings: Partial<LifeSettings> = { enabled: false, maxSpeed: 1.5, landEnabled: true };
    const wam: WAMFileFormat = {
        version: "2.1.0",
        mapUrl: "map.tmj",
        areas: [],
        entityCollections: [],
        entities: {},
        settings: { life: settings as LifeSettings },
    };
    const saved: Record<string, string> = { state: JSON.stringify({ animals, nextId: 100 }) };
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
    const masters = new Map<number, { x: number; y: number; ground: boolean }>();
    const manager = new AquaticLifeManager(
        room,
        { getGrid: () => undefined, waterVersion: () => 1 },
        { repository, roomUrl: "room" },
        () => clock.now,
        () => 0.5,
        () => [],
        () => ({ width: 60, height: 40 }),
        (userId) => masters.get(userId),
    );
    await manager.restore();
    const steps = (count: number): void => {
        for (let step = 0; step < count; step++) {
            manager.step();
            clock.now += 500;
        }
    };
    const told = (id: number) => manager.snapshot()?.animals.find((animal) => animal.id === id);
    return { manager, sent, steps, masters, clock, told, saved, wam };
}

describe("AquaticLifeManager, taming", () => {
    it("gives a lion to the player beside it, and tells the room at once", async () => {
        const { manager, sent, steps, masters, told } = await harness([lion(1, 200, 200)]);
        masters.set(7, { x: 230, y: 200, ground: true });
        steps(1);
        const before = sent.length;
        expect(manager.tame(7, 1)).toBe(true);
        expect(sent).toHaveLength(before + 1);
        expect(sent[sent.length - 1].animals.find((animal) => animal.id === 1)?.owner).toBe(7);
        expect(told(1)?.owner).toBe(7);
    });

    it("refuses a player too far, on a raised floor or unknown, and says nothing", async () => {
        const { manager, sent, steps, masters, told } = await harness([lion(1, 200, 200)]);
        steps(1);
        const before = sent.length;
        expect(manager.tame(7, 1)).toBe(false);
        masters.set(7, { x: 700, y: 200, ground: true });
        expect(manager.tame(7, 1)).toBe(false);
        masters.set(7, { x: 210, y: 200, ground: false });
        expect(manager.tame(7, 1)).toBe(false);
        expect(sent).toHaveLength(before);
        expect(told(1)?.owner).toBeUndefined();
    });

    it("gives the lion two players ask for to the first one", async () => {
        const { manager, steps, masters, told } = await harness([lion(1, 200, 200)]);
        masters.set(7, { x: 210, y: 200, ground: true });
        masters.set(9, { x: 190, y: 200, ground: true });
        steps(1);
        expect(manager.tame(9, 1)).toBe(true);
        expect(manager.tame(7, 1)).toBe(false);
        expect(told(1)?.owner).toBe(9);
    });

    it("takes the tamed lion where its master walks, on the server too", async () => {
        const { manager, steps, masters, told } = await harness([lion(1, 200, 200)]);
        masters.set(7, { x: 210, y: 200, ground: true });
        steps(1);
        manager.tame(7, 1);
        masters.set(7, { x: 600, y: 400, ground: true });
        steps(1);
        expect(told(1)).toMatchObject({ x: 600, y: 400, owner: 7 });
    });

    it("lets a lion go where it is when its master asks, and tells the room at once", async () => {
        const { manager, sent, steps, masters, told } = await harness([lion(1, 200, 200), lion(2, 210, 200)]);
        masters.set(7, { x: 210, y: 200, ground: true });
        steps(1);
        manager.tame(7, 1);
        manager.tame(7, 2);
        masters.set(7, { x: 600, y: 400, ground: true });
        steps(1);
        const before = sent.length;
        manager.release(7, 1);
        expect(sent).toHaveLength(before + 1);
        expect(told(1)).toMatchObject({ x: 600, y: 400 });
        expect(told(1)?.owner).toBeUndefined();
        expect(told(2)?.owner).toBe(7);
        manager.release(7);
        expect(told(2)?.owner).toBeUndefined();
    });

    it("does not let a player let go the lion of another", async () => {
        const { manager, steps, masters, told } = await harness([lion(1, 200, 200)]);
        masters.set(7, { x: 210, y: 200, ground: true });
        masters.set(9, { x: 210, y: 200, ground: true });
        steps(1);
        manager.tame(7, 1);
        manager.release(9, 1);
        manager.release(9);
        expect(told(1)?.owner).toBe(7);
    });

    it("lets the lions of a player go when they leave the room", async () => {
        const { manager, steps, masters, told } = await harness([lion(1, 200, 200)]);
        masters.set(7, { x: 210, y: 200, ground: true });
        steps(1);
        manager.tame(7, 1);
        masters.delete(7);
        steps(1);
        expect(told(1)?.owner).toBeUndefined();
    });

    it("lets every animal go after a restart: a user id lasts as long as a connection", async () => {
        const { steps, masters, told } = await harness([lion(1, 200, 200, { tamedBy: 7 })]);
        // Someone else got the same id since.
        masters.set(7, { x: 600, y: 400, ground: true });
        steps(1);
        expect(told(1)).toMatchObject({ x: 200, y: 200 });
        expect(told(1)?.owner).toBeUndefined();
    });

    it("answers a player five times a second at most", async () => {
        const lions = Array.from({ length: 4 }, (_, index) => lion(index + 1, 200, 200));
        const { manager, steps, masters, clock } = await harness(lions);
        masters.set(7, { x: 210, y: 200, ground: true });
        steps(1);
        // Too far: refused, and counted.
        masters.set(7, { x: 900, y: 200, ground: true });
        for (let ask = 0; ask < 5; ask++) expect(manager.tame(7, 1)).toBe(false);
        masters.set(7, { x: 210, y: 200, ground: true });
        expect(manager.tame(7, 1)).toBe(false);
        clock.now += 1000;
        expect(manager.tame(7, 1)).toBe(true);
    });

    it("keeps a tamed lion alive for hours, hungry as it was when it is let go", async () => {
        const { manager, steps, masters, told } = await harness([
            lion(1, 200, 200, { lifespanMs: 60_000, readyAt: START }),
        ]);
        masters.set(7, { x: 210, y: 200, ground: true });
        manager.tame(7, 1);
        steps(2 * 3600);
        expect(told(1)?.owner).toBe(7);
        manager.release(7);
        steps(2);
        expect(told(1)).toBeDefined();
    });
});

describe("AquaticLifeManager, the animals of the land for the sensors", () => {
    it("tells where the animals of the land are", async () => {
        const { manager } = await harness([lion(1, 200, 300)]);
        expect(manager.landAnimals()).toEqual([{ x: 200, y: 300 }]);
    });
});
