import { gunzipSync } from "node:zlib";
import { DEFAULT_WATER_SETTINGS, WeatherType } from "@workadventure/map-editor";
import type { PrecipitationAir, SnowWeather, WAMFileFormat } from "@workadventure/map-editor";
import type { MeadowMessage, SubToPusherRoomMessage } from "@workadventure/messages";
import { describe, expect, it, vi } from "vitest";
import { MeadowManager } from "../src/Model/MeadowManager";
import type { VariablesRepositoryInterface } from "../src/Services/Repository/VariablesRepositoryInterface";

type Settings = NonNullable<WAMFileFormat["settings"]>;

function wamWith(
    weather: WeatherType,
    meadow?: Settings["meadow"],
    weatherLocation?: Settings["weatherLocation"],
): WAMFileFormat {
    return {
        version: "2.1.0",
        mapUrl: "map.tmj",
        areas: [],
        entityCollections: [],
        entities: {},
        settings: weatherLocation ? { weather, meadow, weatherLocation } : { weather, meadow },
    };
}

const SYDNEY = { name: "Sydney", latitude: -33.87, longitude: 151.21, timezone: "Australia/Sydney" };

function createHarness({
    weather = WeatherType.Rain,
    saved = {},
    mapSize = () => ({ width: 16, height: 8 }),
    // A summer noon in Paris: the grass grows.
    now = Date.UTC(2026, 6, 14, 10),
    meadow = undefined as NonNullable<WAMFileFormat["settings"]>["meadow"],
    grazers = undefined as (() => { x: number; y: number }[]) | undefined,
    danger = undefined as (() => number) | undefined,
    wind = { windFrom: 0, windSpeed: 0 },
    random = () => 1,
    place = undefined as Settings["weatherLocation"],
    water = undefined as (() => { depthAt(cellX: number, cellY: number): number } | undefined) | undefined,
    waterSpeed = undefined as number | undefined,
}: {
    /** The speed of the water of the map, and with it the clock of its snow and its ice (none: reality). */
    waterSpeed?: number;
    water?: () => { depthAt(cellX: number, cellY: number): number } | undefined;
    place?: Settings["weatherLocation"];
    danger?: () => number;
    wind?: { windFrom: number; windSpeed: number };
    random?: () => number;
    grazers?: () => { x: number; y: number }[];
    meadow?: NonNullable<WAMFileFormat["settings"]>["meadow"];
    weather?: WeatherType;
    saved?: Record<string, string>;
    mapSize?: () => { width: number; height: number } | undefined;
    now?: number;
} = {}) {
    const sent: MeadowMessage[] = [];
    const store: Record<string, string> = { ...saved };
    const repository = {
        loadVariables: vi.fn((_key: string) => Promise.resolve(store)),
        saveVariable: vi.fn((_key: string, field: string, value: string) => {
            store[field] = value;
            return Promise.resolve(1);
        }),
    } satisfies VariablesRepositoryInterface;
    const wam = wamWith(weather, meadow, place);
    if (waterSpeed !== undefined)
        wam.settings = { ...wam.settings, water: { ...DEFAULT_WATER_SETTINGS, speed: waterSpeed } };
    const room = {
        getWam: () => wam,
        sendSubMessageToRoom: (message: SubToPusherRoomMessage): void => {
            if (message.message?.$case === "meadowMessage") sent.push(message.message.meadowMessage);
        },
    };
    const manager = new MeadowManager(
        room,
        { slotsFor: vi.fn(() => undefined) },
        water ?? (() => undefined),
        { repository, roomUrl: "room" },
        () => now,
        mapSize,
        grazers,
        () => ({ danger: danger?.() ?? 0, ...wind }),
        random,
    );
    const steps = (count: number): void => {
        for (let step = 0; step < count; step++) manager.step();
    };
    return { manager, sent, store, steps, wam };
}

const grassOf = (message: MeadowMessage): Uint8Array => new Uint8Array(gunzipSync(message.grass));
const drynessOf = (message: MeadowMessage): Uint8Array => new Uint8Array(gunzipSync(message.dryness));
const fireOf = (message: MeadowMessage): Uint8Array => new Uint8Array(gunzipSync(message.fire));
const ashOf = (message: MeadowMessage): Uint8Array => new Uint8Array(gunzipSync(message.ash));

