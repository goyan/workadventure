import { BALL_REPORT_MS, ballHalfHeight, TERRAIN_CELL } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import {
    BALL_TONES,
    ballBlockPx,
    ballBlocks,
    ballWaterline,
    glideBall,
    tellBall,
} from "@wa/front/Phaser/Game/Catastrophe/BallShape";

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

describe("ballWaterline", () => {
    const ball = { x: 320, y: 320, radiusPx: 64 };

    it("runs all around a ball that stands in a lake, at its rim when the lake is no higher than its middle", () => {
        const line = ballWaterline(ball, () => ({ groundPx: -100, waterPx: 100 }));
        expect(line.afloat).toBe(true);
        expect(line.arcs).toHaveLength(1);
        expect(line.arcs[0].closed).toBe(true);
        for (const point of line.arcs[0].points) expect(Math.hypot(point.x - 320, point.y - 320)).toBeCloseTo(64, 5);
        // A lake lower than its middle touches it under its widest: seen from above, still at its rim.
        const low = ballWaterline(ball, () => ({ groundPx: -100, waterPx: 70 }));
        for (const point of low.arcs[0].points) expect(Math.hypot(point.x - 320, point.y - 320)).toBeCloseTo(64, 5);
    });

    it("draws in where the water stands higher than its middle, and is none under the water or on dry ground", () => {
        const flood = ballWaterline(ball, () => ({ groundPx: 0, waterPx: 30 }));
        const within = Math.sqrt(64 ** 2 - 30 ** 2);
        for (const point of flood.arcs[0].points)
            expect(Math.hypot(point.x - 320, point.y - 320)).toBeCloseTo(within, 5);
        expect(ballWaterline(ball, () => ({ groundPx: 0, waterPx: 80 })).arcs).toEqual([]);
        const dry = ballWaterline(ball, () => ({ groundPx: 0, waterPx: 0 }));
        expect(dry.arcs).toEqual([]);
        expect(dry.afloat).toBe(false);
    });

    it("runs only along the side where there is water", () => {
        // Water to the east of the ball only.
        const line = ballWaterline(ball, (x) => ({ groundPx: x > 320 ? -100 : 0, waterPx: x > 320 ? 100 : 0 }));
        expect(line.arcs).toHaveLength(1);
        expect(line.arcs[0].closed).toBe(false);
        for (const point of line.arcs[0].points) expect(point.x).toBeGreaterThan(320);
        expect(line.afloat).toBe(false);
    });
});

describe("glideBall", () => {
    it("takes the ball of another player to where the server last told it, in the time between two messages", () => {
        const shown = { x: 100, y: 300, radiusPx: 64, fromX: 100, fromY: 300, toldAt: 1000, until: 1600 };
        const told = tellBall(shown, { x: 180, y: 300, radiusTiles: 4, impactInMs: 600 }, 1050);
        expect(told).toMatchObject({ fromX: 100, x: 180, radiusPx: 64, until: 1650 });
        expect(glideBall(told, 1050).x).toBe(100);
        expect(glideBall(told, 1050 + BALL_REPORT_MS / 2).x).toBeCloseTo(140, 5);
        expect(glideBall(told, 1050 + BALL_REPORT_MS).x).toBe(180);
        expect(glideBall(told, 5000).x).toBe(180);
    });

    it("is whole where the server tells it, at once, when it is new", () => {
        const told = tellBall(undefined, { x: 180, y: 300, radiusTiles: 6, impactInMs: 600 }, 1050);
        expect(glideBall(told, 1050)).toEqual({ x: 180, y: 300, radiusPx: 96 });
    });
});
