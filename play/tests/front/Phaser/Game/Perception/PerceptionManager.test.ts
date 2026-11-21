import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import { get, readable, writable } from "svelte/store";
import { MapStore } from "@workadventure/store-utils";
import type { GameScene } from "../../../../../src/front/Phaser/Game/GameScene";
import type { RemotePlayer } from "../../../../../src/front/Phaser/Entity/RemotePlayer";
import type { PlayerVariablesManager } from "../../../../../src/front/Phaser/Game/PlayerVariablesManager";
import type { Perception } from "../../../../../src/front/Phaser/Game/Perception/PerceptionProtocol";
import type { WeatherPreview } from "../../../../../src/front/Phaser/Game/Weather/RealWeather";

vi.mock("../../../../../src/i18n/i18n-svelte", () => ({
    default: readable({
        woka: { perception: { basic: () => "basic-title", place: () => "place-title" } },
    }),
}));
vi.mock("../../../../../src/front/Phaser/Game/Weather/RealWeatherFetch", () => ({
    // The weather of the place is never asked for here: it stays pending.
    fetchRealWeather: vi.fn(
        () =>
            new Promise<never>(() => {
                // Never answers.
            }),
    ),
}));
vi.mock("../../../../../src/front/Phaser/Game/GameManager", () => ({
    gameManager: { getCurrentGameScene: vi.fn() },
}));

const { PerceptionManager, localPerceptionStore } =
    await import("../../../../../src/front/Phaser/Game/Perception/PerceptionManager");
const { PERCEPTION_VARIABLE } = await import("../../../../../src/front/Phaser/Game/Perception/PerceptionProtocol");
const { basicModeStore } = await import("../../../../../src/front/Stores/BasicModeStore");
const { NightMode, nightModeStore, worldCityStore } = await import("../../../../../src/front/Stores/NightStore");
const { weatherPreviewStore } = await import("../../../../../src/front/Phaser/Game/Weather/RealWeatherClient");

const PUBLISHED = { public: true, persist: false, scope: "room" };

describe("PerceptionManager", () => {
    const variables = mock<PlayerVariablesManager>();
    let scene: ReturnType<typeof mock<GameScene>>;
    let local: ReturnType<typeof writable<Perception>>;
    let remote: ReturnType<typeof mock<RemotePlayer>>;
    let bearerPerception: Perception;

    beforeEach(() => {
        vi.clearAllMocks();
        local = writable<Perception>("none");
        bearerPerception = "basic";
        remote = mock<RemotePlayer>();
        remote.getPerception.mockImplementation(() => bearerPerception);
        scene = mock<GameScene>();
        scene.MapPlayersByKey = new MapStore<number, RemotePlayer>();
        scene.MapPlayersByKey.set(2, remote);
        scene.getPlayerVariablesManager.mockReturnValue(variables);
    });

    afterEach(() => {
        basicModeStore.set(false);
        nightModeStore.set(NightMode.Server);
        worldCityStore.set(undefined);
        weatherPreviewStore.set(undefined);
        localStorage.clear();
    });

    it("publishes the perception on entering the room, then each time it changes, and nothing else", () => {
        const manager = new PerceptionManager(scene, local);
        expect(variables.setVariableFromApp.mock.calls).toEqual([[PERCEPTION_VARIABLE, "none", PUBLISHED]]);
        local.set("place");
        local.set("basic");
        expect(variables.setVariableFromApp.mock.calls).toEqual([
            [PERCEPTION_VARIABLE, "none", PUBLISHED],
            [PERCEPTION_VARIABLE, "place", PUBLISHED],
            [PERCEPTION_VARIABLE, "basic", PUBLISHED],
        ]);
        manager.destroy();
        local.set("none");
        expect(variables.setVariableFromApp.mock.calls).toHaveLength(3);
    });

    it("puts the bearer's symbol, with its tooltip, over the others for a local player in the shared world", () => {
        const manager = new PerceptionManager(scene, local);
        expect(remote.showPerceptionMark.mock.calls.at(-1)).toEqual(["basic", "basic-title"]);
        bearerPerception = "place";
        manager.refresh(remote);
        expect(remote.showPerceptionMark.mock.calls.at(-1)).toEqual(["place", "place-title"]);
        bearerPerception = "none";
        manager.refresh(remote);
        expect(remote.showPerceptionMark.mock.calls.at(-1)).toEqual([undefined, ""]);
        manager.destroy();
    });

    it("takes the symbols away from every other player when the local one leaves the shared world, and back", () => {
        const manager = new PerceptionManager(scene, local);
        local.set("basic");
        expect(remote.showPerceptionMark.mock.calls.at(-1)).toEqual([undefined, ""]);
        local.set("place");
        expect(remote.showPerceptionMark.mock.calls.at(-1)).toEqual([undefined, ""]);
        local.set("none");
        expect(remote.showPerceptionMark.mock.calls.at(-1)).toEqual(["basic", "basic-title"]);
        manager.destroy();
    });

    it("reads Basique and the city followed on the local clock, Basique first, the settings trial aside", () => {
        expect(get(localPerceptionStore)).toBe("none");
        nightModeStore.set(NightMode.World);
        worldCityStore.set({ name: "Tokyo", latitude: 35.68, longitude: 139.69 });
        expect(get(localPerceptionStore)).toBe("place");
        weatherPreviewStore.set(mock<WeatherPreview>());
        expect(get(localPerceptionStore)).toBe("none");
        weatherPreviewStore.set(undefined);
        basicModeStore.set(true);
        expect(get(localPerceptionStore)).toBe("basic");
        nightModeStore.set(NightMode.Server);
        expect(get(localPerceptionStore)).toBe("basic");
        basicModeStore.set(false);
        expect(get(localPerceptionStore)).toBe("none");
    });
});
