import { describe, expect, it } from "vitest";
import {
    DETAILED_FLAME_HEIGHT_PX,
    DETAILED_FLAME_WIDTH_PX,
    DETAILED_FRAME_HEIGHT_PX,
    DETAILED_FRAME_WIDTH_PX,
    DETAILED_FRAMES,
    DETAILED_VARIANTS,
    detailedFlameHeat,
    detailedFlamePixel,
    detailedFrameIndex,
    detailedVariant,
} from "../../../../../src/front/Phaser/Game/Fire/FlameArt";
import { FLAME_MAX_HEIGHT_PX } from "../../../../../src/front/Phaser/Game/Fire/FlameShape";

const W = DETAILED_FRAME_WIDTH_PX;
const H = DETAILED_FRAME_HEIGHT_PX;
const lit = (frame: number, variant: number, still = false): { x: number; y: number }[] => {
    const points: { x: number; y: number }[] = [];
    for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) if (detailedFlameHeat(x, y, frame, variant, still) >= 0.11) points.push({ x, y });
    return points;
};

describe("the detailed flames", () => {
    it("are as tall and as wide as the quick ones, so both are laid the same way", () => {
        expect(DETAILED_FLAME_HEIGHT_PX).toBe(FLAME_MAX_HEIGHT_PX);
        expect(DETAILED_FLAME_WIDTH_PX).toBe(44);
    });

    it("stand on the middle of the bottom of their frame, inside it, hot at the heart and cooler at the edge", () => {
        for (let variant = 0; variant < DETAILED_VARIANTS; variant++) {
            for (const frame of [0, 7, 15, 23]) {
                const points = lit(frame, variant);
                expect(points.length).toBeGreaterThan(400);
                const xs = points.map((point) => point.x);
                const ys = points.map((point) => point.y);
                // Never cut by the frame.
                expect(Math.min(...xs)).toBeGreaterThan(0);
                expect(Math.max(...xs)).toBeLessThan(W - 1);
                expect(Math.min(...ys)).toBeGreaterThan(0);
                // On the ground, about its middle.
                expect(Math.max(...ys)).toBe(H - 1);
                const middle = xs.reduce((sum, x) => sum + x, 0) / xs.length;
                expect(Math.abs(middle - W / 2)).toBeLessThan(6);
                // As tall as a flame at its height, within a third (it licks up and falls back).
                const tall = H - Math.min(...ys);
                expect(tall).toBeGreaterThan(DETAILED_FLAME_HEIGHT_PX * 0.66);
                expect(tall).toBeLessThanOrEqual(H);
            }
            // The heart, low in the flame, is the hottest; the corners of the frame are empty.
            expect(detailedFlameHeat(W / 2, H - 14, 0, variant)).toBeGreaterThan(0.6);
            expect(detailedFlameHeat(1, 1, 0, variant)).toBe(0);
            expect(detailedFlameHeat(1, H - 1, 0, variant)).toBe(0);
        }
    });

    it("is a loop without a seam: the frame after the last is the first", () => {
        for (let variant = 0; variant < DETAILED_VARIANTS; variant++) {
            for (let y = 0; y < H; y += 3) {
                for (let x = 0; x < W; x += 3) {
                    expect(detailedFlameHeat(x, y, DETAILED_FRAMES, variant)).toBeCloseTo(
                        detailedFlameHeat(x, y, 0, variant),
                        9,
                    );
                }
            }
        }
    });

    it("moves from a frame to the next, and is not the same flame from a variant to another", () => {
        const differs = (a: { x: number; y: number }[], b: { x: number; y: number }[]): number => {
            const keys = new Set(a.map((point) => `${point.x},${point.y}`));
            return b.filter((point) => !keys.has(`${point.x},${point.y}`)).length;
        };
        expect(differs(lit(0, 0), lit(1, 0))).toBeGreaterThan(10);
        // A flicker, not a blink: most of the flame stays from a frame to the next.
        expect(differs(lit(0, 0), lit(1, 0))).toBeLessThan(lit(0, 0).length / 3);
        expect(differs(lit(0, 0), lit(0, 1))).toBeGreaterThan(40);
    });

    it("stands still for who asked for less motion, whatever the frame, without sparks", () => {
        expect(lit(0, 1, true)).toEqual(lit(17, 1, true));
        const colors = new Set<string>();
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) colors.add(detailedFlamePixel(x, y, 5, 1, true).join());
        // The six steps of the flame and nothing: no spark.
        expect(colors.size).toBeLessThanOrEqual(7);
    });

    it("is painted in a few plain colours, from a pale heart to a dark red edge", () => {
        const colors = new Map<string, number>();
        for (let y = 0; y < H; y++)
            for (let x = 0; x < W; x++) {
                const key = detailedFlamePixel(x, y, 3, 2, true).join();
                colors.set(key, (colors.get(key) ?? 0) + 1);
            }
        expect(colors.has("255,250,214,255")).toBe(true);
        expect(colors.has("130,30,22,190")).toBe(true);
        expect(colors.has("0,0,0,0")).toBe(true);
        // The pale heart is the smallest part but the dark edge: a flame is mostly orange.
        expect(colors.get("255,250,214,255") ?? 0).toBeLessThan(colors.get("255,172,40,255") ?? 0);
    });

    it("gives each frame of each variant its place on the sheet, the still one after its loop", () => {
        expect(detailedFrameIndex(0, 0)).toBe(0);
        expect(detailedFrameIndex(DETAILED_FRAMES, 0)).toBe(24);
        expect(detailedFrameIndex(0, 1)).toBe(25);
        expect(detailedFrameIndex(DETAILED_FRAMES, DETAILED_VARIANTS - 1)).toBe(DETAILED_VARIANTS * 25 - 1);
        const variants = new Set<number>();
        for (let seed = 0; seed < 1; seed += 0.01) {
            const variant = detailedVariant(seed);
            expect(variant).toBeGreaterThanOrEqual(0);
            expect(variant).toBeLessThan(DETAILED_VARIANTS);
            variants.add(variant);
        }
        expect(variants.size).toBe(DETAILED_VARIANTS);
        expect(detailedVariant(0.42)).toBe(detailedVariant(0.42));
    });
});
