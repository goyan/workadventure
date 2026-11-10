import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";

const KEYS = [
    "footstepVolume",
    "environmentVolume",
    "soundEffectsVolumeBaseline",
    "skateboardVolume",
    "weatherVolume",
    "doorVolume",
    "nerfVolume",
    "mapSoundsVolume",
    "notificationSoundVolume",
];

beforeEach(() => {
    for (const key of KEYS) localStorage.removeItem(key);
    vi.resetModules();
});

afterEach(() => {
    for (const key of KEYS) localStorage.removeItem(key);
    vi.resetModules();
});

const load = () => import("../../../src/front/Stores/SoundEffectsStore");

describe("personal sound effect volumes", () => {
    it("starts every volume at 15% and preserves explicit saved volumes", async () => {
        const first = await load();
        for (const store of [
            first.footstepVolumeStore,
            first.skateboardVolumeStore,
            first.weatherVolumeStore,
            first.doorVolumeStore,
            first.nerfVolumeStore,
            first.mapSoundsVolumeStore,
            first.notificationSoundVolumeStore,
        ]) {
            expect(get(store)).toBe(0.15);
        }
        first.weatherVolumeStore.set(0.8);
        vi.resetModules();
        const restored = await load();
        expect(get(restored.weatherVolumeStore)).toBe(0.8);
    });

    it("reduces the previous saved volumes once", async () => {
        localStorage.setItem("footstepVolume", "0.5");
        localStorage.setItem("environmentVolume", "0.8");
        const first = await load();
        expect(get(first.footstepVolumeStore)).toBe(0.15);
        expect(get(first.weatherVolumeStore)).toBe(0.15);
        expect(localStorage.getItem("footstepVolume")).toBe("0.15");
        first.footstepVolumeStore.set(0.2);
        vi.resetModules();
        const restored = await load();
        expect(get(restored.footstepVolumeStore)).toBe(0.2);
    });

    it("takes over the former environment volume for its families, and the footsteps volume for the skateboard", async () => {
        localStorage.setItem("soundEffectsVolumeBaseline", "0.15");
        localStorage.setItem("environmentVolume", "0.4");
        localStorage.setItem("footstepVolume", "0.6");
        const first = await load();
        expect(get(first.weatherVolumeStore)).toBe(0.4);
        expect(get(first.doorVolumeStore)).toBe(0.4);
        expect(get(first.nerfVolumeStore)).toBe(0.4);
        expect(get(first.mapSoundsVolumeStore)).toBe(0.4);
        expect(get(first.notificationSoundVolumeStore)).toBe(0.4);
        expect(get(first.skateboardVolumeStore)).toBe(0.6);
        expect(get(first.footstepVolumeStore)).toBe(0.6);
    });

    it("keeps every family independent and restores each after reload", async () => {
        const first = await load();
        first.footstepVolumeStore.set(0.25);
        first.skateboardVolumeStore.set(0.1);
        first.weatherVolumeStore.set(0);
        first.doorVolumeStore.set(0.9);
        first.nerfVolumeStore.set(0.4);
        first.mapSoundsVolumeStore.set(0.3);
        first.notificationSoundVolumeStore.set(0.7);
        vi.resetModules();
        const restored = await load();
        expect(get(restored.footstepVolumeStore)).toBe(0.25);
        expect(get(restored.skateboardVolumeStore)).toBe(0.1);
        expect(get(restored.weatherVolumeStore)).toBe(0);
        expect(get(restored.doorVolumeStore)).toBe(0.9);
        expect(get(restored.nerfVolumeStore)).toBe(0.4);
        expect(get(restored.mapSoundsVolumeStore)).toBe(0.3);
        expect(get(restored.notificationSoundVolumeStore)).toBe(0.7);
    });

    it("clamps stored and new values to a valid audio volume", async () => {
        localStorage.setItem("soundEffectsVolumeBaseline", "0.15");
        localStorage.setItem("footstepVolume", "-10");
        localStorage.setItem("weatherVolume", "broken");
        const { footstepVolumeStore, weatherVolumeStore } = await load();
        expect(get(footstepVolumeStore)).toBe(0);
        expect(get(weatherVolumeStore)).toBe(0.15);
        footstepVolumeStore.set(3);
        weatherVolumeStore.set(Number.NaN);
        expect(get(footstepVolumeStore)).toBe(1);
        expect(get(weatherVolumeStore)).toBe(0.15);
    });
});
