import { gunzipSync } from "node:zlib";
import { WeatherType } from "@workadventure/map-editor";
import type { WAMFileFormat } from "@workadventure/map-editor";
import type { MeadowMessage, SubToPusherRoomMessage } from "@workadventure/messages";
import { describe, expect, it, vi } from "vitest";
import { MeadowManager } from "../src/Model/MeadowManager";
import type { VariablesRepositoryInterface } from "../src/Services/Repository/VariablesRepositoryInterface";

function wamWith(weather: WeatherType, meadow?: NonNullable<WAMFileFormat["settings"]>["meadow"]): WAMFileFormat {
    return {
        version: "2.1.0",
        mapUrl: "map.tmj",
        areas: [],
        entityCollections: [],
        entities: {},
        settings: { weather, meadow },
    };
}

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
}: {
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
    const wam = wamWith(weather, meadow);
    const room = {
        getWam: () => wam,
        sendSubMessageToRoom: (message: SubToPusherRoomMessage): void => {
            if (message.message?.$case === "meadowMessage") sent.push(message.message.meadowMessage);
        },
    };
    const manager = new MeadowManager(
        room,
        { slotsFor: vi.fn(() => undefined) },
        () => undefined,
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

    it("says nothing of a dry and bare map, nor twice the same state", () => {
        const dry = createHarness({ weather: WeatherType.Clear });
        dry.manager.mapChanged();
        dry.steps(100);
        expect(dry.sent).toEqual([]);
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
