import { get } from "svelte/store";
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
    vi.resetModules();
    localStorage.removeItem("lampMusicSource");
});

describe("LampMusicSourceStore", () => {
    it("defaults to salons, ignores invalid saved sources, and restores personal music", async () => {
        localStorage.setItem("lampMusicSource", "invalid");
        const rooms = await import("../../../src/front/Stores/LampMusicSourceStore");
        expect(get(rooms.lampMusicSourceStore)).toBe(rooms.LampMusicSource.Rooms);
        rooms.lampMusicSourceStore.set(rooms.LampMusicSource.Personal);
        expect(localStorage.getItem("lampMusicSource")).toBe(rooms.LampMusicSource.Personal);
        vi.resetModules();
        const restored = await import("../../../src/front/Stores/LampMusicSourceStore");
        expect(get(restored.lampMusicSourceStore)).toBe(restored.LampMusicSource.Personal);
        restored.lampMusicSourceStore.update(() => restored.LampMusicSource.Rooms);
        expect(localStorage.getItem("lampMusicSource")).toBe(restored.LampMusicSource.Rooms);
    });
});
