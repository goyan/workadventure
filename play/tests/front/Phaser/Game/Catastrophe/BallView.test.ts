import { CatastropheKind } from "@workadventure/messages";
import type { CatastropheMessage } from "@workadventure/messages";
import { describe, expect, it, vi } from "vitest";
import { BallView } from "@wa/front/Phaser/Game/Catastrophe/BallView";

function graphics() {
    const made = {
        setDepth: vi.fn(() => made),
        clear: vi.fn(),
        fillStyle: vi.fn(),
        fillRect: vi.fn(),
        fillEllipse: vi.fn(),
        fillCircle: vi.fn(),
        lineStyle: vi.fn(),
        strokeCircle: vi.fn(),
        destroy: vi.fn(),
    };
    return made;
}

function harness() {
    const made: ReturnType<typeof graphics>[] = [];
    const scene = {
        add: {
            graphics: () => {
                const next = graphics();
                made.push(next);
                return next;
            },
        },
        markDirty: vi.fn(),
    };
    let version = 0;
    const view = new BallView(
        scene as unknown as Phaser.Scene & { markDirty(): void },
        () => ({ groundPx: 0, waterPx: 0 }),
        () => version,
    );
    const message = (over: Partial<CatastropheMessage> = {}): CatastropheMessage => ({
        id: 4,
        kind: CatastropheKind.CATASTROPHE_BALL,
        x: 320,
        y: 320,
        impactInMs: 600,
        radiusTiles: 2,
        wholeMap: false,
        ballX: 320,
        ballY: 320,
        ballRadius: 32,
        ...over,
    });
    return { view, scene, made, message, waterChanged: () => version++ };
}

describe("BallView", () => {
    it("draws the ball the server announces, at the depth of its middle, and its ring over the night", () => {
        const { view, scene, made, message } = harness();
        view.report(message(), 1000);
        view.update(1000);
        // The ring of all the balls, then the body of this one.
        expect(made).toHaveLength(2);
        const [ring, body] = made;
        expect(body.fillRect.mock.calls.length).toBeGreaterThan(100);
        expect(body.setDepth).toHaveBeenLastCalledWith(320);
        expect(ring.strokeCircle).toHaveBeenCalledWith(320, 320, 32);
        expect(scene.markDirty).toHaveBeenCalledTimes(1);
    });

    it("does not draw again a ball that did not move, until the water changes", () => {
        const { view, scene, made, message, waterChanged } = harness();
        view.report(message(), 1000);
        view.update(1000);
        const body = made[1];
        const drawn = body.fillRect.mock.calls.length;
        view.report(message(), 1200);
        view.update(1216);
        view.update(1232);
        expect(body.fillRect.mock.calls.length).toBe(drawn);
        expect(scene.markDirty).toHaveBeenCalledTimes(1);
        waterChanged();
        view.update(1248);
        expect(body.fillRect.mock.calls.length).toBe(2 * drawn);
        expect(scene.markDirty).toHaveBeenCalledTimes(2);
    });

    it("moves the ball after what its player asks between two messages, then shrinks it and forgets it", () => {
        const { view, made, message } = harness();
        view.report(message({ x: 520 }), 1000);
        view.update(1500);
        const body = made[1];
        expect(body.setDepth).toHaveBeenLastCalledWith(320);
        expect(made[0].strokeCircle).toHaveBeenLastCalledWith(352, 320, 32);
        // No message any more: half a second after it is let go, it has no radius left.
        view.update(2200);
        expect(body.destroy).toHaveBeenCalled();
        // Nothing left to do: nothing is drawn any more.
        const cleared = made[0].clear.mock.calls.length;
        view.update(2300);
        expect(made[0].clear.mock.calls.length).toBe(cleared);
    });

    it("costs nothing while no ball stands on the map", () => {
        const { view, scene, made } = harness();
        view.update(1000);
        expect(made).toHaveLength(1);
        expect(made[0].clear).not.toHaveBeenCalled();
        expect(scene.markDirty).not.toHaveBeenCalled();
        view.destroy();
        expect(made[0].destroy).toHaveBeenCalled();
    });
});
