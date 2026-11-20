import {
    DOWNPOUR_DEFAULT_TILES,
    DOWNPOUR_LASTS_MS,
    DOWNPOUR_MAX_TILES,
    DOWNPOURS_PER_ROOM,
    DRAIN_LASTS_MS,
    DRAINS_PER_ROOM,
    METEOR_FALL_MS,
    METEORS_PER_ROOM,
} from "@workadventure/map-editor";
import { CatastropheKind } from "@workadventure/messages";
import type { CatastropheMessage, SubToPusherRoomMessage } from "@workadventure/messages";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CatastropheManager } from "../src/Model/CatastropheManager";

const METEOR = CatastropheKind.CATASTROPHE_METEOR;
const MAP = { width: 640, height: 480 };

function harness(mapSize: () => { width: number; height: number } | undefined = () => MAP) {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const sent: CatastropheMessage[] = [];
    const room = {
        sendSubMessageToRoom: (message: SubToPusherRoomMessage): void => {
            if (message.message?.$case === "catastropheMessage") sent.push(message.message.catastropheMessage);
        },
    };
    const strike = vi.fn<(x: number, y: number, radiusTiles: number) => void>();
    const manager = new CatastropheManager(room, mapSize, strike);
    return { manager, sent, strike };
}

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("CatastropheManager", () => {
    it("announces the meteor and strikes after the fall", () => {
        const { manager, sent, strike } = harness();
        expect(manager.launch(METEOR, 320, 160, 4)).toBe(true);
        expect(sent).toHaveLength(1);
        expect(sent[0]).toMatchObject({ kind: METEOR, x: 320, y: 160, impactInMs: 1200, radiusTiles: 4 });
        vi.advanceTimersByTime(METEOR_FALL_MS - 1);
        expect(strike).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(strike).toHaveBeenCalledWith(320, 160, 4);
    });

    it("lets a player launch as fast as they click", () => {
        const { manager, sent } = harness();
        for (let click = 0; click < 10; click++) expect(manager.launch(METEOR, 10, 10, 4)).toBe(true);
        expect(sent).toHaveLength(10);
    });

    it("twenty meteors in flight at most in a room: the server does not run more waves at once", () => {
        expect(METEORS_PER_ROOM).toBe(20);
        const { manager } = harness();
        for (let player = 1; player <= METEORS_PER_ROOM; player++) {
            expect(manager.launch(METEOR, 10, 10, 4)).toBe(true);
        }
        expect(manager.launch(METEOR, 10, 10, 4)).toBe(false);
        vi.advanceTimersByTime(METEOR_FALL_MS);
        expect(manager.launch(METEOR, 10, 10, 4)).toBe(true);
    });

    it("refuses a point outside the map and numbers that are not", () => {
        const { manager, sent } = harness();
        for (const [x, y] of [
            [-1, 10],
            [MAP.width, 10],
            [10, -1],
            [10, MAP.height],
            [NaN, 10],
            [10, NaN],
            [Infinity, 10],
            [10, -Infinity],
            [1e12, 10],
        ]) {
            expect(manager.launch(METEOR, x, y, 4)).toBe(false);
        }
        expect(sent).toHaveLength(0);
        expect(harness(() => undefined).manager.launch(METEOR, 10, 10, 4)).toBe(false);
    });

    it("refuses a kind it does not know", () => {
        const { manager, sent } = harness();
        expect(manager.launch(CatastropheKind.UNRECOGNIZED, 10, 10, 4)).toBe(false);
        expect(sent).toHaveLength(0);
    });

    it("keeps the size of a meteor within what a meteor may be", () => {
        const { manager, sent, strike } = harness();
        expect(manager.launch(METEOR, 10, 10, 9999)).toBe(true);
        expect(manager.launch(METEOR, 10, 10, -3)).toBe(true);
        expect(manager.launch(METEOR, 10, 10, Number.NaN)).toBe(true);
        expect(sent.map((message) => message.radiusTiles)).toEqual([24, 2, 4]);
        vi.advanceTimersByTime(1200);
        expect(strike.mock.calls.map((call) => call[2])).toEqual([24, 2, 4]);
    });

    it("a strike that throws stops nothing", () => {
        const { manager, strike } = harness();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        strike.mockImplementationOnce(() => {
            throw new Error("boom");
        });
        expect(manager.launch(METEOR, 10, 10, 4)).toBe(true);
        expect(() => vi.advanceTimersByTime(METEOR_FALL_MS)).not.toThrow();
        expect(manager.launch(METEOR, 20, 20, 4)).toBe(true);
        vi.advanceTimersByTime(METEOR_FALL_MS);
        expect(strike).toHaveBeenLastCalledWith(20, 20, 4);
    });

    it("stop cancels the meteors in flight", () => {
        const { manager, strike } = harness();
        manager.launch(METEOR, 10, 10, 4);
        manager.stop();
        vi.advanceTimersByTime(2000);
        expect(strike).not.toHaveBeenCalled();
    });

    it("refuses a launch once stopped", () => {
        const { manager, sent, strike } = harness();
        manager.stop();
        expect(manager.launch(METEOR, 10, 10, 4)).toBe(false);
        vi.advanceTimersByTime(2000);
        expect(sent).toHaveLength(0);
        expect(strike).not.toHaveBeenCalled();
    });
});

