import { describe, expect, it, vi } from "vitest";
import type { CatastropheMessage } from "@workadventure/messages";
import { CatastropheKind } from "@workadventure/messages";
import { METEOR_FALL_MS } from "@workadventure/map-editor";
import { MeteorView } from "../../../../../src/front/Phaser/Game/Catastrophe/MeteorView";

/** A graphics that takes any drawing call, and keeps those drawn since it was last cleared. */
function fakeGraphics(drawn: string[]): Record<string, unknown> {
    const proxy: Record<string, unknown> = new Proxy(
        {},
        {
            get: (_target, name: string) => {
                if (name === "visible") return true;
                if (name === "clear") return () => ((drawn.length = 0), proxy);
                return (...args: unknown[]) => (drawn.push(`${name} ${args.join(" ")}`), proxy);
            },
        },
    );
    return proxy;
}

function createView() {
    const drawn: string[] = [];
    const scene = { markDirty: vi.fn(), add: { graphics: () => fakeGraphics(drawn) } };
    // Over water: the wave of the comet runs from its impact.
    const view = new MeteorView(
        scene as never,
        () => true,
        () => false,
    );
    /** What is drawn at `now`. */
    const drawnAt = (now: number): string => {
        view.update(now);
        return drawn.join("; ");
    };
    return { view, drawnAt };
}

const comet = (impactInMs: number) =>
    ({
        id: 1,
        kind: CatastropheKind.CATASTROPHE_METEOR,
        x: 320,
        y: 160,
        radiusTiles: 4,
        impactInMs,
    }) as unknown as CatastropheMessage;

describe("a comet that falls into a horde of zombies", () => {
    it("falls as long as the server says, and its wave runs from its impact only", () => {
        const { view, drawnAt } = createView();
        view.add(comet(2_500), 10_000);
        // Seen coming in from the moment it is launched, not held still above the map.
        const early = drawnAt(10_200);
        expect(early).not.toBe("");
        expect(drawnAt(10_600)).not.toBe(early);
        // Past the usual fall, it has not landed yet.
        expect(view.waterRings(10_000 + METEOR_FALL_MS + 100)).toEqual([]);
        expect(view.waterRings(12_400)).toEqual([]);
        expect(view.waterRings(12_600)).toHaveLength(1);
    });

    it("falls as before without a horde", () => {
        const { view } = createView();
        view.add(comet(METEOR_FALL_MS), 10_000);
        expect(view.waterRings(10_000 + METEOR_FALL_MS - 1)).toEqual([]);
        expect(view.waterRings(10_000 + METEOR_FALL_MS + 100)).toHaveLength(1);
    });
});