describe("MeadowManager", () => {
    it("does nothing until the size of the map is read", () => {
        const { manager, sent, steps } = createHarness({ mapSize: () => undefined });
        manager.mapChanged();
        steps(50);
        expect(sent).toEqual([]);
        expect(manager.snapshot()).toBeUndefined();
        manager.stop();
    });

    it("grows grass from sunrise to sunset, as the day and night of the game: at 6 in Paris in June too", () => {
        // June 21, 4:00 UTC: 6:00 in Paris, the sun is up (it rose at 5:47); the grass grows.
        const dawn = createHarness({ now: Date.UTC(2026, 5, 21, 4) });
        dawn.manager.mapChanged();
        dawn.steps(400);
        expect(grassOf(dawn.sent[dawn.sent.length - 1]).some((cover) => cover > 0)).toBe(true);
        dawn.manager.stop();
        // October 21, 6:00 UTC: 8:00 in Paris, before sunrise (8:24): nothing grows yet.
        const autumnDawn = createHarness({ now: Date.UTC(2026, 9, 21, 6) });
        autumnDawn.manager.mapChanged();
        autumnDawn.steps(400);
        const told = autumnDawn.sent;
        expect(told.length === 0 || grassOf(told[told.length - 1]).every((cover) => cover === 0)).toBe(true);
        autumnDawn.manager.stop();
    });

    it("grows grass in the summer of the place: in January in Sydney, not in its winter of July", () => {
        // January 15, 2:00 UTC: 13:00 in Sydney, a summer noon; in Paris a winter night.
        const summer = createHarness({ place: SYDNEY, now: Date.UTC(2026, 0, 15, 2) });
        summer.manager.mapChanged();
        summer.steps(400);
        expect(grassOf(summer.sent[summer.sent.length - 1]).some((cover) => cover > 0)).toBe(true);
        summer.manager.stop();
        // July 15, 2:00 UTC: noon in Sydney, in its winter: the grass sleeps.
        const winter = createHarness({ place: SYDNEY, now: Date.UTC(2026, 6, 15, 2) });
        winter.manager.mapChanged();
        winter.steps(400);
        const told = winter.sent;
        expect(told.length === 0 || grassOf(told[told.length - 1]).every((cover) => cover === 0)).toBe(true);
        winter.manager.stop();
        // A winter noon in Paris: nothing grows, as before.
        const paris = createHarness({ now: Date.UTC(2026, 0, 15, 11) });
        paris.manager.mapChanged();
        paris.steps(400);
        const parisTold = paris.sent;
        expect(parisTold.length === 0 || grassOf(parisTold[parisTold.length - 1]).every((cover) => cover === 0)).toBe(
            true,
        );
        paris.manager.stop();
    });

    it("grows no grass at 7:30 in Paris in November, before sunrise, and grows it at noon", () => {
        // November 21, 6:30 UTC: 7:30 in Paris, inside the old 7 to 19 window but before the 8:08 sunrise.
        const early = createHarness({ now: Date.UTC(2026, 10, 21, 6, 30) });
        early.manager.mapChanged();
        early.steps(400);
        const told = early.sent;
        expect(told.length === 0 || grassOf(told[told.length - 1]).every((cover) => cover === 0)).toBe(true);
        early.manager.stop();
        // Same day, 11:00 UTC: noon in Paris.
        const noon = createHarness({ now: Date.UTC(2026, 10, 21, 11) });
        noon.manager.mapChanged();
        noon.steps(400);
        expect(grassOf(noon.sent[noon.sent.length - 1]).some((cover) => cover > 0)).toBe(true);
        noon.manager.stop();
    });

    it("grows grass under the rain of the map, by tiles, and tells the room when it changed", () => {
        // 16 × 8 cells of the relief: 8 × 4 tiles.
        const { manager, sent, steps } = createHarness();
        manager.mapChanged();
        steps(400);
        expect(sent.length).toBeGreaterThan(1);
        const last = sent[sent.length - 1];
        expect(last.width).toBe(8);
        expect(last.height).toBe(4);
        const grass = grassOf(last);
        expect(grass).toHaveLength(32);
        expect(grass.every((cover) => cover > 0)).toBe(true);
        // A player who joins is given the same state.
        expect(grassOf(manager.snapshot() ?? last)).toEqual(grass);
        manager.stop();
    });

    it("leaves the soil dry under a rain that falls as snow in the cold of the room", () => {
        const snowy = createHarness();
        snowy.manager.fallThrough(() => ({ temperature: -2, humidity: 80 }));
        snowy.manager.mapChanged();
        snowy.steps(400);
        // Nothing soaked the soil: no grass, a dry ground. The room is told the snow that lies on it instead.
        expect(snowy.sent.length).toBeGreaterThan(0);
        for (const message of snowy.sent) {
            expect(grassOf(message).every((cover) => cover === 0)).toBe(true);
            expect(new Uint8Array(gunzipSync(message.moisture)).every((moisture) => moisture === 0)).toBe(true);
            expect(message.snow.length).toBeGreaterThan(0);
        }
        snowy.manager.stop();
        // The same rain in mild air grows the grass.
        const mild = createHarness();
        mild.manager.fallThrough(() => ({ temperature: 20, humidity: 60 }));
        mild.manager.mapChanged();
        mild.steps(400);
        expect(grassOf(mild.sent[mild.sent.length - 1]).every((cover) => cover > 0)).toBe(true);
        mild.manager.stop();
    });

    it("keeps the water of a soil frozen by the cold of the room, and dries it in a milder air", () => {
        const moistureOf = (message: MeadowMessage): Uint8Array => new Uint8Array(gunzipSync(message.moisture));
        const after = (temperature: number): { moisture: Uint8Array; wet: Uint8Array; grass: Uint8Array } => {
            let air = { temperature: 20, humidity: 60 };
            const harness = createHarness();
            harness.manager.fallThrough(() => air);
            harness.manager.mapChanged();
            // A rain in mild air wets the soil and grows the grass, then the sky clears and the air turns.
            harness.steps(400);
            const wet = harness.manager.snapshot();
            if (!wet) throw new Error("no meadow");
            harness.wam.settings = { ...harness.wam.settings, weather: WeatherType.Clear };
            air = { temperature, humidity: 60 };
            harness.steps(900);
            const now = harness.manager.snapshot();
            harness.manager.stop();
            if (!now) throw new Error("no meadow");
            return { moisture: moistureOf(now), wet: moistureOf(wet), grass: grassOf(now) };
        };
        const frozen = after(-5);
        // Half an hour of frost: not a drop lost, and the grass is still there.
        expect(frozen.moisture).toEqual(frozen.wet);
        expect(frozen.grass.every((cover) => cover > 0)).toBe(true);
        const mild = after(5);
        expect(mild.moisture.every((moisture, index) => moisture < mild.wet[index])).toBe(true);
    });

    it("says nothing of a dry and bare map, nor twice the same state", () => {
        const dry = createHarness({ weather: WeatherType.Clear });
        dry.manager.mapChanged();
        dry.steps(100);
        expect(dry.sent).toEqual([]);
        expect(dry.manager.snapshot()).toBeUndefined();
        dry.manager.stop();
        // By night nothing grows: once the soil is wet through, the state stops changing.
        const night = createHarness({ now: Date.UTC(2026, 6, 14, 1) });
        night.manager.mapChanged();
        night.steps(3000);
        const told = night.sent.length;
        night.steps(100);
        expect(night.sent.length).toBe(told);
        expect(grassOf(night.sent[told - 1]).every((cover) => cover === 0)).toBe(true);
        night.manager.stop();
    });

    it("dries the grass by the danger of the room, and tells the room how dry it is", () => {
        // Grass first, under the rain; then the rain stops and the danger is at its highest.
        const danger = { now: 0 };
        const { manager, sent, steps, wam } = createHarness({ danger: () => danger.now });
        manager.mapChanged();
        steps(400);
        expect(drynessOf(sent[sent.length - 1]).every((dryness) => dryness === 0)).toBe(true);
        if (!wam.settings) throw new Error("no settings");
        wam.settings.weather = WeatherType.Clear;
        danger.now = 1;
        // The soil dries, the grass with it, until it dies of thirst: its driest is seen on the way.
        let driest = 0;
        for (let spell = 0; spell < 40; spell++) {
            steps(50);
            const last = sent[sent.length - 1];
            expect(drynessOf(last)).toHaveLength(32);
            expect(drynessOf(manager.snapshot() ?? last)).toEqual(drynessOf(last));
            driest = Math.max(driest, ...drynessOf(last));
        }
        expect(driest).toBeGreaterThan(128);
        manager.stop();
    });

    it("sets a patch of fire where a player asks, and tells the room at each step while it burns", () => {
        // Grass first, under the rain; then a dry spell, and a patch of fire on the tile (2, 1).
        const { manager, sent, steps, wam } = createHarness();
        manager.mapChanged();
        steps(400);
        if (!wam.settings) throw new Error("no settings");
        wam.settings.weather = WeatherType.Clear;
        // The soil dries out before anything burns on it.
        steps(150);
        const before = sent.length;
        expect(manager.ignite(2 * 32 + 5, 1 * 32 + 5, 0)).toBe(1);
        steps(1);
        expect(sent.length).toBe(before + 1);
        expect(fireOf(sent[sent.length - 1])[1 * 8 + 2]).toBeGreaterThan(0);
        steps(3);
        expect(sent.length).toBe(before + 4);
        // Burnt through: a last message says so, then the meadow is told every ten seconds again.
        steps(20);
        const last = sent[sent.length - 1];
        expect(fireOf(last).every((fire) => fire === 0)).toBe(true);
        // Burnt through; a blade of grass may already be growing back over the ash.
        expect(ashOf(last)[1 * 8 + 2]).toBeGreaterThan(200);
        expect(fireOf(manager.snapshot() ?? last)).toEqual(fireOf(last));
        const settled = sent.length;
        steps(4);
        expect(sent.length - settled).toBeLessThanOrEqual(1);
        manager.stop();
    });

    it("gives the fire the wind and the luck of the room: it spreads downwind", () => {
        const { manager, sent, steps, wam } = createHarness({
            // The air dries the ground; this luck spreads the fire downwind only, and starts none by itself.
            danger: () => 1,
            wind: { windFrom: 270, windSpeed: 60 },
            random: () => 0.05,
        });
        manager.mapChanged();
        steps(400);
        if (!wam.settings) throw new Error("no settings");
        wam.settings.weather = WeatherType.Clear;
        steps(150);
        manager.ignite(2 * 32 + 5, 1 * 32 + 5, 0);
        steps(6);
        const fire = fireOf(sent[sent.length - 1]);
        const ash = ashOf(sent[sent.length - 1]);
        // The wind blows east: the tile to the east took fire, the one to the west did not.
        expect(fire[1 * 8 + 3] + ash[1 * 8 + 3]).toBeGreaterThan(0);
        expect(fire[1 * 8 + 1] + ash[1 * 8 + 1]).toBe(0);
        manager.stop();
    });

    it("keeps the ash across a restart, not the fire", async () => {
        const first = createHarness();
        first.manager.mapChanged();
        first.steps(400);
        if (!first.wam.settings) throw new Error("no settings");
        first.wam.settings.weather = WeatherType.Clear;
        first.steps(150);
        first.manager.ignite(2 * 32 + 5, 1 * 32 + 5, 0);
        first.steps(30);
        first.manager.ignite(5 * 32 + 5, 2 * 32 + 5, 0);
        first.steps(1);
        first.manager.stop();
        const second = createHarness({ saved: first.store, weather: WeatherType.Clear, now: Date.UTC(2026, 6, 14, 1) });
        await second.manager.restore();
        second.manager.mapChanged();
        second.steps(5);
        const told = second.sent[second.sent.length - 1];
        expect(ashOf(told)[1 * 8 + 2]).toBeGreaterThan(200);
        expect(fireOf(told).every((fire) => fire === 0)).toBe(true);
        second.manager.stop();
    });

    it("burns the crater of a fireball on green grass under the rain, and leaves its ground dry", () => {
        const { manager, sent, steps } = createHarness({ mapSize: () => ({ width: 80, height: 80 }) });
        manager.mapChanged();
        steps(400);
        steps(1);
        const green = drynessOf(sent[sent.length - 1])[20 * 40 + 20];
        expect(manager.scorch(20 * 32 + 5, 20 * 32 + 5, 2, 7)).toBeGreaterThanOrEqual(13);
        steps(1);
        const last = sent[sent.length - 1];
        expect(fireOf(last)[20 * 40 + 20]).toBeGreaterThan(0);
        expect(fireOf(last)[20 * 40 + 22]).toBeGreaterThan(0);
        expect(drynessOf(last)[20 * 40 + 20]).toBeGreaterThan(green);
        expect(drynessOf(last)[20 * 40 + 20]).toBeGreaterThan(200);
    });

    it("lights dry grass around the crater of a fireball where its embers land", () => {
        const { manager, steps, wam } = createHarness({ mapSize: () => ({ width: 80, height: 80 }) });
        manager.mapChanged();
        steps(400);
        if (!wam.settings) throw new Error("no settings");
        wam.settings.weather = WeatherType.Clear;
        steps(150);
        expect(manager.scorch(20 * 32 + 5, 20 * 32 + 5, 2, 7)).toBeGreaterThan(13);
    });

    it("burns nothing for a fireball on a map without a meadow, nor on one that turned it off", () => {
        const none = createHarness({ mapSize: () => undefined });
        none.manager.mapChanged();
        expect(none.manager.scorch(10, 10, 2, 1)).toBe(0);
        const off = createHarness({ meadow: { enabled: false, growMinutes: 10, thirstMinutes: 20, moistureHold: 1 } });
        off.manager.mapChanged();
        off.steps(5);
        expect(off.manager.scorch(10, 10, 2, 1)).toBe(0);
        off.manager.stop();
    });

    it("lights nothing on a map without a meadow, nor on one that turned it off", () => {
        const none = createHarness({ mapSize: () => undefined });
        none.manager.mapChanged();
        expect(none.manager.ignite(10, 10, 2)).toBe(0);
        const off = createHarness({ meadow: { enabled: false, growMinutes: 10, thirstMinutes: 20, moistureHold: 1 } });
        off.manager.mapChanged();
        off.steps(5);
        expect(off.manager.ignite(10, 10, 2)).toBe(0);
        off.manager.stop();
    });

    it("keeps its meadow across a restart", async () => {
        const first = createHarness();
        first.manager.mapChanged();
        first.steps(400);
        first.manager.stop();
        const before = grassOf(first.sent[first.sent.length - 1]);
        const second = createHarness({ saved: first.store, weather: WeatherType.Clear, now: Date.UTC(2026, 6, 14, 1) });
        await second.manager.restore();
        second.manager.mapChanged();
        second.steps(5);
        expect(second.sent).toHaveLength(1);
        const after = grassOf(second.sent[0]);
        expect(after[0]).toBeGreaterThan(0);
        expect(Math.abs(after[0] - before[0])).toBeLessThanOrEqual(2);
        second.manager.stop();
    });

    it("gives the meadow it restored to the first player, before its first step", async () => {
        const first = createHarness();
        first.manager.mapChanged();
        first.steps(400);
        first.manager.stop();
        const before = grassOf(first.sent[first.sent.length - 1]);
        const second = createHarness({ saved: first.store });
        await second.manager.restore();
        second.manager.mapChanged();
        const snapshot = second.manager.snapshot();
        expect(second.sent).toEqual([]);
        expect(snapshot && grassOf(snapshot)).toEqual(before);
        second.manager.stop();
    });

    it("lives the time the room was empty when it opens again, a slice at each step", async () => {
        const first = createHarness();
        first.manager.mapChanged();
        first.steps(30);
        first.manager.stop();
        expect(Number(first.store.at)).toBe(Date.UTC(2026, 6, 14, 10));
        const before = new Uint8Array(gunzipSync(Buffer.from(first.store.grass, "base64")));
        // A day later, by the same summer rain: the meadow lives that day before the step of now.
        const second = createHarness({ saved: first.store, now: Date.UTC(2026, 6, 15, 10) });
        // The water of the relief lives the same day along with it, told when the meadow caught up.
        const along: { seconds: number; last: boolean }[] = [];
        second.manager.liveAlong((seconds, _rain, last) => along.push({ seconds, last }));
        await second.manager.restore();
        second.manager.mapChanged();
        expect(second.manager.catchingUp()).toBe(true);
        second.steps(12);
        expect(second.manager.catchingUp()).toBe(false);
        expect(along.reduce((total, slice) => total + slice.seconds, 0)).toBeCloseTo(24 * 3600, 0);
        expect(along.filter((slice) => slice.last)).toHaveLength(1);
        expect(along.at(-1)?.last).toBe(true);
        const snapshot = second.manager.snapshot();
        const sum = (cells: Uint8Array): number => cells.reduce((total, cell) => total + cell, 0);
        expect(snapshot && sum(grassOf(snapshot))).toBeGreaterThan(sum(before));
        second.manager.stop();
    });

    it("lives the time missed a few slices at a time when they take long, and ends on the very same meadow", async () => {
        const first = createHarness();
        first.manager.mapChanged();
        first.steps(30);
        first.manager.stop();
        // Three days later. One room lives them by ticks of all their slices, as a fast server does; the other one
        // has a clock that says each slice takes 2 ms: its ticks stop at the budget of 8 ms, four slices in.
        const wake = async (slow: boolean) => {
            const room = createHarness({ saved: first.store, now: Date.UTC(2026, 6, 17, 10) });
            const along: { seconds: number; rain: number; last: boolean }[] = [];
            room.manager.liveAlong((seconds, rain, last) => along.push({ seconds, rain, last }));
            let clock = 0;
            room.manager.timeCatchUpWith(() => (slow ? (clock += 2) : 0));
            await room.manager.restore();
            room.manager.mapChanged();
            let ticks = 0;
            let longest = 0;
            while (room.manager.catchingUp()) {
                const before = along.length;
                room.steps(1);
                longest = Math.max(longest, along.length - before);
                ticks++;
            }
            room.manager.stop();
            return { along, ticks, longest, store: room.store, sent: room.sent.length };
        };
        const fast = await wake(false);
        const slow = await wake(true);
        // Three days by slices of 120 s: 2160 of them, 150 a tick or four a tick.
        expect(fast.along).toHaveLength(2160);
        expect(fast.longest).toBe(150);
        expect(fast.ticks).toBe(15);
        expect(slow.longest).toBe(4);
        // 540 ticks of four slices, and a few ticks that only tell the room.
        expect(slow.ticks).toBeGreaterThanOrEqual(540);
        expect(slow.ticks).toBeLessThan(560);
        expect(slow.along).toStrictEqual(fast.along);
        expect(slow.store).toStrictEqual(fast.store);
        // The room is not told at each of the short ticks.
        expect(slow.sent).toBeLessThan(slow.ticks / 10);
    });

    it("does not catch up a meadow saved without its time", async () => {
        const first = createHarness();
        first.manager.mapChanged();
        first.steps(30);
        first.manager.stop();
        const withoutTime = Object.fromEntries(Object.entries(first.store).filter(([field]) => field !== "at"));
        const second = createHarness({ saved: withoutTime, now: Date.UTC(2026, 6, 15, 10) });
        await second.manager.restore();
        second.manager.mapChanged();
        expect(second.manager.catchingUp()).toBe(false);
        second.manager.stop();
    });

    it("follows the settings of the map: a faster growth, and a meadow turned off is wiped", () => {
        const usual = createHarness();
        const fast = createHarness({ meadow: { enabled: true, growMinutes: 2, thirstMinutes: 20, moistureHold: 1 } });
        for (const harness of [usual, fast]) {
            harness.manager.mapChanged();
            harness.steps(250);
        }
        const coverOf = (harness: typeof usual): number => grassOf(harness.sent[harness.sent.length - 1])[0];
        expect(coverOf(fast)).toBeGreaterThan(coverOf(usual) * 2);
        // The map turns its meadow off: the room is told a bare map, once.
        fast.wam.settings = {
            ...fast.wam.settings,
            meadow: { enabled: false, growMinutes: 2, thirstMinutes: 20, moistureHold: 1 },
        };
        const told = fast.sent.length;
        fast.steps(20);
        expect(fast.sent.length).toBe(told + 1);
        expect(grassOf(fast.sent[told]).every((cover) => cover === 0)).toBe(true);
        usual.manager.stop();
        fast.manager.stop();
    });

    it("lets the animals that graze eat the grass under them", () => {
        // An antelope that stays on the tile (2, 1): pixels 64 to 95 by 32 to 63.
        const grazed = createHarness({ grazers: () => [{ x: 70, y: 40 }] });
        const free = createHarness();
        for (const harness of [grazed, free]) {
            harness.manager.mapChanged();
            harness.steps(400);
        }
        const tile = 1 * 8 + 2;
        const eaten = grassOf(grazed.sent[grazed.sent.length - 1]);
        const whole = grassOf(free.sent[free.sent.length - 1]);
        expect(whole[tile]).toBeGreaterThan(0);
        // It eats faster than the grass grows: its tile stays bare, the others are as without it.
        expect(eaten[tile]).toBe(0);
        expect([...eaten].filter((_, index) => index !== tile)).toEqual(
            [...whole].filter((_, index) => index !== tile),
        );
        grazed.manager.stop();
        free.manager.stop();
    });
});

