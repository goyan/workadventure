import { CatastropheKind } from "@workadventure/messages";
import type { CatastropheMessage } from "@workadventure/messages";
import type { Tsunami } from "@workadventure/map-editor";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TsunamiReceiver } from "../../../../../src/front/Phaser/Game/Catastrophe/TsunamiReceiver";

function told(impactInMs: number, metres = 8): CatastropheMessage {
    return {
        id: 9,
        kind: CatastropheKind.CATASTROPHE_TSUNAMI,
        x: 0,
        y: 0,
        impactInMs,
        radiusTiles: 0,
        wholeMap: true,
        tsunami: { metres, minutes: 3, startedAt: 1000, durationMs: 180_000 },
    };
}

afterEach(() => {
    vi.useRealTimers();
});

describe("TsunamiReceiver", () => {
    it("knows the tsunami the server tells, keeps it while it is told again, and forgets it once stopped", () => {
        const seen: (Tsunami | undefined)[] = [];
        const receiver = new TsunamiReceiver((tsunami) => seen.push(tsunami));
        receiver.report(told(240_000));
        receiver.report(told(239_000));
        expect(seen[0]).toStrictEqual({ id: 9, startedAt: 1000, metres: 8, durationMs: 180_000 });
        // The same object: what reads it computes nothing again.
        expect(seen[1]).toBe(seen[0]);
        receiver.report(told(0));
        expect(seen[2]).toBeUndefined();
        receiver.destroy();
    });

    it("keeps the height told within its bounds, and forgets a tsunami the server stopped telling", () => {
        vi.useFakeTimers();
        const seen: (Tsunami | undefined)[] = [];
        const receiver = new TsunamiReceiver((tsunami) => seen.push(tsunami));
        receiver.report(told(240_000, 99));
        expect(seen[0]?.metres).toBe(10);
        vi.advanceTimersByTime(4000);
        expect(seen[seen.length - 1]).toBeUndefined();
        receiver.destroy();
    });
});
