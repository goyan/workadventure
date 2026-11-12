import { afterEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockFn } from "vitest-mock-extended";
import { get, writable } from "svelte/store";
import type { RemotePlayer } from "../../../../../src/front/Phaser/Entity/RemotePlayer";
import type { GameScene } from "../../../../../src/front/Phaser/Game/GameScene";

const draw = vi.fn();
const hide = vi.fn();
vi.mock("../../../../../src/front/Stores/MapEditorStore", () => ({ mapEditorModeStore: writable(false) }));
vi.mock("../../../../../src/front/Connection/LocalUserStore", () => ({
    localUserStore: { getLocalUser: () => undefined, getDisableNight: () => false, setDisableNight: vi.fn() },
}));
vi.mock("../../../../../src/front/Phaser/Game/Night/NightOverlay", () => ({
    NightOverlay: class {
        draw = draw;
        hide = hide;
        destroy = vi.fn();
    },
}));
vi.mock("../../../../../src/front/Phaser/Game/Night/NightLights", () => ({
    lightableAreas: () => [],
    isInLightableArea: () => false,
    NightLights: class {
        update(): never[] {
            return [];
        }
        reset(): void {}
        isFading(): boolean {
            return false;
        }
    },
}));
vi.mock("../../../../../src/front/Phaser/Game/Night/NightHalos", () => ({
    NightHalos: class {
        update(): never[] {
            return [];
        }
        reset(): void {}
        isAnimating(): boolean {
            return false;
        }
    },
}));
const { NightMode, nightModeStore, nightDateStore } = await import("../../../../../src/front/Stores/NightStore");
const { NightManager } = await import("../../../../../src/front/Phaser/Game/Night/NightManager");
const { rgbLampLightsStore } = await import("../../../../../src/front/Stores/RgbLampStore");

let manager: InstanceType<typeof NightManager> | undefined;
afterEach(() => {
    manager?.destroy();
    manager = undefined;
    nightModeStore.set(NightMode.Server);
    rgbLampLightsStore.set([]);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    draw.mockClear();
    hide.mockClear();
});

function createScene(): ReturnType<typeof mockDeep<GameScene>> {
    const scene = mockDeep<GameScene>();
    const wrapper = mockDeep<ReturnType<GameScene["getGameMapFrontWrapper"]>>();
    wrapper.getMap.mockReturnValue(mockDeep<ReturnType<typeof wrapper.getMap>>());
    scene.getGameMapFrontWrapper.mockReturnValue(wrapper);
    scene.getGameMap.mockReturnValue(mockDeep<ReturnType<GameScene["getGameMap"]>>());
    scene.CurrentPlayer.x = 100;
    scene.CurrentPlayer.y = 100;
    scene.MapPlayersByKey[Symbol.iterator] = mockFn<() => MapIterator<[number, RemotePlayer]>>();
    scene.MapPlayersByKey[Symbol.iterator].mockReturnValue(new Map<number, RemotePlayer>().entries());
    return scene;
}

describe("personal night clock choice", () => {
    it("defaults to server night despite a daytime computer, switches to computer day and turns off", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-15T11:00:00Z"));
        vi.spyOn(Date.prototype, "getHours").mockReturnValue(12);
        vi.spyOn(performance, "now").mockReturnValue(0);
        const serverNow = Date.parse("2026-01-15T20:00:00Z");
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ now: serverNow }))));
        manager = new NightManager(createScene());
        await vi.advanceTimersByTimeAsync(0);
        manager.update(0);
        expect(draw).toHaveBeenCalledWith(expect.objectContaining({ opacity: 0.6 }));
        expect(get(nightDateStore)?.getTime()).toBe(serverNow);
        nightModeStore.set(NightMode.Computer);
        manager.update(1);
        expect(hide).toHaveBeenCalledTimes(1);
        expect(get(nightDateStore)?.getTime()).toBe(Date.now());
        nightModeStore.set(NightMode.Server);
        manager.update(2);
        expect(draw).toHaveBeenCalledTimes(2);
        nightModeStore.set(NightMode.Disabled);
        manager.update(3);
        expect(hide).toHaveBeenCalledTimes(2);
        expect(get(nightDateStore)?.getTime()).toBe(serverNow);
        manager.destroy();
        manager = undefined;
        expect(get(nightDateStore)).toBeUndefined();
    });

    it("uses computer night in its own time zone while the server sees day", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-15T11:00:00Z"));
        vi.spyOn(Date.prototype, "getHours").mockReturnValue(22);
        vi.spyOn(performance, "now").mockReturnValue(0);
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ now: Date.now() }))));
        manager = new NightManager(createScene());
        await vi.advanceTimersByTimeAsync(0);
        manager.update(0);
        expect(draw).not.toHaveBeenCalled();
        nightModeStore.set(NightMode.Computer);
        manager.update(1);
        expect(draw).toHaveBeenCalledWith(expect.objectContaining({ opacity: 0.6 }));
    });

    it("pierces the veil with the lights of the RGB lamps, and draws it again when one changes shape", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-15T20:00:00Z"));
        vi.spyOn(performance, "now").mockReturnValue(0);
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ now: Date.now() }))));
        const scene = createScene();
        manager = new NightManager(scene);
        await vi.advanceTimersByTimeAsync(0);
        const light = { id: "lamp", x: 10, y: 20, size: 384, textureKey: "rgb-lamp:lamp:96", revision: 1 };
        rgbLampLightsStore.set([light]);
        manager.update(0);
        expect(draw).toHaveBeenLastCalledWith(expect.objectContaining({ lamps: [light] }));
        manager.update(1);
        expect(draw).toHaveBeenCalledTimes(1);
        scene.markDirty.mockClear();
        rgbLampLightsStore.set([{ ...light, revision: 2 }]);
        // The scene is only rendered when asked: a lamp that changes asks for it.
        expect(scene.markDirty.mock.calls.length).toBeGreaterThan(0);
        manager.update(2);
        expect(draw).toHaveBeenCalledTimes(2);
        expect(draw).toHaveBeenLastCalledWith(expect.objectContaining({ lamps: [{ ...light, revision: 2 }] }));
    });
});
