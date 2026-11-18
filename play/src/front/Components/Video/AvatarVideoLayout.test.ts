import { describe, expect, it } from "vitest";
import { compactAvatarVideoLayout, groupedAvatarVideoLayout } from "./AvatarVideoLayout";

describe("compactAvatarVideoLayout", () => {
    it("keeps seven crowded cameras in two rows without overlap", () => {
        const avatars = Array.from({ length: 7 }, (_, index) => ({ x: 100 + index * 24, y: 200 }));
        const placements = compactAvatarVideoLayout(avatars);
        expect(new Set(placements.map((position) => position.y)).size).toBe(2);
        expect(placements.every((position) => position.y < 200)).toBe(true);
        for (const [index, position] of placements.entries()) {
            for (const other of placements.slice(index + 1)) {
                expect(
                    Math.abs(position.x - other.x) >= position.size ||
                        Math.abs(position.y - other.y) >= position.size + 16,
                ).toBe(true);
            }
        }
    });

    it("centers a partial row and keeps its placement relative to moving avatars", () => {
        const avatars = Array.from({ length: 5 }, (_, index) => ({ x: index * 24, y: 200 }));
        const placements = compactAvatarVideoLayout(avatars);
        expect(placements[4]?.x).toBe(48);
        const moved = compactAvatarVideoLayout(avatars.map(({ x, y }) => ({ x: x + 10, y: y + 20 })));
        expect(moved).toEqual(placements.map(({ x, y, size }) => ({ x: x + 10, y: y + 20, size })));
    });

    it("handles an empty group", () => {
        expect(compactAvatarVideoLayout([])).toEqual([]);
    });
});

describe("groupedAvatarVideoLayout", () => {
    it("keeps isolated people above their own heads and groups crowded neighbours", () => {
        const layout = groupedAvatarVideoLayout([
            { id: "local", x: 0, y: 0 },
            { id: "alice", x: 24, y: 0 },
            { id: "bob", x: 500, y: 0 },
        ]);
        expect(Array.from(layout.keys())).toEqual(["alice", "local"]);
        expect(layout.has("bob")).toBe(false);
    });

    it("keeps group membership at the threshold and separates once people move apart", () => {
        const previous = groupedAvatarVideoLayout([
            { id: "a", x: 0, y: 0 },
            { id: "b", x: 24, y: 0 },
        ]);
        const nearby = [
            { id: "a", x: 0, y: 0 },
            { id: "b", x: 56, y: 0 },
        ];
        expect(groupedAvatarVideoLayout(nearby).size).toBe(0);
        expect(groupedAvatarVideoLayout(nearby, previous).size).toBe(2);
        expect(
            groupedAvatarVideoLayout(
                [
                    { id: "a", x: 0, y: 0 },
                    { id: "b", x: 80, y: 0 },
                ],
                previous,
            ).size,
        ).toBe(0);
    });

    it("uses a stable identity order when neighbours cross and removes departed cameras", () => {
        const first = [
            { id: "a", x: 0, y: 0 },
            { id: "b", x: 24, y: 0 },
        ];
        const previous = groupedAvatarVideoLayout(first);
        expect(
            groupedAvatarVideoLayout(
                [
                    { id: "b", x: 0, y: 0 },
                    { id: "a", x: 24, y: 0 },
                ],
                previous,
            ),
        ).toEqual(previous);
        expect(groupedAvatarVideoLayout(first.slice(0, 1), previous).size).toBe(0);
    });
});
