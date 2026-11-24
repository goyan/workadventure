import { describe, expect, it } from "vitest";
import { torchFlameCount, torchFlames } from "@wa/front/Phaser/Game/Catastrophe/FireTorch";

describe("the flames of a fire a player holds", () => {
    const centre = { x: 1000, y: 500 };

    it("shows more flames under a wider fire, within bounds", () => {
        expect(torchFlameCount(0)).toBe(0);
        expect(torchFlameCount(Number.NaN)).toBe(0);
        expect(torchFlameCount(16)).toBe(5);
        expect(torchFlameCount(128)).toBeGreaterThan(torchFlameCount(64));
        expect(torchFlameCount(5000)).toBe(90);
    });

    it("stands every flame inside the disc lying on the ground, always at the same place", () => {
        const first = torchFlames(0, centre, 96);
        const later = torchFlames(137, centre, 96);
        expect(first).toHaveLength(torchFlameCount(96));
        first.forEach((flame, index) => {
            expect(Math.hypot(flame.x - centre.x, (flame.y - centre.y) * 2)).toBeLessThanOrEqual(96 + 1e-6);
            expect(later[index].x).toBe(flame.x);
            expect(later[index].y).toBe(flame.y);
            expect(flame.height).toBeGreaterThan(0);
            expect(flame.width).toBeGreaterThan(0);
        });
    });

    it("flickers: the flames change of height with time, each at its own beat", () => {
        const first = torchFlames(0, centre, 96);
        const later = torchFlames(90, centre, 96);
        expect(first.some((flame, index) => flame.height !== later[index].height)).toBe(true);
        const turns = new Set(first.map((flame) => Math.round((flame.height / flame.tall) * 100)));
        expect(turns.size).toBeGreaterThan(3);
    });

    it("draws the flames from the back of the disc to its front, so the near ones stand before the far ones", () => {
        const flames = torchFlames(0, centre, 96);
        for (let index = 1; index < flames.length; index++) {
            expect(flames[index].y).toBeGreaterThanOrEqual(flames[index - 1].y);
        }
    });

    it("stands still in reduced motion", () => {
        expect(torchFlames(0, centre, 96, true)).toEqual(torchFlames(900, centre, 96, true));
    });
});
