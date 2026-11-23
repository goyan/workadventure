import { describe, expect, it } from "vitest";
import { TreeFireState } from "@wa/front/Phaser/Game/Fire/TreeFireState";
import { GROW_STEPS, growShare, growStep } from "@wa/front/Phaser/Game/Nature/FallenTreeTexture";
import { lyingRotation } from "@wa/front/Phaser/Game/Nature/FallenTreeView";

const told = (trees: { id: string; fire: number; damage: number; fallen: number }[], whole = false) => ({
    trees,
    whole,
    embers: [],
});

describe("a tree the wind laid down, as the browser draws it", () => {
    it("lies the way the wind blew, uncharred, then grows back from a sapling as the server tells it", () => {
        const state = new TreeFireState();
        // Laid down by a wind from the east (90 degrees, told 91): it lies towards the west.
        state.receive(told([{ id: "oak", fire: 0, damage: 16, fallen: 91 }]), 0);
        expect(state.fallenOf("oak")).toEqual({ toward: 270, lying: true, grown: 0 });
        expect(state.degreeOf("oak")).toBe(0);
        state.receive(told([{ id: "oak", fire: 0, damage: 4, fallen: 91 }]), 1);
        expect(state.fallenOf("oak")).toEqual({ toward: 270, lying: false, grown: 0.75 });
        state.receive(told([{ id: "oak", fire: 0, damage: 0, fallen: 0 }]), 2);
        expect(state.fallenOf("oak")).toBeUndefined();
    });

    it("keeps a charred tree charred and standing", () => {
        const state = new TreeFireState();
        state.receive(told([{ id: "pine", fire: 0, damage: 16, fallen: 0 }]), 0);
        expect(state.fallenOf("pine")).toBeUndefined();
        expect(state.degreeOf("pine")).toBe(4);
    });

    it("grows back in GROW_STEPS sizes, from a sapling to its own size", () => {
        expect(growStep(0.01)).toBe(1);
        expect(growStep(0.5)).toBe(GROW_STEPS / 2);
        expect(growStep(1)).toBe(GROW_STEPS);
        expect(growShare(1)).toBeCloseTo(0.15 + 0.85 / GROW_STEPS);
        expect(growShare(GROW_STEPS)).toBe(1);
    });

    it("turns a standing image the way the tree lies: its crown north, east, south or west", () => {
        expect(lyingRotation(0)).toBe(0);
        expect(lyingRotation(90)).toBeCloseTo(Math.PI / 2);
        expect(lyingRotation(270)).toBeCloseTo((3 * Math.PI) / 2);
    });
});
