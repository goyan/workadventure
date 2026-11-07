import { afterEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockFn } from "vitest-mock-extended";
import { writable } from "svelte/store";
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
const { NightMode, nightModeStore } = await import("../../../../../src/front/Stores/NightStore");
const { NightManager } = await import("../../../../../src/front/Phaser/Game/Night/NightManager");

let manager: InstanceType<typeof NightManager> | undefined;
afterEach(() => {
    manager?.destroy();
    manager = undefined;
    nightModeStore.set(NightMode.Server);
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
        nightModeStore.set(NightMode.Computer);
        manager.update(1);
        expect(hide).toHaveBeenCalledTimes(1);
        nightModeStore.set(NightMode.Server);
        manager.update(2);
        expect(draw).toHaveBeenCalledTimes(2);
        nightModeStore.set(NightMode.Disabled);
        manager.update(3);
        expect(hide).toHaveBeenCalledTimes(2);
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
});
