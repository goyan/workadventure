import { METEOR_COOLDOWN_MS, METEOR_FALL_MS, METEORS_PER_ROOM } from "@workadventure/map-editor";
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
    const strike = vi.fn<(x: number, y: number) => void>();
    const manager = new CatastropheManager(room, mapSize, strike, () => Date.now());
    return { manager, sent, strike };
}

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("CatastropheManager", () => {
    it("announces the meteor and strikes after the fall", () => {
        const { manager, sent, strike } = harness();
        expect(manager.launch(1, METEOR, 320, 160)).toBe(true);
        expect(sent).toHaveLength(1);
        expect(sent[0]).toMatchObject({ kind: METEOR, x: 320, y: 160, impactInMs: 1200 });
        vi.advanceTimersByTime(METEOR_FALL_MS - 1);
        expect(strike).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(strike).toHaveBeenCalledWith(320, 160);
    });

    it("one meteor every three seconds for a player", () => {
        const { manager } = harness();
        expect(manager.launch(1, METEOR, 10, 10)).toBe(true);
        vi.advanceTimersByTime(METEOR_COOLDOWN_MS - 1);
        expect(manager.launch(1, METEOR, 10, 10)).toBe(false);
        vi.advanceTimersByTime(1);
        expect(manager.launch(1, METEOR, 10, 10)).toBe(true);
    });

    it("lets another player launch at once", () => {
        const { manager } = harness();
        expect(manager.launch(1, METEOR, 10, 10)).toBe(true);
        expect(manager.launch(2, METEOR, 10, 10)).toBe(true);
    });

    it("five meteors in flight at most in a room", () => {
        const { manager } = harness();
        for (let player = 1; player <= METEORS_PER_ROOM; player++) {
            expect(manager.launch(player, METEOR, 10, 10)).toBe(true);
        }
        expect(manager.launch(METEORS_PER_ROOM + 1, METEOR, 10, 10)).toBe(false);
        vi.advanceTimersByTime(METEOR_FALL_MS);
        expect(manager.launch(METEORS_PER_ROOM + 1, METEOR, 10, 10)).toBe(true);
    });

    it("a refused launch does not restart the cooldown of the player", () => {
        const { manager } = harness();
        expect(manager.launch(1, METEOR, 10, 10)).toBe(true);
        vi.advanceTimersByTime(2000);
        expect(manager.launch(1, METEOR, 10, 10)).toBe(false);
        vi.advanceTimersByTime(1000);
        expect(manager.launch(1, METEOR, 10, 10)).toBe(true);
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
            expect(manager.launch(1, METEOR, x, y)).toBe(false);
        }
        expect(sent).toHaveLength(0);
        expect(harness(() => undefined).manager.launch(1, METEOR, 10, 10)).toBe(false);
    });

    it("refuses a kind it does not know", () => {
        const { manager, sent } = harness();
        expect(manager.launch(1, CatastropheKind.UNRECOGNIZED, 10, 10)).toBe(false);
        expect(sent).toHaveLength(0);
    });

    it("a strike that throws stops nothing", () => {
        const { manager, strike } = harness();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        strike.mockImplementationOnce(() => {
            throw new Error("boom");
        });
        expect(manager.launch(1, METEOR, 10, 10)).toBe(true);
        expect(() => vi.advanceTimersByTime(METEOR_FALL_MS)).not.toThrow();
        expect(manager.launch(2, METEOR, 20, 20)).toBe(true);
        vi.advanceTimersByTime(METEOR_FALL_MS);
        expect(strike).toHaveBeenLastCalledWith(20, 20);
    });

    it("stop cancels the meteors in flight", () => {
        const { manager, strike } = harness();
        manager.launch(1, METEOR, 10, 10);
        manager.stop();
        vi.advanceTimersByTime(2000);
        expect(strike).not.toHaveBeenCalled();
    });
});