describe("the snow of the MeadowManager", () => {
    const snowOf = (message: MeadowMessage | undefined): Uint8Array =>
        message && message.snow.length > 0 ? new Uint8Array(gunzipSync(message.snow)) : new Uint8Array(8 * 4);
    const cold: SnowWeather = { temperature: -5, humidity: 100, windSpeed: 0 };
    const warm: SnowWeather = { temperature: 10, humidity: 50, windSpeed: 0 };
    /** A room whose air can be changed, with a spy on the water its melted snow is poured into. */
    // The snow of these tests goes 600 times faster than reality (the clock of the snow before the water of
    // reality became the default): a few steps show what takes hours.
    const snowHarness = (options: Parameters<typeof createHarness>[0] = {}) => {
        const harness = createHarness({ weather: WeatherType.Clear, waterSpeed: 600, ...options });
        const air: { now: SnowWeather | undefined } = { now: cold };
        const pour = vi.fn((_tileX: number, _tileY: number, mm: number) => mm);
        harness.manager.fallThrough((): PrecipitationAir | undefined => air.now);
        harness.manager.snowUnder(() => air.now);
        harness.manager.pourWith(pour);
        return { ...harness, air, pour };
    };
    // The middle of the tile (4, 2) of a map of 8 × 4 tiles.
    const downpour = { x: 4 * 32 + 16, y: 2 * 32 + 16, radiusTiles: 1, wholeMap: false };
    const centre = 2 * 8 + 4;

    it("lays the snow of a downpour that falls in the cold, under it only", () => {
        const { manager, sent, steps } = snowHarness();
        manager.mapChanged();
        manager.soak(downpour);
        steps(1);
        const snow = snowOf(sent.at(-1));
        expect(snow[centre]).toBeGreaterThan(0);
        expect(snow[centre + 1]).toBeGreaterThan(0);
        expect(snow[0]).toBe(0);
        expect(manager.snapshot()?.snow.length).toBeGreaterThan(0);
        manager.stop();
    });

    it("lays no snow under a downpour in mild air, nor in an air that is not known", () => {
        for (const now of [warm, undefined]) {
            const { manager, sent, steps, air } = snowHarness();
            air.now = now;
            manager.mapChanged();
            manager.soak(downpour);
            steps(5);
            expect(snowOf(sent.at(-1)).every((byte) => byte === 0)).toBe(true);
            manager.stop();
        }
    });

    it("lays the rain of the map as snow on every tile in the cold", () => {
        const { manager, sent, steps } = snowHarness({ weather: WeatherType.Rain });
        manager.mapChanged();
        steps(10);
        expect(snowOf(sent.at(-1)).every((byte) => byte > 0)).toBe(true);
        manager.stop();
    });

    it("pours the water of the snow that melts, and none while it freezes", () => {
        const { manager, sent, steps, air, pour } = snowHarness();
        manager.mapChanged();
        manager.soak(downpour);
        steps(5);
        expect(pour).not.toHaveBeenCalled();
        const before = snowOf(sent.at(-1))[centre];
        air.now = warm;
        steps(5);
        expect(pour).toHaveBeenCalled();
        expect(pour.mock.calls.every(([, , mm]) => mm > 0)).toBe(true);
        expect(snowOf(sent.at(-1))[centre]).toBeLessThan(before);
        manager.stop();
    });

    it("melts its snow at the speed of the water of the map: in real time on a map that says nothing", () => {
        const melting = (waterSpeed: number | undefined): { laid: number; melted: number } => {
            const { manager, sent, steps, air } = snowHarness({ waterSpeed });
            manager.mapChanged();
            manager.soak(downpour);
            steps(5);
            const before = snowOf(sent.at(-1))[centre];
            air.now = warm;
            steps(5);
            const after = snowOf(sent.at(-1))[centre];
            manager.stop();
            return { laid: before, melted: before - after };
        };
        // Snow laid, then ten seconds of a mild air: nothing seen melting in reality, some at 600 times.
        expect(melting(600).melted).toBeGreaterThan(0);
        const real = melting(1);
        expect(real.laid).toBeGreaterThan(0);
        expect(real.melted).toBe(0);
    });

    it("keeps the snow falling and melting on a map that turned its grass off", () => {
        const { manager, sent, steps, air, pour } = snowHarness({
            meadow: { enabled: false, growMinutes: 10, thirstMinutes: 20, moistureHold: 1 },
        });
        manager.mapChanged();
        steps(1);
        manager.soak(downpour);
        steps(1);
        expect(snowOf(sent.at(-1))[centre]).toBeGreaterThan(0);
        air.now = warm;
        steps(3);
        expect(pour).toHaveBeenCalled();
        manager.stop();
    });

    it("brings the snow back after a restart", async () => {
        const first = snowHarness();
        first.manager.mapChanged();
        first.manager.soak(downpour);
        first.steps(1);
        first.manager.stop();
        expect(first.store.snow).toBeDefined();
        const second = snowHarness({ saved: first.store });
        await second.manager.restore();
        second.manager.mapChanged();
        second.steps(5);
        expect(snowOf(second.sent.at(-1))[centre]).toBeGreaterThan(0);
        second.manager.stop();
    });

    it("melts the snow under the fire a player sets, in the cold too", () => {
        const { manager, sent, steps, pour } = snowHarness();
        manager.mapChanged();
        manager.soak(downpour);
        steps(1);
        const before = snowOf(sent.at(-1))[centre];
        expect(before).toBeGreaterThan(0);
        manager.ignite(downpour.x, downpour.y, 1);
        steps(1);
        expect(snowOf(sent.at(-1))[centre]).toBe(0);
        expect(pour).toHaveBeenCalled();
        manager.stop();
    });

    it("has the snow of the crater of a fireball gone at once", () => {
        const { manager, sent, steps } = snowHarness();
        manager.mapChanged();
        manager.soak(downpour);
        steps(1);
        manager.scorch(downpour.x, downpour.y, 1, 7);
        steps(1);
        expect(snowOf(sent.at(-1))[centre]).toBe(0);
        manager.stop();
    });
});

