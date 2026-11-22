import { describe, expect, it, vi } from "vitest";
import type { CatastropheMessage } from "@workadventure/messages";
import { DrainView } from "../../../../../src/front/Phaser/Game/Catastrophe/DrainView";

/** A graphics that takes any drawing call, and keeps the moves of its canvas. */
function fakeGraphics(): { moves: string[] } {
    const moves: string[] = [];
    const known: Record<string, unknown> = { moves };
    const proxy: { moves: string[] } = new Proxy(known, {
        get: (target, name: string) => {
            if (name in target) return target[name];
            if (name === "save" || name === "restore") return () => (moves.push(name), proxy);
            if (name === "translateCanvas") return (x: number, y: number) => (moves.push(`translate ${x} ${y}`), proxy);
            return () => proxy;
        },
    }) as unknown as { moves: string[] };
    return proxy;
}

function createView(dropAt?: (x: number, y: number) => number) {
    const made: { moves: string[] }[] = [];
    const scene = {
        markDirty: vi.fn(),
        add: {
            graphics: () => {
                const graphics = fakeGraphics();
                made.push(graphics);
                return graphics;
            },
        },
    };
    const view = new DrainView(scene as never, () => true, dropAt);
    return { view, made };
}

const drain = { id: "drain-1", x: 320, y: 640, radiusTiles: 3, impactInMs: 1000 } as unknown as CatastropheMessage;

describe("a drain seen on a relief in 3/4", () => {
    it("is drawn where the water under it is drawn: lower at the bottom of a hollow", () => {
        const dropAt = vi.fn(() => 48);
        const { view, made } = createView(dropAt);
        view.report(drain, 0);
        view.update(100);
        expect(dropAt).toHaveBeenCalledWith(320, 640);
        // Its funnel and its wisps of foam, both.
        expect(made).toHaveLength(2);
        for (const graphics of made) expect(graphics.moves).toEqual(["save", "translate 0 48", "restore"]);
    });

    it("is drawn at its place on flat ground, and without the relief in 3/4", () => {
        const { view, made } = createView();
        view.report(drain, 0);
        view.update(100);
        for (const graphics of made) expect(graphics.moves).toEqual([]);
    });
});
