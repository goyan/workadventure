import { BALL_REPORT_MS } from "@workadventure/map-editor";
import type { WaterBall } from "@workadventure/map-editor";
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
        setY: vi.fn((_y: number) => made),
        lineStyle: vi.fn(),
        strokeCircle: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn<(x: number, y: number) => void>(),
        closePath: vi.fn(),
        strokePath: vi.fn(),
        destroy: vi.fn(),
    };
    return made;
}

const ME = 7;

function harness(
    water = 0,
    ground = water > 0 ? -100 : 0,
    dropOf?: (ball: { x: number; y: number; levelPx: number }) => number,
) {
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
    let held: WaterBall | undefined;
    const view = new BallView(
        scene as unknown as Phaser.Scene & { markDirty(): void },
        () => ({ groundPx: ground, waterPx: water }),
        () => version,
        () => ME,
        () => held,
        dropOf,
    );
    const message = (over: Partial<CatastropheMessage> = {}): CatastropheMessage => ({
        id: 4,
        kind: CatastropheKind.CATASTROPHE_BALL,
        x: 320,
        y: 320,
        impactInMs: 600,
        radiusTiles: 2,
        wholeMap: false,
        userId: 12,
        ...over,
    });
    return {
        view,
        scene,
        made,
        message,
        waterChanged: () => version++,
        hold: (ball: WaterBall | undefined) => {
            held = ball;
        },
    };
}

describe("BallView", () => {
    it("draws the ball the server announces whole at once, at the depth of its middle, and its ring over the night", () => {
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

    it("is drawn where the water it floats on is drawn, the relief seen in 3/4: its body and its ring as much lower", () => {
        // A lake at the bottom of a hollow, its surface 60 px under the ground: drawn 30 px lower.
        const dropOf = vi.fn((ball: { levelPx: number }) => -ball.levelPx / 2);
        const { view, made, message } = harness(40, -100, dropOf);
        view.report(message({ ballLevel: -60 }), 0);
        view.update(16);
        const [ring, body] = made;
        expect(dropOf).toHaveBeenCalledWith(expect.objectContaining({ x: 320, y: 320, levelPx: -60 }));
        // Its body is moved as a whole; its place, its blocks and its depth are those of the map.
        expect(body.setY).toHaveBeenLastCalledWith(30);
        expect(body.setDepth).toHaveBeenLastCalledWith(320);
        expect(ring.strokeCircle).toHaveBeenCalledWith(320, 350, expect.any(Number));
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

    it("takes the ball of another player where the server tells it, within a message", () => {
        const { view, made, message } = harness();
        view.report(message(), 1000);
        view.update(1000);
        view.report(message({ x: 520 }), 1050);
        view.update(1050 + BALL_REPORT_MS);
        expect(made[0].strokeCircle).toHaveBeenLastCalledWith(520, 320, 32);
    });

    it("is gone at once when the server says its player let it go, or a moment after their last message", () => {
        const { view, made, message } = harness();
        view.report(message(), 1000);
        view.update(1000);
        view.report(message({ impactInMs: 0 }), 1100);
        view.update(1100);
        expect(made[1].destroy).toHaveBeenCalled();
        // Another one, whose player left without a word.
        view.report(message({ id: 5 }), 2000);
        view.update(2000);
        view.update(2599);
        expect(made[2].destroy).not.toHaveBeenCalled();
        view.update(2600);
        expect(made[2].destroy).toHaveBeenCalled();
        // Nothing left to do: nothing is drawn any more.
        const cleared = made[0].clear.mock.calls.length;
        view.update(2700);
        expect(made[0].clear.mock.calls.length).toBe(cleared);
    });

    it("shows the ball one holds under one's own pointer at once, never where the server last told it", () => {
        const { view, made, message, hold } = harness();
        hold({ x: 400, y: 200, radiusPx: 64 });
        view.update(1000);
        expect(made).toHaveLength(2);
        expect(made[0].strokeCircle).toHaveBeenLastCalledWith(400, 200, 64);
        // The answer of the server, late by a round trip, is not drawn: one ball, under the pointer.
        view.report(message({ userId: ME, x: 380, y: 200, radiusTiles: 4 }), 1040);
        hold({ x: 430, y: 210, radiusPx: 64 });
        view.update(1050);
        expect(made).toHaveLength(2);
        expect(made[0].strokeCircle).toHaveBeenLastCalledWith(430, 210, 64);
        expect(made[1].setDepth).toHaveBeenLastCalledWith(210);
        // Let go: gone at once, whatever the server still says of it.
        hold(undefined);
        view.report(message({ userId: ME, x: 430, y: 210 }), 1060);
        view.update(1070);
        expect(made[1].destroy).toHaveBeenCalled();
        expect(made).toHaveLength(2);
    });

    it("holds one's own ball at the surface of the water under the pointer, then at the level the server says", () => {
        // A flood 30 px deep on flat ground.
        const { view, made, message, hold } = harness(30, 0);
        hold({ x: 400, y: 200, radiusPx: 32 });
        view.update(1000);
        const farthest = (): number =>
            Math.max(...made[1].lineTo.mock.calls.slice(-10).map(([x, y]) => Math.hypot(x - 400, y - 200)));
        // Half in the water at once: the line of the water runs at its rim.
        expect(farthest()).toBeCloseTo(32, 3);
        // The server holds it lower (the water was lower than this browser knew): its line draws in.
        view.report(message({ userId: ME, x: 400, y: 200, radiusTiles: 2, ballLevel: 10 }), 1050);
        view.update(1060);
        expect(farthest()).toBeCloseTo(Math.sqrt(32 ** 2 - 20 ** 2), 3);
        expect(made).toHaveLength(2);
        // Let go, and held again elsewhere: the level of before is forgotten.
        hold(undefined);
        view.update(1100);
        hold({ x: 400, y: 200, radiusPx: 32 });
        view.update(1200);
        const again = made[2].lineTo.mock.calls.slice(-10).map(([x, y]) => Math.hypot(x - 400, y - 200));
        expect(Math.max(...again)).toBeCloseTo(32, 3);
    });

    it("stands in the water: a line of foam where the water meets it, and no shade thrown on the lake", () => {
        const afloat = harness(100);
        afloat.view.report(afloat.message(), 1000);
        afloat.view.update(1000);
        expect(afloat.made[1].strokePath).toHaveBeenCalled();
        expect(afloat.made[1].fillEllipse).not.toHaveBeenCalled();
        const ashore = harness();
        ashore.view.report(ashore.message(), 1000);
        ashore.view.update(1000);
        expect(ashore.made[1].strokePath).not.toHaveBeenCalled();
        expect(ashore.made[1].fillEllipse).toHaveBeenCalled();
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
