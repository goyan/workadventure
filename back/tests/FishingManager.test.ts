import { WaterGrid } from "@workadventure/map-editor";
import type { WAMFileFormat } from "@workadventure/map-editor";
import type { AquaticLifeMessage, FishingMessage, SubToPusherRoomMessage } from "@workadventure/messages";
import { describe, expect, it, vi } from "vitest";
import { AquaticLifeManager } from "../src/Model/AquaticLifeManager";
import { FishingManager } from "../src/Model/FishingManager";
import type { VariablesRepositoryInterface } from "../src/Services/Repository/VariablesRepositoryInterface";

const WAITING = 0;
const BITE = 1;
const REELING = 2;
const EVENT_BITE = 0;
const EVENT_RETRIEVED = 3;
const EVENT_REFUSED = 4;
const EVENT_CAUGHT = 5;
const EVENT_CONTEST_REFUSED = 6;
const FEMALE_FISH = 1;

const repositoryOf = (saved: Record<string, string>) =>
    ({
        loadVariables: vi.fn((_roomUrl: string) => Promise.resolve(saved)),
        saveVariable: vi.fn((_roomUrl: string, key: string, value: string) => {
            saved[key] = value;
            return Promise.resolve(1);
        }),
    }) satisfies VariablesRepositoryInterface;

/** A lake of ten cells by ten (160 px), a female fish next to (24, 24), an angler on its far shore. */
function harness(options: { savedFishing?: Record<string, string>; failing?: boolean } = {}) {
    const grid = new WaterGrid(undefined, { x: 0, y: 0, width: 10, height: 10 });
    const bytes = new Uint8Array(200);
    for (let index = 0; index < 100; index++) bytes[index * 2] = 160;
    grid.readDepths(bytes);
    const life = {
        enabled: true,
        reproductionDelay: 60,
        maxLifespan: 600,
        maxSpeed: 1.5,
        huntInterval: 30,
        dolphinReproductionDelay: 120,
        dolphinMaxLifespan: 3600,
        drinkInterval: 120,
    };
    const wam: WAMFileFormat = {
        version: "2.1.0",
        mapUrl: "map.tmj",
        areas: [],
        entityCollections: [],
        entities: {},
        settings: { life },
    };
    const clock = { now: 1_000_000 };
    const savedLife: Record<string, string> = {
        state: JSON.stringify({
            animals: [
                {
                    id: 1,
                    kind: "fish",
                    sex: "female",
                    x: 40,
                    y: 40,
                    bornAt: clock.now - 400_000,
                    lifespanMs: 600_000_000,
                    readyAt: clock.now + 600_000_000,
                },
            ],
            nextId: 2,
        }),
    };
    const savedFishing = options.savedFishing ?? {};
    const lifeSent: AquaticLifeMessage[] = [];
    const sent: FishingMessage[] = [];
    const room = {
        getWam: () => wam,
        sendSubMessageToRoom: (message: SubToPusherRoomMessage): void => {
            if (message.message?.$case === "aquaticLifeMessage") lifeSent.push(message.message.aquaticLifeMessage);
            if (message.message?.$case === "fishingMessage") sent.push(message.message.fishingMessage);
        },
    };
    const anglers = new Map<number, { x: number; y: number }>([[1, { x: 150, y: 150 }]]);
    const players = new Map<number, { key: string; name: string }>([
        [1, { key: "uuid-hugo", name: "Hugo" }],
        [2, { key: "uuid-antoine", name: "Antoine" }],
    ]);
    const fishing = new FishingManager(
        room,
        () => anglers,
        { repository: repositoryOf(savedFishing), roomUrl: "room" },
        () => clock.now,
        () => 0,
        (userId) => players.get(userId),
    );
    let seed = 7;
    const random = (): number => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x80000000;
    };
    const manager = new AquaticLifeManager(
        room,
        { getGrid: () => grid, waterVersion: () => 1 },
        { repository: repositoryOf(savedLife), roomUrl: "room" },
        () => clock.now,
        random,
        () => [...anglers.values()],
        undefined,
        undefined,
        {
            beforeStep: options.failing
                ? () => {
                      throw new Error("fishing failed");
                  }
                : (step) => fishing.beforeStep(step),
            stopped: (emptied) => fishing.lifeStopped(emptied),
        },
    );
    const steps = (count: number): void => {
        for (let step = 0; step < count; step++) {
            manager.step();
            clock.now += 500;
        }
    };
    const last = (): FishingMessage | undefined => sent[sent.length - 1];
    /** Steps until an event of this type is told, twenty seconds at most. */
    const until = (type: number): boolean => {
        for (let step = 0; step < 40; step++) {
            const before = sent.length;
            steps(1);
            if (sent.slice(before).some((message) => message.events.some((event) => event.type === type))) return true;
        }
        return false;
    };
    /** Casts at the fish of the lake, hooks it and brings it in. */
    const catchFish = (): void => {
        fishing.cast(1, 24, 24);
        if (!until(EVENT_BITE)) throw new Error("no bite");
        fishing.reel(1);
        if (!until(EVENT_CAUGHT)) throw new Error("no catch");
    };
    return {
        manager,
        fishing,
        sent,
        lifeSent,
        steps,
        last,
        until,
        catchFish,
        anglers,
        players,
        savedFishing,
        clock,
        wam,
        life,
    };
}

