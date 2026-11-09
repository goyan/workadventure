import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";

beforeEach(() => {
    localStorage.removeItem("footstepVolume");
    localStorage.removeItem("environmentVolume");
    localStorage.removeItem("soundEffectsVolumeBaseline");
    vi.resetModules();
});

afterEach(() => {
    localStorage.removeItem("footstepVolume");
    localStorage.removeItem("environmentVolume");
    localStorage.removeItem("soundEffectsVolumeBaseline");
    vi.resetModules();
});

describe("personal sound effect volumes", () => {
    it("starts both volumes at 15% and preserves explicit saved volumes", async () => {
        const first = await import("../../../src/front/Stores/SoundEffectsStore");
        expect(get(first.environmentVolumeStore)).toBe(0.15);
        expect(get(first.footstepVolumeStore)).toBe(0.15);
        first.environmentVolumeStore.set(0.8);
        vi.resetModules();
        const restored = await import("../../../src/front/Stores/SoundEffectsStore");
        expect(get(restored.environmentVolumeStore)).toBe(0.8);
    });

    it("reduces the previous saved volumes once", async () => {
        localStorage.setItem("footstepVolume", "0.5");
        localStorage.setItem("environmentVolume", "0.8");
        const first = await import("../../../src/front/Stores/SoundEffectsStore");
        expect(get(first.footstepVolumeStore)).toBe(0.15);
        expect(get(first.environmentVolumeStore)).toBe(0.15);
        expect(localStorage.getItem("footstepVolume")).toBe("0.15");
        expect(localStorage.getItem("environmentVolume")).toBe("0.15");
        first.footstepVolumeStore.set(0.2);
        vi.resetModules();
        const restored = await import("../../../src/front/Stores/SoundEffectsStore");
        expect(get(restored.footstepVolumeStore)).toBe(0.2);
    });

    it("keeps footsteps and environment independent and restores both after reload", async () => {
        const first = await import("../../../src/front/Stores/SoundEffectsStore");
        first.footstepVolumeStore.set(0.25);
        first.environmentVolumeStore.set(0);
        vi.resetModules();
        const restored = await import("../../../src/front/Stores/SoundEffectsStore");
        expect(get(restored.footstepVolumeStore)).toBe(0.25);
        expect(get(restored.environmentVolumeStore)).toBe(0);
    });

    it("clamps stored and new values to a valid audio volume", async () => {
        localStorage.setItem("soundEffectsVolumeBaseline", "0.15");
        localStorage.setItem("footstepVolume", "-10");
        localStorage.setItem("environmentVolume", "broken");
        const { footstepVolumeStore, environmentVolumeStore } =
            await import("../../../src/front/Stores/SoundEffectsStore");
        expect(get(footstepVolumeStore)).toBe(0);
        expect(get(environmentVolumeStore)).toBe(0.15);
        footstepVolumeStore.set(3);
        environmentVolumeStore.set(Number.NaN);
        expect(get(footstepVolumeStore)).toBe(1);
        expect(get(environmentVolumeStore)).toBe(0.15);
    });
});
