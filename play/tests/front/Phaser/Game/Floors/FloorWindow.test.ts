import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({ Scenes: { Events: { POST_UPDATE: "postupdate" } } }));

import { slabCoversAvatar, slabInAvatarWindow } from "../../../../../src/front/Phaser/Game/Floors/FloorSpike";

// The feet of an avatar, on the screen.
const feet = { x: 200, y: 300 };

describe("the slabs that let an avatar show through outdoors", () => {
    it("tells the slab drawn over the avatar from the one beside it", () => {
        // The avatar is about 24 px wide and 36 px high above its feet.
        expect(slabCoversAvatar({ x: 192, y: 280 }, feet)).toBe(true);
        expect(slabCoversAvatar({ x: 192, y: 300 }, feet)).toBe(false);
        expect(slabCoversAvatar({ x: 230, y: 280 }, feet)).toBe(false);
    });

    it("opens a window of about two tiles around the avatar, not the whole floor", () => {
        // Two tiles away: in the window.
        expect(slabInAvatarWindow({ x: 200 + 64, y: 280 }, feet)).toBe(true);
        expect(slabInAvatarWindow({ x: 200 - 96, y: 280 }, feet)).toBe(true);
        expect(slabInAvatarWindow({ x: 192, y: 300 - 36 - 64 - 16 }, feet)).toBe(true);
        // Four tiles away: the floor stays whole there.
        expect(slabInAvatarWindow({ x: 200 + 128, y: 280 }, feet)).toBe(false);
        expect(slabInAvatarWindow({ x: 200 - 160, y: 280 }, feet)).toBe(false);
        expect(slabInAvatarWindow({ x: 192, y: 300 + 96 }, feet)).toBe(false);
        expect(slabInAvatarWindow({ x: 192, y: 300 - 36 - 64 - 40 }, feet)).toBe(false);
    });
});
