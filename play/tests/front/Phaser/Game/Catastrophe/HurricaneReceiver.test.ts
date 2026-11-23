import { CatastropheKind } from "@workadventure/messages";
import type { CatastropheMessage } from "@workadventure/messages";
import type { Hurricane, HurricaneNow } from "@workadventure/map-editor";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HurricaneReceiver } from "../../../../../src/front/Phaser/Game/Catastrophe/HurricaneReceiver";

const START = 1_800_000_000_000;

function told(impactInMs: number, startedAt = START): CatastropheMessage {
    return {
        id: 5,
        kind: CatastropheKind.CATASTROPHE_HURRICANE,
        x: 0,
        y: 0,
        impactInMs,
        radiusTiles: 0,
        wholeMap: true,
        hurricane: { category: 3, minutes: 20, offsetKm: -10, heading: 270, southern: true, startedAt },
    };
}

afterEach(() => {
    vi.useRealTimers();
});

describe("HurricaneReceiver", () => {
    it("knows the hurricane the server tells, and what it is now at the time of the server", () => {
        vi.useFakeTimers();
        const seen: { hurricane: Hurricane | undefined; now: HurricaneNow | undefined }[] = [];
        const receiver = new HurricaneReceiver(
            () => START + 60_000,
            (hurricane, now) => seen.push({ hurricane, now }),
        );
        receiver.report(told(19 * 60_000));
        expect(seen[0].hurricane).toEqual({
            id: 5,
            startedAt: START,
            category: 3,
            durationMs: 20 * 60_000,
            offsetKm: -10,
            heading: 270,
            southern: true,
        });
        expect(seen[0].now?.progress).toBeCloseTo(0.05, 6);
        receiver.destroy();
    });

    it("forgets it when the server says it ended, or says nothing more for a while", () => {
        vi.useFakeTimers();
        const seen: (Hurricane | undefined)[] = [];
        const receiver = new HurricaneReceiver(
            () => START + 60_000,
            (hurricane) => seen.push(hurricane),
        );
        receiver.report(told(19 * 60_000));
        receiver.report(told(0));
        expect(seen[seen.length - 1]).toBeUndefined();
        receiver.report(told(19 * 60_000));
        expect(seen[seen.length - 1]).toBeDefined();
        vi.advanceTimersByTime(5000);
        expect(seen[seen.length - 1]).toBeUndefined();
        receiver.destroy();
    });
});
