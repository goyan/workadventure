import {
    boundedFireConditions,
    DEFAULT_FIRE_THRESHOLDS,
    fireDanger,
    NEUTRAL_FIRE_CONDITIONS,
} from "@workadventure/map-editor";
import type { Ball, Downpour, Drain, RealWeatherSlot, WAMFileFormat } from "@workadventure/map-editor";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InlineRoomGround } from "../src/Model/Ground/InlineRoomGround";
import type { RoomGround, RoomGroundInputs } from "../src/Model/Ground/RoomGround";
import { MeadowManager } from "../src/Model/MeadowManager";
import { TerrainWaterManager } from "../src/Model/TerrainWaterManager";
import { groundWam, GROUND_MAP_CELLS, GROUND_NOW, groundSlots, seededLuck } from "./helpers/GroundScenario";

/** What a ground did that the room and the store can see: what it told, what it saved. */
interface Seen {
    told: string[];
    saved: string[];
}

/** The room of a ground, with catastrophes the test moves. */
function world(wam: WAMFileFormat, stored: Record<string, Record<string, string>> = {}) {
    const seen: Seen = { told: [], saved: [] };
    const state = {
        downpours: [] as Downpour[],
        drains: [] as Drain[],
        balls: [] as Ball[],
        air: { temperature: 1, humidity: 85 } as { temperature: number; humidity: number } | undefined,
    };
    const fire = () =>
        boundedFireConditions({ temperature: 1, humidity: 85, windSpeed: 20, windFrom: 270 }, NEUTRAL_FIRE_CONDITIONS);
    const inputs: RoomGroundInputs = {
        room: {
            getWam: () => wam,
            sendSubMessageToRoom: (message) => {
                seen.told.push(
                    JSON.stringify(message, (_key, value: unknown) =>
                        value instanceof Uint8Array ? Buffer.from(value).toString("base64") : value,
                    ),
                );
            },
        },
        rain: {
            slotsFor: () => groundSlots(GROUND_NOW),
            history: () => Promise.resolve(groundSlots(GROUND_NOW - 6 * 3600_000, 30)),
        },
        store: {
            roomUrl: "room",
            repository: {
                loadVariables: (key: string) => Promise.resolve(key in stored ? stored[key] : {}),
                saveVariable: (key: string, field: string, value: string) => {
                    seen.saved.push(`${key}|${field}|${value}`);
                    return Promise.resolve(0);
                },
            },
        },
        mapSize: () => GROUND_MAP_CELLS,
        walkers: () => [{ x: 300, y: 300 }],
        downpours: () => state.downpours,
        drains: () => state.drains,
        balls: () => state.balls,
        grazers: () => [{ x: 100, y: 600 }],
        air: () => state.air,
        fire,
        thresholds: () => DEFAULT_FIRE_THRESHOLDS,
        now: () => Date.now(),
        clock: () => 0,
        random: seededLuck(),
    };
    return { seen, state, inputs };
}

/**
 * The ground of a room wired by hand, as GameRoom wired it before the grounds: the same water and the same meadow,
 * the same calls in the same order.
 */
