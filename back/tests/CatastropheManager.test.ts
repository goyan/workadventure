import {
    BALL_LASTS_MS,
    COLD_LASTS_MS,
    COLDS_PER_ROOM,
    BALL_MIN_REPORT_MS,
    BALLS_PER_ROOM,
    DOWNPOUR_DEFAULT_TILES,
    DOWNPOUR_LASTS_MS,
    DOWNPOUR_MAX_TILES,
    DOWNPOURS_PER_ROOM,
    DRAIN_LASTS_MS,
    DRAINS_PER_ROOM,
    FIRE_PATCH_LASTS_MS,
    HURRICANE_TELL_MS,
    METEOR_FALL_MS,
    METEORS_PER_ROOM,
    TSUNAMI_BACKWASH_MS,
    TSUNAMI_MAX_METRES,
    TSUNAMI_MAX_MINUTES,
    TSUNAMI_TELL_MS,
    decodeZombieLog,
    decodeZombieTerrain,
    encodeZombieTerrain,
    zombieTerrainHash,
    ZOMBIE_WATER,
    ZOMBIE_TELL_MS,
    ZOMBIE_TERRAIN_TELL_MS,
} from "@workadventure/map-editor";
import { CatastropheKind } from "@workadventure/messages";
import type { CatastropheMessage, SubToPusherRoomMessage } from "@workadventure/messages";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CatastropheManager } from "../src/Model/CatastropheManager";

