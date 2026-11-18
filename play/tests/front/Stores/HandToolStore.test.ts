import { afterEach, describe, expect, it } from "vitest";
import { get } from "svelte/store";
import { rodEquippedStore } from "../../../src/front/Stores/FishingStore";
import { toggleHandTool } from "../../../src/front/Stores/HandToolStore";
import { nerfEquippedStore } from "../../../src/front/Stores/NerfStore";
import { torchEquippedStore } from "../../../src/front/Stores/TorchStore";

afterEach(() => {
    nerfEquippedStore.set(false);
    torchEquippedStore.set(false);
    rodEquippedStore.set(false);
});

describe("toggleHandTool", () => {
    it("equips and puts away the torch", () => {
        toggleHandTool("torch");
        expect(get(torchEquippedStore)).toBe(true);
        toggleHandTool("torch");
        expect(get(torchEquippedStore)).toBe(false);
    });

    it("puts the Nerf away when the torch is equipped: one hand", () => {
        nerfEquippedStore.set(true);
        toggleHandTool("torch");
        expect(get(torchEquippedStore)).toBe(true);
        expect(get(nerfEquippedStore)).toBe(false);
    });

    it("puts the torch and the Nerf away when the fishing rod is equipped, and the rod when one of them is", () => {
        torchEquippedStore.set(true);
        toggleHandTool("rod");
        expect(get(rodEquippedStore)).toBe(true);
        expect(get(torchEquippedStore)).toBe(false);
        toggleHandTool("nerf");
        expect(get(nerfEquippedStore)).toBe(true);
        expect(get(rodEquippedStore)).toBe(false);
        toggleHandTool("rod");
        toggleHandTool("rod");
        expect(get(rodEquippedStore)).toBe(false);
        expect(get(nerfEquippedStore)).toBe(false);
    });

    it("puts the torch away when the Nerf is equipped", () => {
        torchEquippedStore.set(true);
        toggleHandTool("nerf");
        expect(get(nerfEquippedStore)).toBe(true);
        expect(get(torchEquippedStore)).toBe(false);
    });

    it("does not take the other tool out again when putting one away", () => {
        torchEquippedStore.set(true);
        nerfEquippedStore.set(false);
        toggleHandTool("nerf");
        toggleHandTool("nerf");
        expect(get(nerfEquippedStore)).toBe(false);
        expect(get(torchEquippedStore)).toBe(false);
        torchEquippedStore.set(true);
        toggleHandTool("torch");
        expect(get(torchEquippedStore)).toBe(false);
        expect(get(nerfEquippedStore)).toBe(false);
    });

    it("refuses to equip a tool when asked to (the editor is open), but always lets it be put away", () => {
        nerfEquippedStore.set(true);
        toggleHandTool("torch", { refuseEquip: true });
        expect(get(torchEquippedStore)).toBe(false);
        expect(get(nerfEquippedStore)).toBe(true);
        torchEquippedStore.set(true);
        nerfEquippedStore.set(false);
        toggleHandTool("torch", { refuseEquip: true });
        expect(get(torchEquippedStore)).toBe(false);
    });
});