describe("the ice of the MeadowManager", () => {
    const iceOf = (message: MeadowMessage | undefined): Uint8Array =>
        message && message.ice.length > 0 ? new Uint8Array(gunzipSync(message.ice)) : new Uint8Array(8 * 4);
    const frost: SnowWeather = { temperature: -10, humidity: 100, windSpeed: 0 };
    const mild: SnowWeather = { temperature: 10, humidity: 50, windSpeed: 0 };
    /** A room all under 8 px of water, whose air can be changed. */
    const iceHarness = (options: Parameters<typeof createHarness>[0] = {}) => {
        const harness = createHarness({ weather: WeatherType.Clear, water: () => ({ depthAt: () => 8 }), ...options });
        const air: { now: SnowWeather | undefined } = { now: frost };
        harness.manager.fallThrough((): PrecipitationAir | undefined => air.now);
        harness.manager.snowUnder(() => air.now);
        return { ...harness, air };
    };
    const centre = 2 * 8 + 4;
    const point = { x: 4 * 32 + 16, y: 2 * 32 + 16 };

    it("freezes the water of the map in the frost, tells the room as it thickens, and thaws it in a mild air", () => {
        const { manager, sent, steps, air } = iceHarness();
        manager.mapChanged();
        steps(3);
        const thin = iceOf(sent.at(-1))[centre];
        expect(thin).toBeGreaterThan(0);
        steps(10);
        expect(iceOf(sent.at(-1))[centre]).toBeGreaterThan(thin);
        expect(manager.snapshot()?.ice.length).toBeGreaterThan(0);
        air.now = mild;
        steps(200);
        expect(iceOf(sent.at(-1)).every((byte) => byte === 0)).toBe(true);
        expect(sent.at(-1)?.ice.length).toBe(0);
        manager.stop();
    });

    it("freezes nothing where no water lies, nor in an air that is not known", () => {
        const dry = createHarness({ weather: WeatherType.Clear });
        dry.manager.snowUnder(() => frost);
        dry.manager.mapChanged();
        dry.steps(10);
        expect(iceOf(dry.sent.at(-1)).every((byte) => byte === 0)).toBe(true);
        dry.manager.stop();
        const unknown = iceHarness();
        unknown.air.now = undefined;
        unknown.manager.mapChanged();
        unknown.steps(10);
        expect(iceOf(unknown.sent.at(-1)).every((byte) => byte === 0)).toBe(true);
        unknown.manager.stop();
    });

    it("freezes the water on a map that turned its grass off", () => {
        const { manager, sent, steps } = iceHarness({
            meadow: { enabled: false, growMinutes: 10, thirstMinutes: 20, moistureHold: 1 },
        });
        manager.mapChanged();
        steps(5);
        expect(iceOf(sent.at(-1))[centre]).toBeGreaterThan(0);
        manager.stop();
    });

    it("has the ice broken by a comet, and melted by a fireball and by the fire a player holds", () => {
        const { manager, sent, steps } = iceHarness();
        manager.mapChanged();
        steps(10);
        expect(iceOf(sent.at(-1))[centre]).toBeGreaterThan(0);
        manager.shatter(point.x, point.y, 1);
        steps(1);
        // Broken, then taking again in the frost: thinner than away from the crater.
        expect(iceOf(sent.at(-1))[centre]).toBeLessThan(iceOf(sent.at(-1))[0]);
        steps(10);
        const before = iceOf(sent.at(-1))[centre];
        for (let patch = 0; patch < 3; patch++) manager.ignite(point.x, point.y, 1);
        steps(1);
        expect(iceOf(sent.at(-1))[centre]).toBeLessThan(before);
        manager.scorch(point.x, point.y, 1, 7);
        steps(1);
        expect(iceOf(sent.at(-1))[centre]).toBeLessThan(iceOf(sent.at(-1))[0]);
        manager.stop();
    });

    it("brings the ice back after a restart", async () => {
        const first = iceHarness();
        first.manager.mapChanged();
        first.steps(10);
        first.manager.stop();
        expect(first.store.ice).toBeDefined();
        const second = iceHarness({ saved: first.store });
        second.air.now = { ...frost, temperature: 0 };
        await second.manager.restore();
        second.manager.mapChanged();
        second.steps(5);
        expect(iceOf(second.sent.at(-1))[centre]).toBeGreaterThan(0);
        second.manager.stop();
    });
});