async function byHand(inputs: RoomGroundInputs): Promise<RoomGround> {
    const water = new TerrainWaterManager(
        inputs.room,
        inputs.rain,
        inputs.store,
        inputs.now,
        () => inputs.mapSize(),
        inputs.clock,
    );
    water.setDownpours(() => inputs.downpours());
    water.setDrains(() => inputs.drains());
    water.setBalls(() => inputs.balls());
    water.setWalkers(() => inputs.walkers());
    await water.restore();
    water.start();
    water.fallThrough(() => inputs.air());
    const meadow = new MeadowManager(
        inputs.room,
        inputs.rain,
        () => water.getGrid(),
        inputs.store,
        inputs.now,
        () => inputs.mapSize(),
        () => inputs.grazers(),
        () => {
            const conditions = inputs.fire();
            return {
                danger: fireDanger(conditions, inputs.thresholds()),
                windFrom: conditions.windFrom,
                windSpeed: conditions.windSpeed,
            };
        },
        inputs.random,
    );
    meadow.fallThrough(() => inputs.air());
    meadow.snowUnder(() => {
        const air = inputs.air();
        return air ? { ...air, windSpeed: inputs.fire().windSpeed } : undefined;
    });
    meadow.pourWith(water.pour.bind(water));
    meadow.liveAlong(water.liveAgain.bind(water));
    meadow.catchUpWith(
        (place, since) => inputs.rain.history(place, since),
        (slot: RealWeatherSlot) => {
            const conditions = boundedFireConditions(
                {
                    temperature: slot.temperature ?? undefined,
                    humidity: slot.humidity,
                    windSpeed: slot.windSpeed,
                    windFrom: slot.windFrom,
                },
                NEUTRAL_FIRE_CONDITIONS,
            );
            const air =
                slot.temperature !== null && slot.humidity !== undefined
                    ? { temperature: slot.temperature, humidity: slot.humidity }
                    : undefined;
            return {
                air,
                snow: air ? { ...air, windSpeed: conditions.windSpeed } : undefined,
                fire: {
                    danger: fireDanger(conditions, inputs.thresholds()),
                    windFrom: conditions.windFrom,
                    windSpeed: conditions.windSpeed,
                },
            };
        },
    );
    await meadow.restore();
    meadow.start();
    return {
        startWater: () => Promise.resolve(),
        startMeadow: () => Promise.resolve(),
        stop: () => {
            water.stop();
            meadow.stop();
        },
        mapChanged: () => {
            water.mapChanged();
            meadow.mapChanged();
        },
        strike: (x, y, radiusTiles) => {
            water.strike(x, y, radiusTiles);
            meadow.shatter(x, y, radiusTiles);
        },
        burn: (x, y, radiusTiles, id) => {
            water.vaporise(x, y, radiusTiles);
            meadow.scorch(x, y, radiusTiles, id);
        },
        shatter: meadow.shatter.bind(meadow),
        soak: meadow.soak.bind(meadow),
        ignite: (x, y, radiusTiles) => {
            meadow.ignite(x, y, radiusTiles);
        },
        ballLevelAt: water.ballLevelAt.bind(water),
        getGrid: () => water.getGrid(),
        waterVersion: () => water.waterVersion(),
        lifeFire: () => meadow.lifeFire(),
        iceAt: (tileX, tileY) => meadow.iceAt(tileX, tileY),
        hasMeadow: () => meadow.hasMeadow(),
        catchingUp: () => meadow.catchingUp(),
        waterSnapshot: () => water.snapshot(),
        meadowSnapshot: () => meadow.snapshot(),
        treeSnapshot: () => meadow.treeSnapshot(),
    };
}

/** A minute and a half of a room: rain and snow, a source, the drain of a building, and every catastrophe. */
async function live(ground: RoomGround, state: ReturnType<typeof world>["state"]): Promise<number[]> {
    const levels: number[] = [];
    for (let tenth = 0; tenth < 900; tenth++) {
        if (tenth === 100) state.downpours = [{ id: 1, x: 200, y: 200, radiusTiles: 4, wholeMap: false }];
        if (tenth === 110) ground.soak(state.downpours[0]);
        if (tenth === 200) state.downpours = [];
        if (tenth === 220) ground.strike(190, 190, 2);
        if (tenth === 300) state.balls = [{ id: 7, x: 180, y: 180, radiusPx: 40 }];
        if (tenth > 300 && tenth < 400) {
            state.balls = [
                {
                    id: 7,
                    x: 180 + (tenth - 300),
                    y: 180,
                    radiusPx: 40,
                    levelPx: ground.ballLevelAt(7, 180 + (tenth - 300), 180),
                },
            ];
            levels.push(state.balls[0].levelPx ?? 0);
        }
        if (tenth === 400) state.balls = [];
        if (tenth === 420) state.drains = [{ id: 3, x: 220, y: 220, radiusTiles: 2 }];
        if (tenth === 480) state.drains = [];
        if (tenth === 500) ground.ignite(600, 150, 2);
        if (tenth === 560) ground.burn(240, 240, 2, 9);
        if (tenth === 640) ground.shatter(200, 200, 3);
        if (tenth === 700) state.air = { temperature: 12, humidity: 60 };
        if (tenth === 760) ground.mapChanged();
        // One tenth of a second after the other: what happens at each is the point.
        // eslint-disable-next-line no-await-in-loop
        await vi.advanceTimersByTimeAsync(100);
    }
    return levels;
}

