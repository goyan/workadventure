import { writable } from "svelte/store";
import { WeatherType } from "@workadventure/map-editor";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const executeUpdateWAMSettings = vi.hoisted(() => vi.fn());
const scene = vi.hoisted((): { settings: { weather?: string }; settled: () => Promise<boolean>; editor: boolean } => ({
    settings: {},
    settled: () => Promise.resolve(true),
    editor: true,
}));
vi.mock("../../../../../src/front/Phaser/Game/MapEditor/Commands/Facades", () => ({ executeUpdateWAMSettings }));
vi.mock("../../../../../src/front/Stores/MenuStore", () => ({ mapEditorActivated: writable(true) }));
vi.mock("../../../../../src/front/Phaser/Game/GameManager", () => ({
    gameManager: {
        getCurrentGameScene: () => ({
            connection: {},
            getMapEditorModeManager: () => (scene.editor ? { whenCommandsSettled: () => scene.settled() } : undefined),
            getGameMap: () => ({ getWamFile: () => ({ getWam: () => ({ settings: scene.settings }) }) }),
        }),
    },
}));

const { MAP_WEATHER_CONFIRM_MS, saveMapWeather } =
    await import("../../../../../src/front/Phaser/Game/Weather/MapWeatherSave");
const { mapEditorActivated } = await import("../../../../../src/front/Stores/MenuStore");

const REAL = { weather: WeatherType.Real, autoInclude: [] };

beforeEach(() => {
    executeUpdateWAMSettings.mockReset();
    executeUpdateWAMSettings.mockImplementation((message: { updateWeatherSettingMessage: { weather: string } }) => {
        scene.settings.weather = message.updateWeatherSettingMessage.weather;
        return Promise.resolve();
    });
    scene.settings = { weather: WeatherType.Automatic };
    scene.settled = () => Promise.resolve(true);
    scene.editor = true;
    mapEditorActivated.set(true);
});

afterEach(() => {
    vi.useRealTimers();
});

describe("saveMapWeather", () => {
    it("sends the weather of the map through the editor and resolves once the server acknowledged it", async () => {
        await saveMapWeather(REAL);
        expect(executeUpdateWAMSettings).toHaveBeenCalledWith({
            $case: "updateWeatherSettingMessage",
            updateWeatherSettingMessage: REAL,
        });
    });

    it("refuses a player who may not edit the map, sending nothing", async () => {
        mapEditorActivated.set(false);
        await expect(saveMapWeather(REAL)).rejects.toThrow();
        expect(executeUpdateWAMSettings).not.toHaveBeenCalled();
    });

    it("fails when the editor did not apply the change (it logs a failure without throwing)", async () => {
        executeUpdateWAMSettings.mockResolvedValue(undefined);
        await expect(saveMapWeather(REAL)).rejects.toThrow("not changed");
    });

    it("fails when the server refuses the change", async () => {
        scene.settled = () => Promise.resolve(false);
        await expect(saveMapWeather(REAL)).rejects.toThrow("did not confirm");
    });

    it("fails when the server does not answer in time", async () => {
        vi.useFakeTimers();
        scene.settled = () =>
            new Promise<boolean>(() => {
                // Never answered.
            });
        const saving = saveMapWeather(REAL);
        const failed = expect(saving).rejects.toThrow("did not confirm");
        await vi.advanceTimersByTimeAsync(MAP_WEATHER_CONFIRM_MS);
        await failed;
    });
});
