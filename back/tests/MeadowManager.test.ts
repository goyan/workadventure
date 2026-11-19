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
}: {
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
    );
    const steps = (count: number): void => {
        for (let step = 0; step < count; step++) manager.step();
    };
    return { manager, sent, store, steps, wam };
}

const grassOf = (message: MeadowMessage): Uint8Array => new Uint8Array(gunzipSync(message.grass));

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
});
