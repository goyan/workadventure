import {
    advanceBall,
    BALL_GROWTH_PX_PER_SECOND,
    BALL_SPEED_PX_PER_SECOND,
    ballHalfHeight,
    TERRAIN_CELL,
} from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import {
    BALL_TONES,
    ballBlockPx,
    ballBlocks,
    followBall,
    moveShownBall,
} from "@wa/front/Phaser/Game/Catastrophe/BallShape";
import type { ShownBall } from "@wa/front/Phaser/Game/Catastrophe/BallShape";

const dry = (): { groundPx: number; waterPx: number } => ({ groundPx: 0, waterPx: 0 });

describe("ballBlocks", () => {
    it("draws a disc of blocks, none outside the ball", () => {
        const blocks = ballBlocks({ x: 320, y: 320, radiusPx: 64 }, dry);
        expect(blocks.length).toBeGreaterThan(300);
        const size = ballBlockPx(64);
        for (const block of blocks) {
            expect(Math.hypot(block.x + size / 2 - 320, block.y + size / 2 - 320)).toBeLessThanOrEqual(64);
            expect(block.tone).toBeGreaterThanOrEqual(0);
            expect(block.tone).toBeLessThan(BALL_TONES);
            expect(block.wet).toBe(false);
        }
    });

    it("is lit from the top left: it says a sphere, not a disc", () => {
        const blocks = ballBlocks({ x: 320, y: 320, radiusPx: 64 }, dry);
        const mean = (keep: (dx: number, dy: number) => boolean): number => {
            const tones = blocks.filter((block) => keep(block.x - 320, block.y - 320)).map((block) => block.tone);
            return tones.reduce((sum, tone) => sum + tone, 0) / tones.length;
        };
        expect(mean((dx, dy) => dx < -16 && dy < -16)).toBeGreaterThan(mean((dx, dy) => dx > 16 && dy > 16) + 1.5);
        // Its brightest spot is near its top left, its darkest tones at its rim on the other side.
        const brightest = blocks.filter((block) => block.tone === BALL_TONES - 1);
        expect(brightest.length).toBeGreaterThan(0);
        for (const block of brightest) expect(block.x - 320 + (block.y - 320)).toBeLessThan(0);
    });

    it("keeps the same number of blocks, more or less, from the smallest ball to the largest", () => {
        expect(ballBlockPx(16)).toBe(2);
        expect(ballBlockPx(256)).toBeGreaterThan(ballBlockPx(64));
        const largest = ballBlocks({ x: 2000, y: 2000, radiusPx: 256 }, dry);
        expect(largest.length).toBeLessThan(5000);
        expect(ballBlocks({ x: 320, y: 320, radiusPx: 0 }, dry)).toEqual([]);
        expect(ballBlocks({ x: Number.NaN, y: 320, radiusPx: 64 }, dry)).toEqual([]);
    });

    it("hides what is in the ground: nothing of it shows on a mount higher than its radius", () => {
        expect(ballBlocks({ x: 320, y: 320, radiusPx: 64 }, () => ({ groundPx: 80, waterPx: 0 }))).toEqual([]);
        // On a mount 48 px high only its top shows: a smaller disc.
        const cap = ballBlocks({ x: 320, y: 320, radiusPx: 64 }, () => ({ groundPx: 48, waterPx: 0 }));
        expect(cap.length).toBeGreaterThan(0);
        for (const block of cap) expect(Math.hypot(block.x - 320, block.y - 320)).toBeLessThan(48);
    });

    it("shows under the water what the water stands over, and plainly what stands out of it", () => {
        // A flood 30 px deep over a ball that rests on the ground: its rim is under water, its top is not. The
        // server tells the water that stands over the ball cell by cell, as over a ground.
        const ball = { x: 320, y: 320, radiusPx: 64 };
        const blocks = ballBlocks(ball, (x, y) => ({
            groundPx: 0,
            waterPx: Math.max(0, 30 - ballHalfHeight(ball, Math.floor(x / TERRAIN_CELL), Math.floor(y / TERRAIN_CELL))),
        }));
        const far = (block: { x: number; y: number }): number => Math.hypot(block.x - 320, block.y - 320);
        expect(blocks.filter((block) => block.wet).length).toBeGreaterThan(0);
        for (const block of blocks) {
            if (far(block) > 62) expect(block.wet).toBe(true);
            if (far(block) < 40) expect(block.wet).toBe(false);
        }
        // In a deep lake whose water is lower than its underside, nothing of it is wet.
        const over = ballBlocks({ x: 320, y: 320, radiusPx: 64 }, () => ({ groundPx: -200, waterPx: 100 }));
        expect(over.every((block) => !block.wet)).toBe(true);
    });
});

describe("the ball a browser shows", () => {
    const message = { id: 3, x: 500, y: 300, radiusTiles: 4, impactInMs: 600, ballX: 100, ballY: 300, ballRadius: 10 };

    it("starts where the server says the solid is, and goes after what its player asks as the server does", () => {
        let ball = followBall(undefined, message, 1000);
        expect(ball).toMatchObject({ x: 100, y: 300, radiusPx: 10, until: 1600 });
        expect(ball.held).toEqual({ x: 500, y: 300, radiusPx: 64 });
        ball = moveShownBall(ball, 1500);
        const server = advanceBall({ x: 100, y: 300, radiusPx: 10 }, ball.held, 0.1);
        expect(ball.x).toBeCloseTo(100 + BALL_SPEED_PX_PER_SECOND / 2, 4);
        expect(ball.radiusPx).toBeCloseTo(10 + BALL_GROWTH_PX_PER_SECOND / 2, 4);
        expect(server.x).toBeCloseTo(100 + BALL_SPEED_PX_PER_SECOND / 10, 4);
    });

    it("keeps its own place when the server tells nearly the same, and takes the place the server tells when far off", () => {
        const shown: ShownBall = { ...followBall(undefined, message, 1000), x: 104, radiusPx: 12 };
        const near = followBall(shown, { ...message, x: 600 }, 1200);
        expect(near).toMatchObject({ x: 104, radiusPx: 12, until: 1800 });
        expect(near.held.x).toBe(600);
        const far = followBall(shown, { ...message, ballX: 300 }, 1200);
        expect(far.x).toBe(300);
    });

    it("shrinks once no message comes any more, and is gone when it has no radius left", () => {
        let ball: ShownBall = { ...followBall(undefined, message, 1000), radiusPx: 32 };
        ball = moveShownBall(ball, 1600);
        const held = ball.radiusPx;
        ball = moveShownBall(ball, 1850);
        expect(ball.radiusPx).toBeCloseTo(held - BALL_GROWTH_PX_PER_SECOND / 4, 4);
        expect(ball.x).toBeCloseTo(moveShownBall({ ...followBall(undefined, message, 1000) }, 1600).x, 4);
        ball = moveShownBall(ball, 5000);
        expect(ball.radiusPx).toBe(0);
    });
});