describe("FishingManager", () => {
    it("refuses a cast before the life of the room was seen", async () => {
        const { manager, fishing, last } = harness();
        await manager.restore();
        fishing.cast(1, 24, 24);
        expect(last()).toEqual({
            lines: [],
            events: [{ userId: 1, type: EVENT_REFUSED, grams: 0, kind: 0 }],
            caughtTotal: 0,
        });
    });

    it("puts a line in the water and tells the room", async () => {
        const { manager, fishing, steps, last } = harness();
        await manager.restore();
        steps(1);
        fishing.cast(1, 24, 24);
        expect(last()).toEqual({
            lines: [{ userId: 1, x: 24, y: 24, state: WAITING, fishId: 0 }],
            events: [],
            caughtTotal: 0,
        });
        expect(fishing.snapshot()?.lines).toHaveLength(1);
    });

    it("refuses a cast from a player who is not on the ground of the room", async () => {
        const { manager, fishing, steps, last } = harness();
        await manager.restore();
        steps(1);
        fishing.cast(2, 24, 24);
        expect(last()?.lines).toEqual([]);
        expect(last()?.events).toEqual([{ userId: 2, type: EVENT_REFUSED, grams: 0, kind: 0 }]);
    });

    it("has a fish of the map bite, be hooked, weighed and let go", async () => {
        const { manager, fishing, steps, last, until, lifeSent, savedFishing, sent } = harness();
        await manager.restore();
        steps(1);
        fishing.cast(1, 24, 24);
        expect(until(EVENT_BITE)).toBe(true);
        expect(last()?.lines).toEqual([{ userId: 1, x: 24, y: 24, state: BITE, fishId: 1 }]);
        fishing.reel(1);
        expect(last()?.lines).toEqual([{ userId: 1, x: 24, y: 24, state: REELING, fishId: 1 }]);
        expect(until(EVENT_CAUGHT)).toBe(true);
        const caught = sent.flatMap((message) => message.events).find((event) => event.type === EVENT_CAUGHT);
        expect(caught).toMatchObject({ userId: 1, kind: FEMALE_FISH });
        expect(caught?.grams).toBeGreaterThan(0);
        expect(last()).toMatchObject({ lines: [], caughtTotal: 1 });
        expect(JSON.parse(savedFishing.state)).toMatchObject({ caughtTotal: 1 });
        // Let go: it still swims.
        steps(2);
        expect(lifeSent[lifeSent.length - 1].animals.some((animal) => animal.id === 1)).toBe(true);
        // Nothing left in the water: a player who joins is still told the count.
        expect(fishing.snapshot()).toMatchObject({ lines: [], events: [], caughtTotal: 1 });
    });

    it("brings the line back when the key is pressed without a bite", async () => {
        const { manager, fishing, steps, last } = harness();
        await manager.restore();
        steps(1);
        fishing.cast(1, 150, 24);
        fishing.reel(1);
        expect(last()).toMatchObject({ lines: [], events: [{ userId: 1, type: EVENT_RETRIEVED }] });
    });

    it("brings back the line of a player who left", async () => {
        const { manager, fishing, steps, last, anglers } = harness();
        await manager.restore();
        steps(1);
        fishing.cast(1, 150, 24);
        anglers.delete(1);
        steps(1);
        expect(last()).toMatchObject({ lines: [], events: [{ userId: 1, type: EVENT_RETRIEVED }] });
    });

    it("tells nothing while nothing changes", async () => {
        const { manager, fishing, steps, sent } = harness();
        await manager.restore();
        steps(1);
        fishing.cast(1, 150, 150);
        const told = sent.length;
        // The only fish is far from this float.
        steps(2);
        expect(sent.length).toBe(told);
    });

    it("takes the lines out when the life of the map is turned off", async () => {
        const { manager, fishing, steps, last, life } = harness();
        await manager.restore();
        steps(1);
        fishing.cast(1, 24, 24);
        life.enabled = false;
        manager.mapChanged();
        expect(last()).toEqual({ lines: [], events: [], caughtTotal: 0 });
        expect(fishing.snapshot()).toBeUndefined();
        fishing.cast(1, 24, 24);
        expect(last()?.events).toEqual([{ userId: 1, type: EVENT_REFUSED, grams: 0, kind: 0 }]);
    });

    it("has nothing to tell a player who joins a room where nobody fished", () => {
        expect(harness().fishing.snapshot()).toBeUndefined();
    });

    it("brings back the count of the catches after a restart", async () => {
        const { fishing } = harness({ savedFishing: { state: JSON.stringify({ caughtTotal: 12 }) } });
        await fishing.restore();
        expect(fishing.snapshot()).toEqual({ lines: [], events: [], caughtTotal: 12 });
    });

    it("starts from nothing when what was saved cannot be read", async () => {
        const { fishing } = harness({ savedFishing: { state: "{" } });
        await fishing.restore();
        expect(fishing.snapshot()).toBeUndefined();
    });

    it("never stops the life of the room", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const { manager, steps, lifeSent } = harness({ failing: true });
        await manager.restore();
        steps(4);
        expect(lifeSent.length).toBe(2);
        expect(error).toHaveBeenCalled();
        error.mockRestore();
    });

    describe("a contest", () => {
        it("starts for the whole room, with nobody ranked yet", async () => {
            const { manager, fishing, steps, last } = harness();
            await manager.restore();
            steps(1);
            fishing.startContest(1, 3);
            expect(last()).toEqual({
                lines: [],
                events: [],
                caughtTotal: 0,
                contest: { hostName: "Hugo", minutes: 3, remainingMs: 180_000, finished: false, entries: [] },
            });
            expect(fishing.snapshot()?.contest).toMatchObject({ hostName: "Hugo", finished: false });
        });

        it("is refused while one runs, for a length that is not allowed, and before the life was seen", async () => {
            const { manager, fishing, steps, last } = harness();
            await manager.restore();
            const refused = { userId: 2, type: EVENT_CONTEST_REFUSED, grams: 0, kind: 0 };
            fishing.startContest(2, 3);
            expect(last()?.events).toEqual([refused]);
            expect(last()?.contest).toBeUndefined();
            steps(1);
            fishing.startContest(2, 4);
            expect(last()?.events).toEqual([refused]);
            expect(last()?.contest).toBeUndefined();
            fishing.startContest(1, 5);
            fishing.startContest(2, 3);
            expect(last()?.events).toEqual([refused]);
            expect(last()?.contest).toMatchObject({ hostName: "Hugo", minutes: 5 });
        });

        it("is refused to who is not in the room", async () => {
            const { manager, fishing, steps, last } = harness();
            await manager.restore();
            steps(1);
            fishing.startContest(9, 3);
            expect(last()?.contest).toBeUndefined();
        });

        it("ranks who catches a fish, and the same fish counts once", async () => {
            const { manager, fishing, steps, last, catchFish, sent, clock } = harness();
            await manager.restore();
            steps(1);
            fishing.startContest(1, 10);
            catchFish();
            const grams = sent.flatMap((message) => message.events).find((event) => event.type === EVENT_CAUGHT)?.grams;
            expect(grams).toBeGreaterThan(0);
            expect(last()?.contest?.entries).toEqual([
                { name: "Hugo", totalGrams: grams, bestGrams: grams, catches: 1, userId: 1 },
            ]);
            expect(last()?.contest?.remainingMs).toBeLessThan(600_000);
            // The fish is wary for a minute, then bites again: caught again, it adds nothing.
            clock.now += 61_000;
            steps(1);
            catchFish();
            expect(last()?.caughtTotal).toBe(2);
            expect(last()?.contest?.entries).toMatchObject([{ name: "Hugo", catches: 1 }]);
            expect(last()?.contest?.entries[0].totalGrams).toBe(grams);
        });

        it("ends on time though who started it left, and nothing of it is kept", async () => {
            const { manager, fishing, steps, last, catchFish, sent, anglers, players } = harness();
            await manager.restore();
            steps(1);
            fishing.startContest(1, 3);
            catchFish();
            anglers.delete(1);
            players.delete(1);
            const told = sent.length;
            // Three minutes, two steps a second.
            steps(360);
            const end = sent.slice(told).filter((message) => message.contest?.finished === true);
            expect(end).toHaveLength(1);
            expect(end[0].contest).toMatchObject({
                hostName: "Hugo",
                remainingMs: 0,
                finished: true,
                entries: [{ name: "Hugo", catches: 1 }],
            });
            expect(fishing.snapshot()?.contest).toBeUndefined();
            // Another one may start.
            players.set(2, { key: "uuid-antoine", name: "Antoine" });
            fishing.startContest(2, 3);
            expect(last()?.contest).toMatchObject({ hostName: "Antoine", finished: false, entries: [] });
        });

        it("ends at once when the life of the map is turned off", async () => {
            const { manager, fishing, steps, sent, life } = harness();
            await manager.restore();
            steps(1);
            fishing.startContest(1, 3);
            life.enabled = false;
            manager.mapChanged();
            expect(sent.filter((message) => message.contest?.finished === true)).toHaveLength(1);
            expect(fishing.snapshot()).toBeUndefined();
        });
    });

    describe("the record of the map", () => {
        it("is the heaviest catch, told with every message and saved", async () => {
            const { manager, fishing, steps, last, catchFish, sent, savedFishing, clock } = harness();
            await manager.restore();
            steps(1);
            catchFish();
            const grams = sent.flatMap((message) => message.events).find((event) => event.type === EVENT_CAUGHT)?.grams;
            const record = { name: "Hugo", grams, kind: FEMALE_FISH };
            expect(last()?.record).toMatchObject(record);
            // The clock of the test went one step further since the catch.
            expect(clock.now / 1000 - (last()?.record?.atSeconds ?? 0)).toBeLessThan(2);
            expect(JSON.parse(savedFishing.state)).toMatchObject({ record: { name: "Hugo", grams, female: true } });
            expect(fishing.snapshot()?.record).toMatchObject(record);
        });

        it("comes back after a restart", async () => {
            const record = { name: "Hugo", grams: 2100, female: false, at: 1_700_000_000_000 };
            const { fishing } = harness({ savedFishing: { state: JSON.stringify({ caughtTotal: 3, record }) } });
            await fishing.restore();
            expect(fishing.snapshot()).toMatchObject({
                caughtTotal: 3,
                record: { name: "Hugo", grams: 2100, kind: 0, atSeconds: 1_700_000_000 },
            });
        });
    });
});