describe("the ground of a room behind its door (RoomGround)", () => {
    beforeEach(() => {
        vi.useFakeTimers({ now: GROUND_NOW });
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it("does on the thread of the rooms exactly what the room did by hand: same states told, same saves", async () => {
        const hand = world(groundWam());
        const reference = await byHand(hand.inputs);
        const handLevels = await live(reference, hand.state);
        reference.stop();

        // The same instant again for the other ground: both read the same clock.
        vi.setSystemTime(GROUND_NOW);
        const inline = world(groundWam());
        const ground = new InlineRoomGround(inline.inputs);
        await ground.startWater();
        await ground.startMeadow();
        const levels = await live(ground, inline.state);
        ground.stop();

        // The scenario does what it says: water told often, the meadow too, both saved.
        expect(hand.seen.told.length).toBeGreaterThan(100);
        expect(hand.seen.told.some((told) => told.includes("meadowMessage"))).toBe(true);
        expect(hand.seen.saved.some((saved) => saved.startsWith("terrain-water:room|grid|"))).toBe(true);
        expect(hand.seen.saved.some((saved) => saved.startsWith("meadow:room|ice|"))).toBe(true);
        expect(levels).toEqual(handLevels);
        expect(inline.seen.told).toEqual(hand.seen.told);
        expect(inline.seen.saved).toEqual(hand.seen.saved);
        expect(ground.waterSnapshot()).toEqual(reference.waterSnapshot());
        expect(ground.meadowSnapshot()).toEqual(reference.meadowSnapshot());
        expect(ground.treeSnapshot()).toEqual(reference.treeSnapshot());
        // What the ice fishing shacks read: the ice of each tile, and whether the meadow is made.
        const iceOf = (read: RoomGround): number[] =>
            Array.from({ length: 24 * 24 }, (_, tile) => read.iceAt(tile % 24, Math.floor(tile / 24)));
        expect(iceOf(ground)).toEqual(iceOf(reference));
        expect(ground.hasMeadow()).toBe(true);
        expect(ground.catchingUp()).toBe(reference.catchingUp());
    });

    it("keeps the floor of a building dry through its drain, as before (the sinks that dry a floor)", async () => {
        const { inputs, state } = world(groundWam());
        const ground = new InlineRoomGround(inputs);
        await ground.startWater();
        await ground.startMeadow();
        state.downpours = [{ id: 1, x: 0, y: 0, radiusTiles: 4, wholeMap: true }];
        await vi.advanceTimersByTimeAsync(3000);
        const grid = ground.getGrid();
        // A cell of the floor the drain stands on, and one of the ground outside under the same downpour.
        expect(grid?.depthAt(34, 34)).toBe(0);
        expect(grid?.depthAt(44, 10)).toBeGreaterThan(0);
        ground.stop();
    });

    it("lives the time a room missed as before: the meadow and its water catch up alike", async () => {
        const first = world(groundWam());
        const before = new InlineRoomGround(first.inputs);
        await before.startWater();
        await before.startMeadow();
        await vi.advanceTimersByTimeAsync(40_000);
        before.stop();
        const stored: Record<string, Record<string, string>> = {};
        for (const saved of first.seen.saved) {
            const [key, field, value] = saved.split("|");
            (stored[key] ??= {})[field] = value;
        }
        // Three hours later the room opens again.
        const later = GROUND_NOW + 40_000 + 3 * 3600_000;
        vi.setSystemTime(later);
        const hand = world(groundWam(), stored);
        const reference = await byHand(hand.inputs);
        await vi.advanceTimersByTimeAsync(20_000);
        reference.stop();

        vi.setSystemTime(later);
        const inline = world(groundWam(), stored);
        const ground = new InlineRoomGround(inline.inputs);
        await ground.startWater();
        await ground.startMeadow();
        await vi.advanceTimersByTimeAsync(20_000);
        ground.stop();

        expect(hand.seen.told.length).toBeGreaterThan(5);
        expect(inline.seen.told).toEqual(hand.seen.told);
        expect(inline.seen.saved).toEqual(hand.seen.saved);
    });
});
