import { describe, expect, it, vi } from "vitest";
import { FOOTSTEP_HEARING_DISTANCE, FOOTSTEP_MAX_VOLUME, FootstepSounds } from "./FootstepSounds";
import type { WalkingCharacter } from "./FootstepSounds";

function setup(zones: { x: number; y: number; width: number; height: number }[] = []) {
    const playSound = vi.fn();
    const footsteps = new FootstepSounds(
        playSound,
        () => zones,
        (x) => (x < 100 ? "wood" : "grass"),
    );
    const listener: WalkingCharacter = { id: "local", x: 0, y: 0 };
    return { playSound, footsteps, listener };
}

/** Walks a character to the right, one frame per pixel step. */
function walk(
    footsteps: FootstepSounds,
    character: WalkingCharacter,
    listener: WalkingCharacter,
    pixels: number,
    step = 4,
) {
    for (let walked = 0; walked <= pixels; walked += step) {
        footsteps.update([listener, { ...character, x: character.x + walked }], listener);
    }
}

describe("FootstepSounds", () => {
    it("plays one quiet step per stride when a nearby player walks", () => {
        const { playSound, footsteps, listener } = setup();

        walk(footsteps, { id: "7", x: 32, y: 0 }, listener, 80);

        expect(playSound).toHaveBeenCalledTimes(4);
        for (const [, volume] of playSound.mock.calls) {
            expect(volume).toBeGreaterThan(0);
            expect(volume).toBeLessThanOrEqual(FOOTSTEP_MAX_VOLUME);
        }
    });

    it("fades with the distance and is silent past the hearing distance", () => {
        const near = setup();
        walk(near.footsteps, { id: "7", x: 16, y: 0 }, near.listener, 20);
        const far = setup();
        walk(far.footsteps, { id: "7", x: 160, y: 0 }, far.listener, 20);
        const out = setup();
        walk(out.footsteps, { id: "7", x: FOOTSTEP_HEARING_DISTANCE + 10, y: 0 }, out.listener, 20);

        expect(near.playSound.mock.calls[0][1]).toBeGreaterThan(far.playSound.mock.calls[0][1]);
        expect(out.playSound).not.toHaveBeenCalled();
    });

    it("does not play a burst of steps after a teleport", () => {
        const { playSound, footsteps, listener } = setup();

        footsteps.update([listener, { id: "7", x: 10, y: 0 }], listener);
        footsteps.update([listener, { id: "7", x: 200, y: 0 }], listener);

        expect(playSound).not.toHaveBeenCalled();
    });

    it("in a room, only hears the players inside it", () => {
        const room = { x: -50, y: -50, width: 100, height: 100 };
        const inside = setup([room]);
        walk(inside.footsteps, { id: "7", x: 0, y: 20 }, inside.listener, 20);
        const outside = setup([room]);
        walk(outside.footsteps, { id: "7", x: 0, y: 80 }, outside.listener, 20);

        expect(inside.playSound).toHaveBeenCalled();
        expect(outside.playSound).not.toHaveBeenCalled();
    });

    it("hears the local player's own steps", () => {
        const { playSound, footsteps } = setup();
        for (let x = 0; x <= 20; x += 4) {
            const listener = { id: "local", x, y: 0 };
            footsteps.update([listener], listener);
        }

        expect(playSound).toHaveBeenCalledWith(expect.stringMatching(/^audio-footstep-wood-\d$/), FOOTSTEP_MAX_VOLUME);
    });

    it("plays the sound of the surface under the walking character", () => {
        const { playSound, footsteps, listener } = setup();

        walk(footsteps, { id: "7", x: 120, y: 0 }, listener, 20);

        expect(playSound.mock.calls[0][0]).toMatch(/^audio-footstep-grass-\d$/);
    });
});
