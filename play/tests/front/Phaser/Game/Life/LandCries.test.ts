import { describe, expect, it, vi } from "vitest";
import {
    JUNGLE_CRY_COOLDOWN_MS,
    JUNGLE_CRY_RANGE_PX,
    JUNGLE_MAX_VOLUME,
    jungleCryLeg,
} from "../../../../../src/front/Phaser/Game/Jungle/JungleCries";
import { LandCries, landCryId } from "../../../../../src/front/Phaser/Game/Life/LandCries";
import type { HeardAnimal } from "../../../../../src/front/Phaser/Game/Life/LandCries";

/** An instant of a leg where this animal calls. */
function cryTime(id: number, from = 0): number {
    for (let now = from; now < from + 200 * 20_000; now += 20_000) {
        if (jungleCryLeg(landCryId(id), now) !== undefined) return now;
    }
    throw new Error("no call found");
}
const animal = (id: number, more: Partial<HeardAnimal> = {}): HeardAnimal => ({
    id,
    species: "lion",
    x: 100,
    y: 100,
    moving: false,
    led: false,
    ...more,
});

function create() {
    const play = vi.fn();
    const state = { hidden: false, volume: 1, listener: { x: 100, y: 100 } as { x: number; y: number } | undefined };
    const cries = new LandCries({
        listener: () => state.listener,
        hidden: () => state.hidden,
        volume: () => state.volume,
        play,
    });
    return { cries, play, state };
}

describe("LandCries", () => {
    it("plays the call of a lion at rest beside the player, at full volume, once for that leg", () => {
        const { cries, play } = create();
        const now = cryTime(1);
        cries.update(now, [animal(1)]);
        cries.update(now + 16, [animal(1)]);
        expect(play).toHaveBeenCalledTimes(1);
        expect(play).toHaveBeenCalledWith("jungle-lion", JUNGLE_MAX_VOLUME);
    });

    it("plays the call of a tiger with its own sound, quieter with the distance", () => {
        const { cries, play } = create();
        cries.update(cryTime(2), [animal(2, { species: "tiger", x: 100 + JUNGLE_CRY_RANGE_PX / 2 })]);
        expect(play).toHaveBeenCalledWith("jungle-tigre", JUNGLE_MAX_VOLUME / 2);
    });

    it("stays silent for an antelope, a walking animal, a tamed one, one out of hearing, and a hidden tab", () => {
        const cases: [string, Partial<HeardAnimal>, (state: { hidden: boolean }) => void][] = [
            ["antelope", { species: "antelope" }, () => undefined],
            ["walking", { moving: true }, () => undefined],
            ["tamed", { led: true }, () => undefined],
            ["far", { x: 100 + JUNGLE_CRY_RANGE_PX }, () => undefined],
            ["hidden", {}, (state) => (state.hidden = true)],
        ];
        for (const [name, more, prepare] of cases) {
            const { cries, play, state } = create();
            prepare(state);
            cries.update(cryTime(3), [animal(3, more)]);
            expect(play, name).not.toHaveBeenCalled();
        }
    });

    it("lets one call through every twenty seconds, whatever the number of animals", () => {
        const { cries, play } = create();
        const first = cryTime(4);
        cries.update(first, [animal(4)]);
        const soon = cryTime(5, first);
        if (soon - first < JUNGLE_CRY_COOLDOWN_MS) {
            cries.update(soon, [animal(5)]);
            expect(play).toHaveBeenCalledTimes(1);
        }
        cries.update(cryTime(5, first + JUNGLE_CRY_COOLDOWN_MS), [animal(5)]);
        expect(play).toHaveBeenCalledTimes(2);
    });

    it("follows the volume of the calls of the jungle", () => {
        const { cries, play, state } = create();
        state.volume = 0;
        cries.update(cryTime(6), [animal(6)]);
        expect(play).not.toHaveBeenCalled();
    });
});