describe("CatastropheManager, downpours", () => {
    const DOWNPOUR = CatastropheKind.CATASTROPHE_DOWNPOUR;

    function rainHarness() {
        vi.useFakeTimers();
        vi.setSystemTime(0);
        const sent: CatastropheMessage[] = [];
        const room = {
            sendSubMessageToRoom: (message: SubToPusherRoomMessage): void => {
                if (message.message?.$case === "catastropheMessage") sent.push(message.message.catastropheMessage);
            },
        };
        const soaked: { x: number; y: number; radiusTiles: number; wholeMap: boolean }[] = [];
        const manager = new CatastropheManager(
            room,
            () => MAP,
            () => undefined,
            (downpour) => soaked.push(downpour),
        );
        return { manager, sent, soaked };
    }

    it("a downpour begins, is told to the room, soaks the ground and ends a second after the last message", () => {
        const { manager, sent, soaked } = rainHarness();
        expect(manager.rain(7, 100, 80, 3, false)).toBe(true);
        expect(sent[0]).toMatchObject({ kind: DOWNPOUR, x: 100, y: 80, radiusTiles: 3, wholeMap: false });
        expect(sent[0].impactInMs).toBe(DOWNPOUR_LASTS_MS);
        expect(soaked).toHaveLength(1);
        expect(manager.downpours()).toHaveLength(1);
        vi.advanceTimersByTime(DOWNPOUR_LASTS_MS - 1);
        expect(manager.downpours()).toHaveLength(1);
        vi.advanceTimersByTime(1);
        expect(manager.downpours()).toHaveLength(0);
    });

    it("follows its player under the same id, and ignores messages that come too fast", () => {
        const { manager, sent } = rainHarness();
        manager.rain(7, 100, 80, 3, false);
        vi.advanceTimersByTime(50);
        expect(manager.rain(7, 110, 80, 3, false)).toBe(false);
        vi.advanceTimersByTime(150);
        expect(manager.rain(7, 120, 90, 3, false)).toBe(true);
        expect(sent).toHaveLength(2);
        expect(sent[1].id).toBe(sent[0].id);
        expect(manager.downpours()).toMatchObject([{ x: 120, y: 90 }]);
    });

    it("keeps the size within its bounds and carries the whole map", () => {
        const { manager } = rainHarness();
        manager.rain(1, 10, 10, 999, true);
        manager.rain(2, 10, 10, Number.NaN, false);
        expect(manager.downpours()).toMatchObject([
            { radiusTiles: DOWNPOUR_MAX_TILES, wholeMap: true },
            { radiusTiles: DOWNPOUR_DEFAULT_TILES, wholeMap: false },
        ]);
    });

    it("refuses a point outside the map, and one downpour more than the room may have", () => {
        const { manager } = rainHarness();
        expect(manager.rain(1, -1, 10, 3, false)).toBe(false);
        expect(manager.rain(1, MAP.width, 10, 3, false)).toBe(false);
        for (let player = 1; player <= DOWNPOURS_PER_ROOM; player++) {
            expect(manager.rain(player, 10, 10, 3, false)).toBe(true);
        }
        expect(manager.rain(99, 10, 10, 3, false)).toBe(false);
        vi.advanceTimersByTime(DOWNPOUR_LASTS_MS);
        expect(manager.rain(99, 10, 10, 3, false)).toBe(true);
    });

    it("rains no more once the room stops", () => {
        const { manager } = rainHarness();
        manager.rain(1, 10, 10, 3, false);
        manager.stop();
        expect(manager.downpours()).toHaveLength(0);
        expect(manager.rain(1, 10, 10, 3, false)).toBe(false);
    });
});