const METEOR = CatastropheKind.CATASTROPHE_METEOR;
const FIREBALL = CatastropheKind.CATASTROPHE_FIREBALL;
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
        expect(sent.map((message) => message.radiusTiles)).toEqual([8, 1, 4]);
        vi.advanceTimersByTime(1200);
        expect(strike.mock.calls.map((call) => call[2])).toEqual([8, 1, 4]);
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

    it("is as wide as its player says, from 1 to 16 tiles, and tells the room", () => {
        const { manager, sent } = harness();
        expect(manager.request(7, CatastropheKind.CATASTROPHE_DRAIN, 100, 80, 9, false)).toBe(true);
        expect(manager.request(8, CatastropheKind.CATASTROPHE_DRAIN, 100, 80, 99, false)).toBe(true);
        expect(sent.map((message) => message.radiusTiles)).toEqual([9, 16]);
        expect(manager.drains().map((drain) => drain.radiusTiles)).toEqual([9, 16]);
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
        // A browser of before sends no size: the usual one.
        expect(sent[0]).toMatchObject({ kind: DRAIN, x: 100, y: 80, wholeMap: false, radiusTiles: 3 });
        expect(sent[0].impactInMs).toBe(DRAIN_LASTS_MS);
        expect(manager.drains()).toEqual([expect.objectContaining({ id: sent[0].id, x: 100, y: 80 })]);
        vi.advanceTimersByTime(DRAIN_LASTS_MS - 1);
        expect(manager.drains()).toHaveLength(1);
        vi.advanceTimersByTime(1);
        expect(manager.drains()).toHaveLength(0);
    });

    it("is as wide as its player says, from 1 to 16 tiles, and tells the room", () => {
        const { manager, sent } = harness();
        expect(manager.request(7, CatastropheKind.CATASTROPHE_DRAIN, 100, 80, 9, false)).toBe(true);
        expect(manager.request(8, CatastropheKind.CATASTROPHE_DRAIN, 100, 80, 99, false)).toBe(true);
        expect(sent.map((message) => message.radiusTiles)).toEqual([9, 16]);
        expect(manager.drains().map((drain) => drain.radiusTiles)).toEqual([9, 16]);
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

describe("CatastropheManager, balls", () => {
    const BALL = CatastropheKind.CATASTROPHE_BALL;

    it("a ball is there at once, whole, under the pointer, and the room is told whose it is", () => {
        const { manager, sent } = harness();
        expect(manager.request(7, BALL, 100, 80, 0, false)).toBe(true);
        // A size that is none is the usual diameter, 4 tiles: 64 px of radius, from the first message.
        expect(sent[0]).toMatchObject({ kind: BALL, x: 100, y: 80, radiusTiles: 4, wholeMap: false, userId: 7 });
        expect(sent[0].impactInMs).toBe(BALL_LASTS_MS);
        expect(manager.balls()).toEqual([{ id: sent[0].id, x: 100, y: 80, radiusPx: 64 }]);
    });

    it("tells the room the level the water holds it at", () => {
        const { manager, sent } = harness();
        const asked: [number, number, number][] = [];
        manager.levelWith((id, x, y) => {
            asked.push([id, x, y]);
            return -40;
        });
        manager.ball(7, 100, 80, 4);
        expect(sent[0].ballLevel).toBe(-40);
        expect(asked).toEqual([[sent[0].id, 100, 80]]);
        // The balls the water reads say no level: the water decides it.
        expect(manager.balls()).toEqual([{ id: sent[0].id, x: 100, y: 80, radiusPx: 64 }]);
    });

    it("is under the pointer of its player at each message, under the same id", () => {
        const { manager, sent } = harness();
        manager.ball(7, 100, 80, 4);
        vi.advanceTimersByTime(BALL_MIN_REPORT_MS);
        expect(manager.ball(7, 500, 300, 6)).toBe(true);
        expect(sent[1]).toMatchObject({ id: sent[0].id, x: 500, y: 300, radiusTiles: 6 });
        expect(manager.balls()).toEqual([{ id: sent[0].id, x: 500, y: 300, radiusPx: 96 }]);
    });

    it("ignores messages that come too fast", () => {
        const { manager, sent } = harness();
        manager.ball(7, 100, 80, 4);
        vi.advanceTimersByTime(BALL_MIN_REPORT_MS - 1);
        expect(manager.ball(7, 300, 90, 4)).toBe(false);
        expect(sent).toHaveLength(1);
        expect(manager.balls()[0]).toMatchObject({ x: 100, y: 80 });
    });

    it("keeps the diameter within 1 to 16 tiles", () => {
        const { manager, sent } = harness();
        expect(manager.ball(7, 100, 80, 99)).toBe(true);
        expect(manager.ball(8, 100, 80, -5)).toBe(true);
        expect(sent.map((message) => message.radiusTiles)).toEqual([16, 1]);
        expect(manager.balls().map((ball) => ball.radiusPx)).toEqual([256, 16]);
    });

    it("is gone at once when its player lets go, and the room is told", () => {
        const { manager, sent } = harness();
        manager.ball(7, 100, 80, 4);
        vi.advanceTimersByTime(5);
        expect(manager.request(7, BALL, 100, 80, 4, false, true)).toBe(true);
        expect(manager.balls()).toHaveLength(0);
        expect(sent[1]).toMatchObject({ id: sent[0].id, kind: BALL, impactInMs: 0, userId: 7 });
        // Letting go of nothing says nothing.
        expect(manager.request(7, BALL, 100, 80, 4, false, true)).toBe(false);
        expect(sent).toHaveLength(2);
        // A release never lets go of another catastrophe.
        manager.drain(7, 100, 80);
        expect(manager.request(7, CatastropheKind.CATASTROPHE_DRAIN, 100, 80, 3, false, true)).toBe(false);
        expect(manager.drains()).toHaveLength(1);
    });

    it("is gone a moment after the last message of a player who left without letting go", () => {
        const { manager } = harness();
        manager.ball(7, 100, 80, 2);
        vi.advanceTimersByTime(BALL_LASTS_MS - 1);
        expect(manager.balls()).toHaveLength(1);
        vi.advanceTimersByTime(1);
        expect(manager.balls()).toHaveLength(0);
    });

    it("a new click makes a new ball", () => {
        const { manager, sent } = harness();
        manager.ball(7, 100, 80, 4);
        manager.release(7);
        vi.advanceTimersByTime(100);
        expect(manager.ball(7, 400, 300, 4)).toBe(true);
        expect(sent.at(-1)?.id).not.toBe(sent[0].id);
        expect(manager.balls()).toEqual([expect.objectContaining({ x: 400, y: 300 })]);
    });

    it("refuses a point outside the map, numbers that are not, and one ball more than the room may have", () => {
        const { manager, sent } = harness();
        expect(manager.ball(1, -1, 10, 4)).toBe(false);
        expect(manager.ball(1, 10, MAP.height, 4)).toBe(false);
        expect(manager.ball(1, Number.NaN, 10, 4)).toBe(false);
        expect(manager.ball(1, 10, Number.POSITIVE_INFINITY, 4)).toBe(false);
        for (let user = 1; user <= BALLS_PER_ROOM; user++) expect(manager.ball(user, 10, 10, 4)).toBe(true);
        expect(manager.ball(99, 10, 10, 4)).toBe(false);
        expect(sent).toHaveLength(BALLS_PER_ROOM);
    });

    it("no ball once the room stops", () => {
        const { manager } = harness();
        manager.ball(7, 100, 80, 4);
        manager.stop();
        expect(manager.balls()).toHaveLength(0);
        expect(manager.ball(7, 100, 80, 4)).toBe(false);
    });
});

describe("CatastropheManager, cold snaps", () => {
    const COLD = CatastropheKind.CATASTROPHE_COLD;

    it("lays a mass of cold air under the pointer, told to the room, held a second after the last message", () => {
        const { manager, sent } = harness();
        expect(manager.request(7, COLD, 100, 80, 0, false, false, undefined)).toBe(true);
        // No size and no temperature: the usual ones, 3 tiles and -80 °C.
        expect(sent[0]).toMatchObject({ kind: COLD, x: 100, y: 80, radiusTiles: 3, temperature: -80 });
        expect(sent[0].impactInMs).toBe(COLD_LASTS_MS);
        expect(manager.colds()).toEqual([{ id: sent[0].id, x: 100, y: 80, radiusTiles: 3, temperature: -80 }]);
        vi.advanceTimersByTime(COLD_LASTS_MS - 1);
        expect(manager.colds()).toHaveLength(1);
        vi.advanceTimersByTime(1);
        expect(manager.colds()).toHaveLength(0);
    });

    it("is as wide and as cold as its player says, within 1 to 16 tiles and -120 to -5 °C", () => {
        const { manager, sent } = harness();
        expect(manager.cold(7, 100, 80, 9, -40)).toBe(true);
        expect(manager.cold(8, 100, 80, 99, -900)).toBe(true);
        expect(manager.cold(9, 100, 80, -4, 30)).toBe(true);
        expect(sent.map((message) => [message.radiusTiles, message.temperature])).toEqual([
            [9, -40],
            [16, -120],
            [1, -5],
        ]);
    });

    it("follows its player under the same id, and ignores messages that come too fast", () => {
        const { manager, sent } = harness();
        manager.cold(7, 100, 80, 3, -80);
        vi.advanceTimersByTime(50);
        expect(manager.cold(7, 300, 90, 3, -80)).toBe(false);
        vi.advanceTimersByTime(150);
        expect(manager.cold(7, 300, 90, 3, -60)).toBe(true);
        expect(sent[1].id).toBe(sent[0].id);
        expect(manager.colds()).toEqual([expect.objectContaining({ x: 300, y: 90, temperature: -60 })]);
    });

    it("refuses a point outside the map, numbers that are not, and one mass more than the room may have", () => {
        const { manager, sent } = harness();
        expect(manager.cold(1, -1, 10, 3, -80)).toBe(false);
        expect(manager.cold(1, 10, MAP.height, 3, -80)).toBe(false);
        expect(manager.cold(1, Number.NaN, 10, 3, -80)).toBe(false);
        for (let user = 1; user <= COLDS_PER_ROOM; user++) expect(manager.cold(user, 10, 10, 3, -80)).toBe(true);
        expect(manager.cold(99, 10, 10, 3, -80)).toBe(false);
        expect(sent).toHaveLength(COLDS_PER_ROOM);
    });

    it("stops the cold snap of the room when a player asks: nobody holds any, the ground is told, and so is the room", () => {
        const { manager, sent } = harness();
        const calmed = vi.fn();
        manager.calmWith(calmed);
        manager.cold(7, 100, 80, 3, -80);
        manager.cold(8, 300, 80, 3, -80);
        // Anyone may stop it, as anyone may lay it: the same rights as the other catastrophes.
        expect(manager.request(9, COLD, 0, 0, 0, false, true)).toBe(true);
        expect(manager.colds()).toEqual([]);
        expect(calmed).toHaveBeenCalledTimes(1);
        expect(sent.at(-1)).toMatchObject({ kind: COLD, impactInMs: 0 });
        // A player still holding their click lays a new mass at their next message.
        vi.advanceTimersByTime(200);
        expect(manager.cold(7, 100, 80, 3, -80)).toBe(true);
        expect(manager.colds()).toHaveLength(1);
    });

    it("holds no cold air once the room stops", () => {
        const { manager } = harness();
        manager.cold(7, 100, 80, 3, -80);
        manager.stop();
        expect(manager.colds()).toHaveLength(0);
        expect(manager.cold(7, 100, 80, 3, -80)).toBe(false);
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

    it("shows the room the flame of each player who holds it, one flame a player", () => {
        const told: {
            id: number;
            kind: CatastropheKind;
            x: number;
            y: number;
            radiusTiles: number;
            impactInMs: number;
        }[] = [];
        const room = {
            sendSubMessageToRoom: (message: SubToPusherRoomMessage): void => {
                if (message.message?.$case === "catastropheMessage") told.push(message.message.catastropheMessage);
            },
        };
        const manager = new CatastropheManager(
            room,
            () => MAP,
            () => undefined,
            () => undefined,
            () => 1_000_000,
        );
        expect(manager.request(1, FIRE, 320, 160, 3, false)).toBe(true);
        expect(manager.request(1, FIRE, 352, 160, 3, false)).toBe(true);
        expect(manager.request(2, FIRE, 64, 64, 999, false)).toBe(true);
        // Refused: nothing is shown.
        expect(manager.request(3, FIRE, -5, 64, 2, false)).toBe(false);
        expect(told.map((flame) => flame.kind)).toEqual([FIRE, FIRE, FIRE]);
        expect(told[0]).toMatchObject({ x: 320, y: 160, radiusTiles: 3, impactInMs: FIRE_PATCH_LASTS_MS });
        expect(told[1]).toMatchObject({ id: told[0].id, x: 352 });
        expect(told[2].id).not.toBe(told[0].id);
        expect(told[2].radiusTiles).toBe(8);
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

    describe("a fireball", () => {
        const burning = () => {
            const made = harness();
            const burn = vi.fn<(x: number, y: number, radiusTiles: number, id: number) => void>();
            made.manager.burnWith(burn);
            return { ...made, burn };
        };

        it("is announced like a meteor, and burns at impact instead of striking the water", () => {
            const { manager, sent, strike, burn } = burning();
            expect(manager.request(1, FIREBALL, 100, 100, 6, false)).toBe(true);
            expect(sent).toHaveLength(1);
            expect(sent[0]).toMatchObject({ kind: FIREBALL, x: 100, y: 100, impactInMs: 1200, radiusTiles: 6 });
            vi.advanceTimersByTime(METEOR_FALL_MS - 1);
            expect(burn).not.toHaveBeenCalled();
            vi.advanceTimersByTime(1);
            expect(burn).toHaveBeenCalledWith(100, 100, 6, sent[0].id);
            expect(strike).not.toHaveBeenCalled();
        });

        it("keeps its size within 1 to 8 tiles: one out of range is the nearest, none is the usual one", () => {
            const { manager, sent } = burning();
            manager.launch(FIREBALL, 10, 10, 99);
            manager.launch(FIREBALL, 10, 10, Number.NaN);
            manager.launch(FIREBALL, 10, 10, 0);
            manager.launch(FIREBALL, 10, 10, 1);
            // A tab opened before, still at 24: kept, at the largest.
            manager.launch(METEOR, 10, 10, 24);
            manager.launch(METEOR, 10, 10, -3);
            expect(sent.map((message) => message.radiusTiles)).toEqual([8, 4, 4, 1, 8, 1]);
        });

        it("is counted with the meteors against the twenty in flight", () => {
            const { manager } = burning();
            for (let count = 0; count < METEORS_PER_ROOM / 2; count++) {
                expect(manager.launch(METEOR, 10, 10, 4)).toBe(true);
                expect(manager.launch(FIREBALL, 10, 10, 4)).toBe(true);
            }
            expect(manager.launch(FIREBALL, 10, 10, 4)).toBe(false);
        });

        it("is refused outside the map", () => {
            const { manager, sent } = burning();
            expect(manager.launch(FIREBALL, -1, 10, 4)).toBe(false);
            expect(manager.launch(FIREBALL, 10, MAP.height, 4)).toBe(false);
            expect(sent).toEqual([]);
        });

        it("does not stop the room when burning fails", () => {
            const { manager, burn } = burning();
            const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
            burn.mockImplementation(() => {
                throw new Error("no meadow");
            });
            manager.launch(FIREBALL, 10, 10, 4);
            expect(() => vi.advanceTimersByTime(METEOR_FALL_MS)).not.toThrow();
            expect(logged).toHaveBeenCalled();
        });
    });
});

describe("ice that gives way", () => {
    const ICE = CatastropheKind.CATASTROPHE_ICE_BREAK;

    it("breaks the ice a tile around the player, tells the room, and once a second at most for a player", () => {
        const broken: { x: number; y: number; radiusTiles: number }[] = [];
        const told: { kind: CatastropheKind; x: number; y: number; radiusTiles: number }[] = [];
        const clock = { now: 1_000_000 };
        const room = {
            sendSubMessageToRoom: (message: SubToPusherRoomMessage): void => {
                if (message.message?.$case === "catastropheMessage") told.push(message.message.catastropheMessage);
            },
        };
        const manager = new CatastropheManager(
            room,
            () => MAP,
            () => undefined,
            () => undefined,
            () => clock.now,
        );
        manager.breakIceWith((x, y, radiusTiles) => broken.push({ x, y, radiusTiles }));
        expect(manager.request(1, ICE, 320, 160, 0, false)).toBe(true);
        expect(manager.request(1, ICE, 330, 160, 0, false)).toBe(false);
        expect(manager.request(2, ICE, 330, 160, 0, false)).toBe(true);
        expect(manager.request(3, ICE, -5, 160, 0, false)).toBe(false);
        clock.now += 1000;
        expect(manager.request(1, ICE, 340, 160, 0, false)).toBe(true);
        expect(broken).toEqual([
            { x: 320, y: 160, radiusTiles: 1 },
            { x: 330, y: 160, radiusTiles: 1 },
            { x: 340, y: 160, radiusTiles: 1 },
        ]);
        expect(told.map(({ kind, x, radiusTiles }) => ({ kind, x, radiusTiles }))).toEqual([
            { kind: ICE, x: 320, radiusTiles: 1 },
            { kind: ICE, x: 330, radiusTiles: 1 },
            { kind: ICE, x: 340, radiusTiles: 1 },
        ]);
    });
});

describe("CatastropheManager, hurricanes", () => {
    const HURRICANE = CatastropheKind.CATASTROPHE_HURRICANE;
    const track = {
        category: 4,
        minutes: 10,
        heading: 290,
        southern: false,
        startedAt: 0,
        fromX: 0,
        fromY: 0,
        toX: 0,
        toY: 0,
        anchorX: 0,
        anchorY: 0,
        durationMs: 0,
        times: 0,
        waterEffect: 0,
    };

    it("lets a hurricane cross the map, told to the room once a second until it ends", () => {
        const { manager, sent } = harness();
        expect(manager.request(1, HURRICANE, -1, -1, 0, true, false, undefined, track)).toBe(true);
        expect(sent).toHaveLength(1);
        expect(sent[0]).toMatchObject({ kind: HURRICANE, impactInMs: 10 * 60_000 });
        expect(sent[0].hurricane).toMatchObject({
            category: 4,
            minutes: 10,
            heading: 290,
            startedAt: 0,
            anchorX: 320,
            anchorY: 240,
        });
        expect(manager.hurricane()).toMatchObject({ category: 4, durationMs: 600_000, startedAt: 0 });
        vi.advanceTimersByTime(HURRICANE_TELL_MS);
        expect(sent).toHaveLength(2);
        expect(sent[1]).toMatchObject({ id: sent[0].id, impactInMs: 10 * 60_000 - HURRICANE_TELL_MS });
        vi.advanceTimersByTime(10 * 60_000);
        expect(sent[sent.length - 1]).toMatchObject({ id: sent[0].id, impactInMs: 0 });
        expect(manager.hurricane()).toBeUndefined();
        const told = sent.length;
        vi.advanceTimersByTime(5 * HURRICANE_TELL_MS);
        expect(sent).toHaveLength(told);
    });

    it("keeps one hurricane a room, which anyone may stop", () => {
        const { manager, sent } = harness();
        expect(manager.request(1, HURRICANE, 0, 0, 0, true, false, undefined, track)).toBe(true);
        expect(manager.request(2, HURRICANE, 0, 0, 0, true, false, undefined, track)).toBe(false);
        expect(manager.request(2, HURRICANE, 0, 0, 0, true, true)).toBe(true);
        expect(sent[sent.length - 1]).toMatchObject({ kind: HURRICANE, impactInMs: 0 });
        expect(manager.hurricane()).toBeUndefined();
        expect(manager.request(2, HURRICANE, 0, 0, 0, true, false, undefined, track)).toBe(true);
    });

    it("keeps what is asked within bounds, and turns it the way of the hemisphere of the map", () => {
        const { manager } = harness();
        manager.southernWith(() => true);
        manager.request(1, HURRICANE, 160, 120, 0, true, false, undefined, {
            ...track,
            category: 9,
            minutes: 500,
            heading: 90,
        });
        // Eastwards over (160, 120) of a map of 640 x 480: in at its west edge, out at its east edge.
        expect(manager.hurricane()).toMatchObject({
            category: 5,
            durationMs: 30 * 60_000,
            southern: true,
            fromX: 0,
            toX: 640,
            anchorX: 160,
            anchorY: 120,
        });
    });

    it("refuses a hurricane without its track, and forgets it when the room stops", () => {
        const { manager, sent } = harness();
        expect(manager.request(1, HURRICANE, 0, 0, 0, true)).toBe(false);
        manager.request(1, HURRICANE, 0, 0, 0, true, false, undefined, track);
        manager.stop();
        const told = sent.length;
        vi.advanceTimersByTime(5 * HURRICANE_TELL_MS);
        expect(sent).toHaveLength(told);
        expect(manager.hurricane()).toBeUndefined();
    });
});

describe("CatastropheManager, a hurricane sped up by the speed of the map", () => {
    it("keeps the effect on the water a player asked for, one of real, ×5, ×10, ×20, and tells it to the room", () => {
        const { manager, sent } = harness();
        const track = {
            category: 4,
            minutes: 5,
            heading: 0,
            southern: false,
            startedAt: 0,
            fromX: 0,
            fromY: 0,
            toX: 0,
            toY: 0,
            anchorX: 0,
            anchorY: 0,
            durationMs: 0,
            times: 0,
            waterEffect: 0,
        };
        manager.request(1, CatastropheKind.CATASTROPHE_HURRICANE, -1, -1, 0, true, false, undefined, {
            ...track,
            waterEffect: 12,
        });
        expect(sent[0].hurricane?.waterEffect).toBe(10);
        expect(manager.hurricane()?.waterEffect).toBe(10);
        manager.stopHurricane();
        manager.request(1, CatastropheKind.CATASTROPHE_HURRICANE, -1, -1, 0, true, false, undefined, track);
        // Not said (an older browser): the real effect.
        expect(sent[sent.length - 1].hurricane?.waterEffect).toBe(1);
    });

    it("shortens its crossing when the map goes faster, its eye going on from where it is", () => {
        const { manager, sent } = harness();
        let times = 1;
        manager.hurricaneTimesWith(() => times);
        const asked = {
            category: 4,
            minutes: 5,
            heading: 0,
            southern: false,
            startedAt: 0,
            fromX: 0,
            fromY: 0,
            toX: 0,
            toY: 0,
            anchorX: 0,
            anchorY: 0,
            durationMs: 0,
            times: 0,
            waterEffect: 0,
        };
        manager.request(1, CatastropheKind.CATASTROPHE_HURRICANE, -1, -1, 0, true, false, undefined, asked);
        expect(sent[0].hurricane).toMatchObject({ durationMs: 300_000, times: 1, minutes: 5 });
        vi.advanceTimersByTime(100_000);
        times = 5;
        vi.advanceTimersByTime(HURRICANE_TELL_MS);
        const told = sent[sent.length - 1].hurricane;
        expect(told).toMatchObject({ durationMs: 60_000, times: 5, minutes: 5 });
        // A third of the passage was gone when it sped up: a third of the new one is.
        expect((101_000 - (told?.startedAt ?? NaN)) / 60_000).toBeCloseTo(101_000 / 300_000, 2);
        expect(sent[sent.length - 1].impactInMs).toBeCloseTo(60_000 * (1 - 101_000 / 300_000), -2);
    });

    it("tells a sped-up hurricane in whole milliseconds, which its message can carry", () => {
        const { manager, sent } = harness();
        let times = 1;
        manager.hurricaneTimesWith(() => times);
        const asked = {
            category: 4,
            minutes: 5,
            heading: 0,
            southern: false,
            startedAt: 0,
            fromX: 0,
            fromY: 0,
            toX: 0,
            toY: 0,
            anchorX: 0,
            anchorY: 0,
            durationMs: 0,
            times: 0,
            waterEffect: 0,
        };
        manager.request(1, CatastropheKind.CATASTROPHE_HURRICANE, -1, -1, 0, true, false, undefined, asked);
        vi.advanceTimersByTime(100_000);
        // Three times faster a third of the way: its start falls on a fraction of a millisecond.
        times = 3;
        vi.advanceTimersByTime(HURRICANE_TELL_MS);
        const told = sent[sent.length - 1];
        expect(Number.isInteger(told.hurricane?.startedAt)).toBe(false);
        expect(Number.isInteger(told.impactInMs)).toBe(true);
    });
});

describe("CatastropheManager, tsunamis", () => {
    const TSUNAMI = CatastropheKind.CATASTROPHE_TSUNAMI;
    const asked = (metres: number, minutes: number) => ({ metres, minutes, startedAt: 0, durationMs: 0 });

    it("sends a tsunami to the coast, told to the room once a second until its backwash is over", () => {
        const { manager, sent } = harness();
        expect(manager.request(1, TSUNAMI, 0, 0, 0, true, false, undefined, undefined, asked(8, 3))).toBe(true);
        expect(sent).toHaveLength(1);
        expect(sent[0]).toMatchObject({ kind: TSUNAMI, impactInMs: 180_000 + TSUNAMI_BACKWASH_MS, wholeMap: true });
        expect(sent[0].tsunami).toStrictEqual({ metres: 8, minutes: 3, startedAt: 0, durationMs: 180_000 });
        expect(manager.tsunami()).toMatchObject({ metres: 8, durationMs: 180_000, startedAt: 0 });
        vi.advanceTimersByTime(TSUNAMI_TELL_MS);
        expect(sent).toHaveLength(2);
        expect(sent[1].impactInMs).toBe(180_000 + TSUNAMI_BACKWASH_MS - TSUNAMI_TELL_MS);
        vi.advanceTimersByTime(180_000 + TSUNAMI_BACKWASH_MS);
        expect(manager.tsunami()).toBeUndefined();
        expect(sent[sent.length - 1].impactInMs).toBe(0);
        const told = sent.length;
        vi.advanceTimersByTime(5 * TSUNAMI_TELL_MS);
        expect(sent).toHaveLength(told);
    });

    it("keeps its height and its duration within what a tsunami may be", () => {
        const { manager } = harness();
        manager.request(1, TSUNAMI, 0, 0, 0, true, false, undefined, undefined, asked(40, 500));
        expect(manager.tsunami()).toMatchObject({
            metres: TSUNAMI_MAX_METRES,
            durationMs: TSUNAMI_MAX_MINUTES * 60_000,
        });
    });

    it("one a room: refused while one goes on, stopped by anyone, and none once the room stops", () => {
        const { manager, sent } = harness();
        expect(manager.request(1, TSUNAMI, 0, 0, 0, true, false, undefined, undefined, asked(4, 1))).toBe(true);
        expect(manager.request(2, TSUNAMI, 0, 0, 0, true, false, undefined, undefined, asked(4, 1))).toBe(false);
        // No tsunami without its settings.
        expect(manager.request(2, TSUNAMI, 0, 0, 0, true, true)).toBe(true);
        expect(sent[sent.length - 1].impactInMs).toBe(0);
        expect(manager.tsunami()).toBeUndefined();
        expect(manager.request(2, TSUNAMI, 0, 0, 0, true)).toBe(false);
        manager.stop();
        expect(manager.request(1, TSUNAMI, 0, 0, 0, true, false, undefined, undefined, asked(4, 1))).toBe(false);
    });

    it("waits for the size of the map: no coast before", () => {
        const { manager } = harness(() => undefined);
        expect(manager.request(1, TSUNAMI, 0, 0, 0, true, false, undefined, undefined, asked(4, 1))).toBe(false);
    });
});

describe("CatastropheManager, a horde of zombies", () => {
    const ask = {
        count: 1500,
        minutes: 3,
        heading: 90,
        seed: 0,
        startedAt: 0,
        durationMs: 0,
        dirX: 0,
        dirY: 0,
        anchorX: 0,
        anchorY: 0,
        widthCells: 0,
        heightCells: 0,
        terrain: "",
        terrainHash: 0,
        collisions: "",
        collisionsWidth: 0,
        collisionsHeight: 0,
        anchorStep: 0,
        anchorAt: 0,
        msPerStep: 0,
        avatars: "",
        safeStep: 0,
    };
    /** A map of 40 x 30 cells (640 x 480 px, 20 x 15 tiles), a pond in its middle, two avatars. */
    function zombieHarness() {
        const harnessed = harness();
        const cells = new Uint8Array(40 * 30);
        for (let cell = 15 * 40 + 18; cell < 15 * 40 + 22; cell++) cells[cell] = ZOMBIE_WATER;
        const solids: boolean[] = [];
        const read = vi.fn((solid: (tileX: number, tileY: number) => boolean) => {
            solids.push(solid(3, 4), solid(4, 4));
            return { widthCells: 40, heightCells: 30, cells };
        });
        const avatars = [
            { key: 7, x: 100, y: 100 },
            { key: 9, x: 300, y: 200 },
        ];
        let times = 1;
        harnessed.manager.zombieTerrainWith(read);
        harnessed.manager.zombieAvatarsWith(() => avatars);
        harnessed.manager.zombieTimesWith(() => times);
        return { ...harnessed, read, cells, avatars, solids, speed: (next: number) => (times = next) };
    }

    it("sends a horde across the map, told once a second, its ground at once and every five seconds", () => {
        const { manager, sent, read, cells } = zombieHarness();
        expect(manager.startZombies(ask)).toBe(true);
        expect(read).toHaveBeenCalledTimes(1);
        expect(sent).toHaveLength(1);
        expect(sent[0]).toMatchObject({ kind: CatastropheKind.CATASTROPHE_ZOMBIES, impactInMs: 3 * 60_000 });
        const told = sent[0].zombies;
        expect(told).toMatchObject({
            count: 1500,
            minutes: 3,
            heading: 90,
            startedAt: 0,
            durationMs: 180_000,
            dirX: 1,
            dirY: 0,
            anchorX: 320,
            anchorY: 240,
            widthCells: 40,
            heightCells: 30,
            anchorStep: 0,
            anchorAt: 0,
            msPerStep: 100,
        });
        expect(decodeZombieTerrain(told?.terrain ?? "", 40 * 30)).toEqual(cells);
        expect(told?.terrainHash).toBe(zombieTerrainHash(told?.terrain ?? ""));
        vi.advanceTimersByTime(ZOMBIE_TELL_MS);
        expect(sent[1]).toMatchObject({ id: sent[0].id, impactInMs: 180_000 - ZOMBIE_TELL_MS });
        expect(sent[1].zombies).toMatchObject({ terrain: "", terrainHash: told?.terrainHash, seed: told?.seed });
        vi.advanceTimersByTime(ZOMBIE_TERRAIN_TELL_MS - ZOMBIE_TELL_MS);
        expect(sent[sent.length - 1].zombies?.terrain).toBe(told?.terrain);
        vi.advanceTimersByTime(180_000);
        expect(sent[sent.length - 1]).toMatchObject({ id: sent[0].id, impactInMs: 0 });
        expect(manager.zombies()).toBeUndefined();
        const count = sent.length;
        vi.advanceTimersByTime(5 * ZOMBIE_TELL_MS);
        expect(sent).toHaveLength(count);
    });

    it("tells where the avatars stand, applied 2.5 s later, the log complete to the step before", () => {
        const { manager, sent, avatars } = zombieHarness();
        manager.startZombies(ask);
        const first = decodeZombieLog(sent[0].zombies?.avatars ?? "");
        // Two avatars, a tile each (20 tiles across), 25 steps after now.
        expect(first).toEqual([
            {
                applyStep: 25,
                changes: [
                    { slot: 0, tile: 3 * 20 + 3 },
                    { slot: 1, tile: 6 * 20 + 9 },
                ],
            },
        ]);
        expect(sent[0].zombies?.safeStep).toBe(24);
        // One moves, the other leaves: one entry a second later, the log whole again.
        avatars[0].x = 140;
        avatars.splice(1, 1);
        vi.advanceTimersByTime(ZOMBIE_TELL_MS);
        const second = decodeZombieLog(sent[1].zombies?.avatars ?? "");
        expect(second).toHaveLength(2);
        expect(second[1]).toEqual({
            applyStep: 35,
            changes: [
                { slot: 0, tile: 3 * 20 + 4 },
                { slot: 1, tile: -1 },
            ],
        });
        expect(sent[1].zombies?.safeStep).toBe(34);
        // Nothing moved: no entry, the log complete further.
        vi.advanceTimersByTime(ZOMBIE_TELL_MS);
        expect(decodeZombieLog(sent[2].zombies?.avatars ?? "")).toHaveLength(2);
        expect(sent[2].zombies?.safeStep).toBe(44);
    });

    it("goes as fast as the map, on from the same step, its time left in whole ms", () => {
        const { manager, sent, speed } = zombieHarness();
        manager.startZombies(ask);
        vi.advanceTimersByTime(10_000);
        speed(5);
        vi.advanceTimersByTime(ZOMBIE_TELL_MS);
        const told = sent[sent.length - 1].zombies;
        // At 11 s (step 110), a step every 20 ms from then on.
        expect(told).toMatchObject({ msPerStep: 20, anchorAt: 11_000 });
        expect(told?.anchorStep).toBeCloseTo(110, 6);
        const left = sent[sent.length - 1].impactInMs;
        expect(left).toBe((1800 - 110) * 20);
        expect(Number.isInteger(left)).toBe(true);
        // The log is applied 2.5 s of reality later: 125 steps at five times the speed.
        expect(told?.safeStep).toBe(110 + 125 - 1);
    });

    it("freezes the collisions the player sent when they fit the map, and none when they do not", () => {
        const { manager, solids } = zombieHarness();
        const tiles = new Uint8Array(20 * 15);
        tiles[4 * 20 + 3] = 1;
        manager.startZombies({
            ...ask,
            collisions: encodeZombieTerrain(tiles),
            collisionsWidth: 20,
            collisionsHeight: 15,
        });
        expect(solids).toEqual([true, false]);
        manager.stopZombies();
        manager.startZombies({
            ...ask,
            collisions: encodeZombieTerrain(tiles),
            collisionsWidth: 19,
            collisionsHeight: 15,
        });
        expect(solids.slice(2)).toEqual([false, false]);
    });

    it("keeps one horde a room, which anyone stops, and keeps what is asked within bounds", () => {
        const { manager, sent } = zombieHarness();
        expect(manager.startZombies({ ...ask, count: 1_000_000, minutes: 99, heading: 450 })).toBe(true);
        expect(manager.zombies()).toMatchObject({ count: 4000, durationMs: 15 * 60_000, heading: 90 });
        expect(manager.startZombies(ask)).toBe(false);
        expect(manager.stopZombies()).toBe(true);
        expect(sent[sent.length - 1]).toMatchObject({ kind: CatastropheKind.CATASTROPHE_ZOMBIES, impactInMs: 0 });
        expect(manager.zombies()).toBeUndefined();
        expect(manager.stopZombies()).toBe(false);
        expect(manager.startZombies(ask)).toBe(true);
        manager.stop();
        const count = sent.length;
        vi.advanceTimersByTime(5 * ZOMBIE_TELL_MS);
        expect(sent).toHaveLength(count);
        expect(manager.startZombies(ask)).toBe(false);
    });

    it("puts a grenade shot into the horde in its log, going off after its fuse, told at once, once a second, at will", () => {
        const { manager, sent } = zombieHarness();
        expect(manager.zombieGrenade("p7", { fromX: 100, fromY: 100, toX: 300, toY: 100 })).toBe(false);
        manager.startZombies(ask);
        vi.advanceTimersByTime(2_000);
        const before = sent.length;
        expect(manager.zombieGrenade("p7", { fromX: 100, fromY: 100, toX: 300, toY: 100 })).toBe(true);
        expect(sent).toHaveLength(before + 1);
        // Told at once, alone: the entry before it (the avatars, which did not move since) was told already.
        expect(sent[sent.length - 1].zombies?.logFrom).toBe(1);
        const log = decodeZombieLog(sent[sent.length - 1].zombies?.avatars ?? "");
        expect(log).toHaveLength(1);
        const shot = log.find((entry) => entry.grenades);
        // Shot at step 20: it goes off 40 steps later, after the step the log was complete to (44).
        expect(shot).toMatchObject({ applyStep: 60, grenades: [{ fromX: 100, fromY: 100, toX: 300, toY: 100 }] });
        expect(manager.zombieGrenade("p7", { fromX: 100, fromY: 100, toX: 300, toY: 100 })).toBe(false);
        expect(manager.zombieGrenade("p9", { fromX: 100, fromY: 100, toX: 9000, toY: 100 })).toBe(false);
        vi.advanceTimersByTime(1_000);
        expect(manager.zombieGrenade("p7", { fromX: 100, fromY: 100, toX: 300, toY: 100 })).toBe(true);
        // As many as a player likes while the horde goes on, once a second: far past the twelve of before.
        for (let shot = 2; shot < 40; shot++) {
            vi.advanceTimersByTime(1_000);
            expect(manager.zombieGrenade("p7", { fromX: 100, fromY: 100, toX: 300, toY: 100 })).toBe(true);
            expect(manager.zombieGrenade("p7", { fromX: 100, fromY: 100, toX: 300, toY: 100 })).toBe(false);
        }
        expect(manager.zombieGrenade("p8", { fromX: 100, fromY: 100, toX: 300, toY: 100 })).toBe(true);
        // A player is known by their uuid: their second connection shoots no faster.
        vi.advanceTimersByTime(1_000);
        expect(manager.zombieGrenade("p8", { fromX: 100, fromY: 100, toX: 300, toY: 100 })).toBe(true);
        expect(manager.zombieGrenade("p8", { fromX: 100, fromY: 100, toX: 300, toY: 100 })).toBe(false);
    });

    it("refuses a grenade past 128 in the air in a horde, and takes them again once some went off", () => {
        const { manager } = zombieHarness();
        manager.startZombies(ask);
        vi.advanceTimersByTime(1_000);
        const shoot = (shooter: string) =>
            manager.zombieGrenade(shooter, { fromX: 100, fromY: 100, toX: 300, toY: 100 });
        // 4 a player for the 32 players a horde follows.
        for (let shooter = 0; shooter < 4 * 32; shooter++) expect(shoot(`p${shooter}`)).toBe(true);
        expect(shoot("one-more")).toBe(false);
        // Their fuse burnt (4 s): there is room again.
        vi.advanceTimersByTime(4_100);
        expect(shoot("one-more")).toBe(true);
    });

    // Ten seconds or so on a runner of the CI (6.3 s once for the 5 s of before): far from a loop, not a hang.
    it(
        "keeps its log within bounds over a horde of 15 minutes with 40 players shooting every second",
        { timeout: 30_000 },
        () => {
            const { manager, sent } = zombieHarness();
            manager.startZombies({ ...ask, minutes: 15 });
            // The longest a horde lasts, whatever is asked.
            expect(manager.zombies()?.durationMs).toBe(15 * 60_000);
            let tellsOfASecond = 0;
            let mostTold = 0;
            // What a browser is sent (its log and its ground, base64): as it is now, and as it was before the log was
            // told by its end (the whole log in every message, the ground every 5 s).
            let bytesNow = 0;
            let bytesBefore = 0;
            const terrainLength = manager.zombies()?.terrain.length ?? 0;
            for (let second = 1; second < 15 * 60; second++) {
                const before = sent.length;
                vi.advanceTimersByTime(1_000);
                for (let shooter = 0; shooter < 40; shooter++) {
                    manager.zombieGrenade(`p${shooter}`, { fromX: 100, fromY: 100, toX: 300, toY: 100 });
                }
                const ofThisSecond = sent.slice(before);
                for (const message of ofThisSecond) {
                    const length = (message.zombies?.avatars.length ?? 0) + (message.zombies?.terrain.length ?? 0);
                    mostTold = Math.max(mostTold, length);
                    bytesNow += length;
                }
                bytesBefore += ofThisSecond.length * (manager.zombies()?.avatars.length ?? 0);
                if (second % 5 === 0) bytesBefore += terrainLength;
                tellsOfASecond = Math.max(tellsOfASecond, ofThisSecond.length);
            }
            const entries = decodeZombieLog(manager.zombies()?.avatars ?? "");
            const shots = entries.filter((entry) => entry.grenades).length;
            // 32 shots a second at most (128 in the air, a fuse of 4 s), whoever shoots: 40 players shoot no more.
            expect(shots).toBeLessThanOrEqual(32 * 15 * 60);
            expect(shots).toBeGreaterThan(30 * 15 * 60);
            const told = sent.map((message) => message.zombies).filter((zombies) => zombies !== undefined);
            const tails = told.filter((zombies) => zombies.terrain === "");
            const tail = Math.max(...tails.map((zombies) => zombies.avatars.length));
            const whole = Math.max(...told.map((zombies) => zombies.avatars.length));
            // Each second: the last 10 s of it, some 320 shots, under 8 KB; a shot alone, a few bytes; the whole log
            // with the ground every 30 s, under 600 KB at the end of the longest horde.
            expect(tail).toBeLessThan(8_000);
            const alone = Math.min(
                ...told.filter((zombies) => (zombies.logFrom ?? 0) > 0).map((z) => z.avatars.length),
            );
            expect(alone).toBeLessThan(40);
            expect(whole).toBeLessThan(600_000);
            expect(mostTold).toBeLessThan(600_000);
            expect(tellsOfASecond).toBeLessThanOrEqual(41);
            const perSecondNow = Math.round(bytesNow / (15 * 60));
            const perSecondBefore = Math.round(bytesBefore / (15 * 60));
            expect(perSecondNow).toBeLessThan(25_000);
            expect(perSecondNow * 100).toBeLessThan(perSecondBefore);
        },
    );

    const dartFrom = { uuid: "p7", basic: false, x: 100, y: 100 };
    const dart = (shotStep: number, fromX = 110) => ({ fromX, fromY: 100, toX: 300, toY: 100, shotStep });

    it("puts a dart of the Nerf into the horde in its log, applied once it flew and every browser has it, told at once", () => {
        const { manager, sent } = zombieHarness();
        expect(manager.zombieDart(dartFrom, dart(0))).toBe(false);
        manager.startZombies(ask);
        vi.advanceTimersByTime(2_000);
        const before = sent.length;
        // At step 20, the log complete to step 44: a dart shot at step 20 flies 12 steps, and is applied at step 45.
        expect(manager.zombieDart(dartFrom, dart(20))).toBe(true);
        expect(sent).toHaveLength(before + 1);
        expect(sent[sent.length - 1].zombies?.logFrom).toBe(1);
        const log = decodeZombieLog(sent[sent.length - 1].zombies?.avatars ?? "");
        // Its end where the range of the Nerf ends (384 px), on the line through the point aimed at.
        expect(log).toEqual([
            {
                applyStep: 45,
                changes: [],
                darts: [{ fromX: 110, fromY: 100, toX: 494, toY: 100, shotStep: 20, stride: 1 }],
            },
        ]);
        // Every 250 ms at most for a player, by their uuid (a second tab of theirs shoots no faster); another may.
        expect(manager.zombieDart(dartFrom, dart(20))).toBe(false);
        expect(manager.zombieDart({ ...dartFrom, uuid: "p8" }, dart(20))).toBe(true);
        vi.advanceTimersByTime(250);
        expect(manager.zombieDart(dartFrom, dart(22))).toBe(true);
        // Applied in the order they are told, never before a dart told before.
        const steps = decodeZombieLog(manager.zombies()?.avatars ?? "")
            .filter((entry) => entry.darts)
            .map((entry) => entry.applyStep);
        expect(steps).toEqual([45, 45, 45]);
        vi.advanceTimersByTime(250);
        // Refused: a player in Basique, a barrel off the map or away from the avatar, a step too far from the server's
        // (25 now: 5 steps late at most, 2 ahead), a step that is not whole, the same point twice.
        expect(manager.zombieDart({ ...dartFrom, basic: true }, dart(25))).toBe(false);
        expect(manager.zombieDart({ ...dartFrom, x: -5 }, dart(25, -5))).toBe(false);
        expect(manager.zombieDart(dartFrom, dart(25, 210))).toBe(false);
        expect(manager.zombieDart(dartFrom, dart(19))).toBe(false);
        expect(manager.zombieDart(dartFrom, dart(28))).toBe(false);
        expect(manager.zombieDart(dartFrom, dart(24.5))).toBe(false);
        expect(manager.zombieDart(dartFrom, { fromX: 110, fromY: 100, toX: 110, toY: 100, shotStep: 25 })).toBe(false);
        expect(manager.zombieDart(dartFrom, dart(20))).toBe(true);
    });

    it("lets a dart fly as long to the eye on a map sped up, its ticks that many steps", () => {
        const { manager, speed } = zombieHarness();
        manager.startZombies(ask);
        vi.advanceTimersByTime(10_000);
        speed(5);
        vi.advanceTimersByTime(ZOMBIE_TELL_MS);
        // At 11 s, step 110, a step every 20 ms; the log complete to 234.
        const step = Math.ceil(manager.zombies()?.anchorStep ?? 0);
        expect(manager.zombieDart(dartFrom, dart(step))).toBe(true);
        const shot = decodeZombieLog(manager.zombies()?.avatars ?? "").find((entry) => entry.darts);
        expect(shot?.darts?.[0]).toMatchObject({ shotStep: step, stride: 5 });
        expect(shot?.applyStep).toBe(235);
    });

    it("refuses a dart past 48 in a second in a horde, and takes them again a second later", () => {
        const { manager } = zombieHarness();
        manager.startZombies(ask);
        vi.advanceTimersByTime(1_000);
        const shoot = (shooter: string) => manager.zombieDart({ ...dartFrom, uuid: shooter }, dart(10));
        for (let shooter = 0; shooter < 48; shooter++) expect(shoot(`p${shooter}`)).toBe(true);
        expect(shoot("one-more")).toBe(false);
        vi.advanceTimersByTime(1_000);
        expect(manager.zombieDart({ ...dartFrom, uuid: "one-more" }, dart(20))).toBe(true);
    });

    it(
        "keeps its log within bounds over a horde of 15 minutes with 40 players firing their Nerf every 300 ms",
        { timeout: 60_000 },
        () => {
            const { manager, sent } = zombieHarness();
            manager.startZombies({ ...ask, minutes: 15 });
            let mostTold = 0;
            let bytes = 0;
            for (let tick = 1; tick < 15 * 60 * 10; tick++) {
                vi.advanceTimersByTime(100);
                if (tick % 3 !== 0) continue;
                // At the speed of reality: a step every 100 ms.
                for (let shooter = 0; shooter < 40; shooter++) {
                    manager.zombieDart({ ...dartFrom, uuid: `p${shooter}` }, dart(tick));
                }
            }
            for (const message of sent) {
                const length = (message.zombies?.avatars.length ?? 0) + (message.zombies?.terrain.length ?? 0);
                mostTold = Math.max(mostTold, length);
                bytes += length;
            }
            const entries = decodeZombieLog(manager.zombies()?.avatars ?? "");
            const darts = entries.filter((entry) => entry.darts).length;
            // 48 darts a second at most, whoever shoots: 40 players firing 133 a second take no more (40 a second here:
            // their 40 shots at once, then 8, then none until the second of the first is past).
            expect(darts).toBeLessThanOrEqual(48 * 15 * 60);
            expect(darts).toBeGreaterThan(30 * 15 * 60);
            const told = sent.map((message) => message.zombies).filter((zombies) => zombies !== undefined);
            const tails = told.filter((zombies) => zombies.terrain === "");
            const tail = Math.max(...tails.map((zombies) => zombies.avatars.length));
            const whole = Math.max(...told.map((zombies) => zombies.avatars.length));
            const alone = Math.min(
                ...told.filter((zombies) => (zombies.logFrom ?? 0) > 0).map((z) => z.avatars.length),
            );
            // A dart alone, a few bytes; each second the last 10 s, some 480 darts, under 10 KB; the whole log with the
            // ground every 30 s, under 1 MB at the end of the longest horde.
            expect(alone).toBeLessThan(30);
            expect(tail).toBeLessThan(10_000);
            expect(whole).toBeLessThan(1_000_000);
            expect(mostTold).toBeLessThan(1_000_000);
            expect(Math.round(bytes / (15 * 60))).toBeLessThan(40_000);
        },
    );

    it("answers a player who asks for the whole horde alone, once in 1.5 s at most", () => {
        const { manager } = zombieHarness();
        expect(manager.wholeZombies("p1")).toBeUndefined();
        manager.startZombies(ask);
        vi.advanceTimersByTime(3_000);
        manager.zombieGrenade("p2", { fromX: 100, fromY: 100, toX: 300, toY: 100 });
        const whole = manager.wholeZombies("p1");
        expect(whole?.zombies?.terrain).toBe(manager.zombies()?.terrain);
        expect(whole?.zombies?.logFrom).toBe(0);
        expect(whole?.zombies?.avatars).toBe(manager.zombies()?.avatars);
        expect(decodeZombieLog(whole?.zombies?.avatars ?? "").some((entry) => entry.grenades)).toBe(true);
        expect(manager.wholeZombies("p1")).toBeUndefined();
        expect(manager.wholeZombies("p3")).toBeDefined();
        vi.advanceTimersByTime(1_000);
        expect(manager.wholeZombies("p1")).toBeUndefined();
        vi.advanceTimersByTime(500);
        expect(manager.wholeZombies("p1")).toBeDefined();
    });

    it("tells each second the entries of its log of the last 10 s only, and the whole log with its ground", () => {
        const { manager, sent } = zombieHarness();
        manager.startZombies(ask);
        // A grenade a second for 30 s: some 30 entries of shots, and the avatars read.
        for (let second = 0; second < 30; second++) {
            vi.advanceTimersByTime(1_000);
            manager.zombieGrenade("p7", { fromX: 100, fromY: 100, toX: 300, toY: 100 });
        }
        const whole = manager.zombies()?.avatars ?? "";
        const entries = decodeZombieLog(whole);
        expect(entries.filter((entry) => entry.grenades)).toHaveLength(30);
        const told = sent.map((message) => message.zombies).filter((zombies) => zombies !== undefined);
        // With its ground (at once, then every 30 s): the whole log.
        const withGround = told.filter((zombies) => zombies.terrain !== "");
        expect(withGround.length).toBe(2);
        for (const zombies of withGround) expect(zombies.logFrom ?? 0).toBe(0);
        expect(withGround[withGround.length - 1].avatars.length).toBeGreaterThan(200);
        // Each second without it: its last entries, a dozen or so, the same as the end of the whole log.
        const last = told.filter((zombies) => zombies.terrain === "" && zombies.grenade === undefined).at(-1);
        const from = last?.logFrom ?? 0;
        expect(from).toBeGreaterThan(20);
        const tail = decodeZombieLog(last?.avatars ?? "");
        expect(tail.length).toBeLessThanOrEqual(12);
        expect(tail).toEqual(decodeZombieLog(whole).slice(from, from + tail.length));
    });

    it("sends no horde before the size of the map is read", () => {
        const { manager, sent } = harness();
        expect(manager.startZombies(ask)).toBe(false);
        manager.zombieTerrainWith(() => undefined);
        expect(manager.startZombies(ask)).toBe(false);
        expect(sent).toHaveLength(0);
    });
});
