import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localUserStore } from "@wa/front/Connection/LocalUserStore";

describe("saved volume of the Jam music", () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => vi.restoreAllMocks());

    it("has no saved volume by default, then reads back the volume saved last", () => {
        expect(localUserStore.getJamMusicVolume()).toBeUndefined();
        localUserStore.setJamMusicVolume(0.4);
        localUserStore.setJamMusicVolume(0);
        expect(localUserStore.getJamMusicVolume()).toBe(0);
    });

    it("ignores a corrupted or out of range saved volume and never saves one", () => {
        localStorage.setItem("jamMusicVolume", "loud");
        expect(localUserStore.getJamMusicVolume()).toBeUndefined();
        localStorage.setItem("jamMusicVolume", "1.5");
        expect(localUserStore.getJamMusicVolume()).toBeUndefined();

        localUserStore.setJamMusicVolume(0.3);
        localUserStore.setJamMusicVolume(Number.NaN);
        localUserStore.setJamMusicVolume(-0.1);
        expect(localUserStore.getJamMusicVolume()).toBe(0.3);
    });

    it("keeps working when the browser refuses the storage (private mode, quota)", () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("SecurityError");
        });
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("QuotaExceededError");
        });
        expect(() => localUserStore.setJamMusicVolume(0.5)).not.toThrow();
        expect(localUserStore.getJamMusicVolume()).toBeUndefined();
    });
});

describe("volume of the Jam music after a reload", () => {
    beforeEach(() => {
        localStorage.clear();
        vi.resetModules();
    });

    it("starts at the volume saved before the page was reloaded (a redeploy reloads it)", async () => {
        localStorage.setItem("jamMusicVolume", "0.25");
        const { jamMusicVolumeStore } = await import("@wa/front/ListeningZone/JamMusicStore");
        const { get } = await import("svelte/store");
        expect(get(jamMusicVolumeStore)).toBe(0.25);
    });

    it("starts at full volume without a saved one, and saves every change", async () => {
        const { jamMusicVolumeStore } = await import("@wa/front/ListeningZone/JamMusicStore");
        const { get } = await import("svelte/store");
        expect(get(jamMusicVolumeStore)).toBe(1);
        jamMusicVolumeStore.set(0.6);
        expect(localStorage.getItem("jamMusicVolume")).toBe("0.6");
    });
});
