import { describe, expect, it, vi } from "vitest";
import {
    MAX_POSE,
    POSE_PAD,
    poseRowShift,
    TreePoseTextures,
    treePose,
} from "../../../../../src/front/Phaser/Game/Nature/TreePoses";

/** Poses of a tree over a minute, ten times a second. */
const poses = (wind: number, windFrom: number | undefined, phase = 0.2) =>
    Array.from({ length: 600 }, (_, tenth) => treePose(2_000_000 + tenth / 10, wind, windFrom, phase));
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

describe("treePose", () => {
    it("is a whole number of pixels, never further than the furthest pose", () => {
        for (const pose of [...poses(5, 270), ...poses(200, 270), ...poses(200, 90)]) {
            expect(Number.isInteger(pose)).toBe(true);
            expect(Math.abs(pose)).toBeLessThanOrEqual(MAX_POSE);
        }
    });

    it("sways a little in a breeze and wider in a storm", () => {
        const reach = (wind: number) => Math.max(...poses(wind, 0)) - Math.min(...poses(wind, 0));
        expect(reach(5)).toBeGreaterThanOrEqual(1);
        expect(reach(5)).toBeLessThan(reach(80));
    });

    it("leans where the wind goes, the more the harder it blows", () => {
        // A west wind (from 270°) blows to the east: the top of the tree goes right. An east wind: left.
        expect(mean(poses(60, 270))).toBeGreaterThan(1);
        expect(mean(poses(60, 90))).toBeLessThan(-1);
        expect(mean(poses(60, 270))).toBeGreaterThan(mean(poses(15, 270)));
        // A north wind does not lean the tree to a side.
        expect(Math.abs(mean(poses(60, 0)))).toBeLessThan(0.5);
    });

    it("is the same for everyone, each tree in its own time", () => {
        expect(poses(40, 200)).toEqual(poses(40, 200));
        expect(poses(40, 200, 0.2)).not.toEqual(poses(40, 200, 0.7));
        expect(treePose(Number.NaN, 40, 200, 0.2)).toBe(0);
    });
});

describe("poseRowShift", () => {
    it("leaves the trunk where it is and moves the top the furthest", () => {
        const height = 96;
        for (let row = Math.ceil(height * 0.7); row < height; row++) expect(poseRowShift(4, row, height)).toBe(0);
        expect(poseRowShift(4, 0, height)).toBe(4);
        expect(poseRowShift(-3, 0, height)).toBe(-3);
        expect(poseRowShift(0, 0, height)).toBe(0);
        // Each row moves at most one pixel more than the row under it: the foliage bends, it does not break.
        for (let row = 0; row < height - 1; row++) {
            const step = poseRowShift(4, row, height) - poseRowShift(4, row + 1, height);
            expect(step === 0 || step === 1).toBe(true);
        }
    });
});

describe("TreePoseTextures", () => {
    function fixture(readable = true) {
        const drawn: number[][] = [];
        const created: { key: string; width: number; height: number; refresh: ReturnType<typeof vi.fn> }[] = [];
        const removed: string[] = [];
        const source = readable ? { tagName: "IMG" } : undefined;
        const scene = {
            textures: {
                exists: (key: string) => created.some((texture) => texture.key === key),
                getFrame: (key: string) =>
                    key === "oak.png"
                        ? { cutX: 0, cutY: 0, cutWidth: 64, cutHeight: 96, source: { image: source } }
                        : undefined,
                createCanvas: (key: string, width: number, height: number) => {
                    const texture = {
                        key,
                        width,
                        height,
                        refresh: vi.fn(),
                        getContext: () => ({
                            drawImage: (_image: unknown, ...numbers: number[]) => drawn.push(numbers),
                        }),
                    };
                    created.push(texture);
                    return texture;
                },
                remove: (key: string) => removed.push(key),
            },
        };
        return { textures: new TreePoseTextures(scene as never), drawn, created, removed };
    }

    it("makes the bent image of a tree once: every row of the original, moved by whole pixels", () => {
        const { textures, drawn, created } = fixture();
        const key = textures.key("oak.png", 3);
        expect(key).toBeDefined();
        expect(created).toHaveLength(1);
        // Wider than the original by the room the top needs on each side.
        expect([created[0].width, created[0].height]).toEqual([64 + 2 * POSE_PAD, 96]);
        expect(created[0].refresh).toHaveBeenCalled();
        // Bands cover the 96 rows, from the top; the trunk is drawn right in the middle of the room.
        const rows = drawn.reduce((sum, [, , , height]) => sum + height, 0);
        expect(rows).toBe(96);
        const [, lastSourceY, , lastHeight, lastX] = drawn[drawn.length - 1];
        expect(lastSourceY + lastHeight).toBe(96);
        expect(lastSourceY).toBeLessThanOrEqual(67);
        expect(lastX).toBe(POSE_PAD);
        expect(drawn[0][4]).toBe(POSE_PAD + 3);
        expect(textures.key("oak.png", 3)).toBe(key);
        expect(created).toHaveLength(1);
        expect(textures.key("oak.png", -3)).not.toBe(key);
    });

    it("gives nothing for a tree standing straight, or an image it cannot read", () => {
        expect(fixture().textures.key("oak.png", 0)).toBeUndefined();
        expect(fixture().textures.key("unknown.png", 2)).toBeUndefined();
        expect(fixture(false).textures.key("oak.png", 2)).toBeUndefined();
    });

    it("frees its images when destroyed", () => {
        const { textures, removed } = fixture();
        const key = textures.key("oak.png", 2);
        textures.destroy();
        expect(removed).toEqual([key]);
    });
});
