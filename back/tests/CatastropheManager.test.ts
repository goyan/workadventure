import { METEOR_FALL_MS, METEORS_PER_ROOM } from "@workadventure/map-editor";
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