describe("CatastropheManager, drains", () => {
    const DRAIN = CatastropheKind.CATASTROPHE_DRAIN;

    it("a drain opens, is told to the room and closes a second after the last message", () => {
        const { manager, sent } = harness();
        expect(manager.request(7, DRAIN, 100, 80, 0, false)).toBe(true);
        expect(sent[0]).toMatchObject({ kind: DRAIN, x: 100, y: 80, wholeMap: false });
        expect(sent[0].impactInMs).toBe(DRAIN_LASTS_MS);
        expect(manager.drains()).toEqual([expect.objectContaining({ id: sent[0].id, x: 100, y: 80 })]);
        vi.advanceTimersByTime(DRAIN_LASTS_MS - 1);
        expect(manager.drains()).toHaveLength(1);
        vi.advanceTimersByTime(1);
        expect(manager.drains()).toHaveLength(0);
    });

    it("follows its player under the same id, and ignores messages that come too fast", () => {
        const { manager, sent } = harness();
        manager.drain(7, 100, 80);
        vi.advanceTimersByTime(50);
        expect(manager.drain(7, 300, 90)).toBe(false);
        vi.advanceTimersByTime(150);
        expect(manager.drain(7, 300, 90)).toBe(true);
        expect(sent).toHaveLength(2);
        expect(sent[1].id).toBe(sent[0].id);
        expect(manager.drains()).toEqual([expect.objectContaining({ x: 300, y: 90 })]);
    });

    it("refuses a point outside the map, numbers that are not, and one drain more than the room may have", () => {
        const { manager, sent } = harness();
        expect(manager.drain(1, -1, 10)).toBe(false);
        expect(manager.drain(1, 10, MAP.height)).toBe(false);
        expect(manager.drain(1, Number.NaN, 10)).toBe(false);
        for (let user = 1; user <= DRAINS_PER_ROOM; user++) expect(manager.drain(user, 10, 10)).toBe(true);
        expect(manager.drain(99, 10, 10)).toBe(false);
        expect(sent).toHaveLength(DRAINS_PER_ROOM);
    });

    it("the drain of a player does not keep their downpour going, nor the other way", () => {
        const { manager } = harness();
        manager.rain(7, 100, 80, 3, false);
        vi.advanceTimersByTime(600);
        expect(manager.drain(7, 100, 80)).toBe(true);
        vi.advanceTimersByTime(500);
        expect(manager.downpours()).toHaveLength(0);
        expect(manager.drains()).toHaveLength(1);
    });

    it("drains no more once the room stops", () => {
        const { manager } = harness();
        manager.drain(7, 100, 80);
        manager.stop();
        expect(manager.drains()).toHaveLength(0);
        expect(manager.drain(7, 100, 80)).toBe(false);
    });
});

describe("a patch of fire", () => {
    const FIRE = CatastropheKind.CATASTROPHE_FIRE;
    function fireHarness() {
        const lit: { x: number; y: number; radiusTiles: number }[] = [];
        const clock = { now: 1_000_000 };
        const room = { sendSubMessageToRoom: (_message: SubToPusherRoomMessage): void => undefined };
        const manager = new CatastropheManager(
            room,
            () => MAP,
            () => undefined,
            () => undefined,
            () => clock.now,
        );
        manager.igniteWith((x, y, radiusTiles) => lit.push({ x, y, radiusTiles }));
        return { manager, lit, clock };
    }

    it("is set where the player asks, its size kept within what a patch may be", () => {
        const { manager, lit } = fireHarness();
        expect(manager.request(1, FIRE, 320, 160, 3, false)).toBe(true);
        expect(manager.request(2, FIRE, 320, 160, 999, false)).toBe(true);
        expect(manager.request(3, FIRE, 320, 160, Number.NaN, false)).toBe(true);
        expect(lit).toEqual([
            { x: 320, y: 160, radiusTiles: 3 },
            { x: 320, y: 160, radiusTiles: 8 },
            { x: 320, y: 160, radiusTiles: 2 },
        ]);
    });

    it("is refused outside the map, for numbers that are not, and after five in a second for a player", () => {
        const { manager, lit, clock } = fireHarness();
        for (const [x, y] of [
            [-1, 10],
            [10, MAP.height],
            [Number.NaN, 10],
            [10, Number.POSITIVE_INFINITY],
        ]) {
            expect(manager.request(1, FIRE, x, y, 2, false)).toBe(false);
        }
        expect(lit).toEqual([]);
        for (let patch = 0; patch < 5; patch++) expect(manager.request(1, FIRE, 10, 10, 2, false)).toBe(true);
        expect(manager.request(1, FIRE, 10, 10, 2, false)).toBe(false);
        expect(manager.request(2, FIRE, 10, 10, 2, false)).toBe(true);
        clock.now += 1000;
        expect(manager.request(1, FIRE, 10, 10, 2, false)).toBe(true);
    });

    it("stops nothing when the meadow throws, and is refused once the room is closed", () => {
        const { manager } = fireHarness();
        manager.igniteWith(() => {
            throw new Error("no meadow");
        });
        expect(() => manager.request(1, FIRE, 10, 10, 2, false)).not.toThrow();
        manager.stop();
        expect(manager.request(2, FIRE, 10, 10, 2, false)).toBe(false);
    });
});
