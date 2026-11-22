import { get, writable } from "svelte/store";
import { WeatherType } from "@workadventure/map-editor";
import type { WeatherLocation } from "@workadventure/map-editor";
import type { FireConditionsMessage } from "@workadventure/messages";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorldPlace } from "../../../../src/front/Phaser/Game/Night/WorldDaylight";

const save = vi.hoisted(() => vi.fn());
const sendConditions = vi.hoisted(() => vi.fn());
const map = vi.hoisted((): { settings: { weather?: string; weatherLocation?: WeatherLocation } } => ({ settings: {} }));
vi.mock("../../../../src/front/Phaser/Game/MapEditor/Commands/Facades", () => ({ executeUpdateWAMSettings: save }));
vi.mock("../../../../src/front/Components/Catastrophe/fireConditionsActions", () => ({
    sendFireConditions: sendConditions,
}));
vi.mock("../../../../src/front/Stores/MenuStore", () => ({ mapEditorActivated: writable(true) }));
vi.mock("../../../../src/front/Phaser/Game/GameManager", () => ({
    gameManager: {
        getCurrentGameScene: () => ({
            connection: {},
            getMapEditorModeManager: () => ({}),
            getGameMap: () => ({ getWamFile: () => ({ getWam: () => ({ settings: map.settings }) }) }),
        }),
    },
}));

const { applyPlaceToMap, canRevertMapPlace, revertMapPlace } =
    await import("../../../../src/front/Components/Weather/placeToMapActions");
const { appliedPlaceStore } = await import("../../../../src/front/Phaser/Game/Weather/PlaceToMap");
const { mapEditorActivated } = await import("../../../../src/front/Stores/MenuStore");
const { fireConditionsStore } = await import("../../../../src/front/Stores/FireConditionsStore");
const { NightMode, nightModeStore } = await import("../../../../src/front/Stores/NightStore");

const LILLE = { name: "Lille", latitude: 50.63, longitude: 3.06, timezone: "Europe/Paris" };
const POINT: WorldPlace = {
    name: "Hong Kong 770 km",
    longName: "24° N 122° E · Hong Kong à 770 km",
    coordinates: "24° N 122° E",
    latitude: 24.2,
    longitude: 121.9,
    timezone: "Asia/Taipei",
};
const MANUAL: FireConditionsMessage = {
    manual: true,
    temperature: 35,
    humidity: 10,
    windSpeed: 40,
    windFrom: 90,
    thresholdTemperature: 30,
    thresholdHumidity: 30,
    thresholdWindSpeed: 30,
};

/** The server applies the change to the map as the editor command does. */
function savedAsTheMap(): void {
    save.mockImplementation(
        (message: { updateWeatherSettingMessage: { weather: string; location?: WeatherLocation } }) => {
            map.settings.weather = message.updateWeatherSettingMessage.weather;
            map.settings.weatherLocation = message.updateWeatherSettingMessage.location;
            return Promise.resolve();
        },
    );
}

beforeEach(() => {
    save.mockReset();
    sendConditions.mockReset();
    map.settings = { weather: WeatherType.Automatic, weatherLocation: LILLE };
    appliedPlaceStore.set(undefined);
    mapEditorActivated.set(true);
    fireConditionsStore.set(undefined);
    nightModeStore.set(NightMode.World);
});

describe("applyPlaceToMap", () => {
    it("saves the place in the map in real weather, with its latitude, longitude, name and time zone", async () => {
        savedAsTheMap();
        await applyPlaceToMap(POINT, { leaveManual: true, followMap: false });
        expect(save).toHaveBeenCalledWith({
            $case: "updateWeatherSettingMessage",
            updateWeatherSettingMessage: {
                weather: WeatherType.Real,
                location: { name: "24° N 122° E", latitude: 24.2, longitude: 121.9, timezone: "Asia/Taipei" },
                autoInclude: [],
            },
        });
        expect(get(nightModeStore)).toBe(NightMode.World);
        expect(sendConditions).not.toHaveBeenCalled();
    });

    it("then leaves the conditions set by hand and takes this player back to the weather of the map, when asked", async () => {
        savedAsTheMap();
        fireConditionsStore.set(MANUAL);
        await applyPlaceToMap(POINT, { leaveManual: true, followMap: true });
        expect(sendConditions).toHaveBeenCalledWith({ ...MANUAL, manual: false });
        expect(get(nightModeStore)).toBe(NightMode.Server);
    });

    it("changes nothing else when the map could not be saved", async () => {
        save.mockRejectedValue(new Error("refused"));
        fireConditionsStore.set(MANUAL);
        await expect(applyPlaceToMap(POINT, { leaveManual: true, followMap: true })).rejects.toThrow("refused");
        expect(sendConditions).not.toHaveBeenCalled();
        expect(get(nightModeStore)).toBe(NightMode.World);
        expect(get(appliedPlaceStore)).toBeUndefined();
    });

    it("changes nothing else when the editor did not apply the change (it logs a failure without throwing)", async () => {
        save.mockResolvedValue(undefined);
        fireConditionsStore.set(MANUAL);
        await expect(applyPlaceToMap(POINT, { leaveManual: true, followMap: true })).rejects.toThrow();
        expect(sendConditions).not.toHaveBeenCalled();
        expect(get(nightModeStore)).toBe(NightMode.World);
        expect(get(appliedPlaceStore)).toBeUndefined();
    });

    it("refuses a player who may not edit the map", async () => {
        mapEditorActivated.set(false);
        await expect(applyPlaceToMap(POINT, { leaveManual: false, followMap: false })).rejects.toThrow();
        expect(save).not.toHaveBeenCalled();
    });
});

describe("revertMapPlace", () => {
    it("brings the map back to its weather and place of before, while it still follows the place applied", async () => {
        savedAsTheMap();
        await applyPlaceToMap(POINT, { leaveManual: false, followMap: false });
        expect(canRevertMapPlace()).toBe(true);
        await revertMapPlace();
        expect(save).toHaveBeenLastCalledWith({
            $case: "updateWeatherSettingMessage",
            updateWeatherSettingMessage: { weather: WeatherType.Automatic, location: LILLE, autoInclude: [] },
        });
        expect(get(appliedPlaceStore)).toBeUndefined();
        expect(canRevertMapPlace()).toBe(false);
    });

    it("offers nothing once someone else moved the map elsewhere", async () => {
        savedAsTheMap();
        await applyPlaceToMap(POINT, { leaveManual: false, followMap: false });
        map.settings.weatherLocation = { name: "Oslo", latitude: 59.91, longitude: 10.75 };
        expect(canRevertMapPlace()).toBe(false);
    });
});
