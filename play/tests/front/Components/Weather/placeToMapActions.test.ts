import { get, writable } from "svelte/store";
import { WeatherType } from "@workadventure/map-editor";
import type { WeatherLocation } from "@workadventure/map-editor";
import type { UpdateWeatherSettingMessage } from "@workadventure/messages";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorldPlace } from "../../../../src/front/Phaser/Game/Night/WorldDaylight";

const save = vi.hoisted(() => vi.fn());
const map = vi.hoisted((): { settings: { weather?: string; weatherLocation?: WeatherLocation } } => ({ settings: {} }));
vi.mock("../../../../src/front/Phaser/Game/Weather/MapWeatherSave", () => ({ saveMapWeather: save }));
vi.mock("../../../../src/front/Stores/MenuStore", () => ({ mapEditorActivated: writable(true) }));
const sendConditions = vi.hoisted(() => vi.fn());
vi.mock("../../../../src/front/Components/Catastrophe/fireConditionsActions", () => ({
    sendFireConditions: sendConditions,
}));
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
const { NightMode, nightModeStore, worldPointStore } = await import("../../../../src/front/Stores/NightStore");
const { fireConditionsStore } = await import("../../../../src/front/Stores/FireConditionsStore");
const MANUAL = {
    manual: true,
    temperature: 35,
    humidity: 10,
    windSpeed: 40,
    windFrom: 90,
    thresholdTemperature: 30,
    thresholdHumidity: 30,
    thresholdWindSpeed: 30,
};

const LILLE = { name: "Lille", latitude: 50.63, longitude: 3.06, timezone: "Europe/Paris" };
const POINT: WorldPlace = {
    name: "Hong Kong 770 km",
    longName: "24° N 122° E · Hong Kong à 770 km",
    coordinates: "24° N 122° E",
    latitude: 24.2,
    longitude: 121.9,
    timezone: "Asia/Taipei",
};

/** The server confirms, and the map holds the change as the editor applies it. */
function confirmedByTheServer(): void {
    save.mockImplementation((update: UpdateWeatherSettingMessage) => {
        map.settings.weather = update.weather;
        map.settings.weatherLocation = update.clearLocation ? undefined : update.location;
        return Promise.resolve();
    });
}

beforeEach(() => {
    save.mockReset();
    sendConditions.mockReset();
    fireConditionsStore.set(undefined);
    map.settings = { weather: WeatherType.Automatic, weatherLocation: LILLE };
    appliedPlaceStore.set(undefined);
    mapEditorActivated.set(true);
    nightModeStore.set(NightMode.World);
    worldPointStore.set({ latitude: 24.2, longitude: 121.9 });
});

describe("applyPlaceToMap", () => {
    it("saves the place as the weather settings of the map do, in real weather, with its coordinates and zone", async () => {
        confirmedByTheServer();
        await applyPlaceToMap(POINT, { leaveManual: false });
        expect(save).toHaveBeenCalledWith({
            weather: WeatherType.Real,
            location: { name: "24° N 122° E", latitude: 24.2, longitude: 121.9, timezone: "Asia/Taipei" },
            autoInclude: [],
        });
    });

    it("takes the player back to the time of the server once the server confirmed, the point kept", async () => {
        let confirm: () => void = () => undefined;
        save.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    confirm = resolve;
                }),
        );
        const applying = applyPlaceToMap(POINT, { leaveManual: false });
        await Promise.resolve();
        // Not yet confirmed: still their own sky.
        expect(get(nightModeStore)).toBe(NightMode.World);
        confirm();
        await applying;
        expect(get(nightModeStore)).toBe(NightMode.Server);
        // The point they followed is remembered, for coming back to it later.
        expect(get(worldPointStore)).toEqual({ latitude: 24.2, longitude: 121.9 });
    });

    it("leaves the conditions set by hand for the real ones once confirmed, when asked", async () => {
        confirmedByTheServer();
        fireConditionsStore.set(MANUAL);
        await applyPlaceToMap(POINT, { leaveManual: true });
        expect(sendConditions).toHaveBeenCalledWith({ ...MANUAL, manual: false });
    });

    it("leaves the player on their own weather when the map could not follow the place", async () => {
        save.mockRejectedValue(new Error("refused by the server"));
        fireConditionsStore.set(MANUAL);
        await expect(applyPlaceToMap(POINT, { leaveManual: true })).rejects.toThrow("refused by the server");
        expect(sendConditions).not.toHaveBeenCalled();
        expect(get(nightModeStore)).toBe(NightMode.World);
        expect(get(appliedPlaceStore)).toBeUndefined();
    });
});

describe("revertMapPlace", () => {
    it("brings the map back to its weather and place of before, while it still follows the place applied", async () => {
        confirmedByTheServer();
        await applyPlaceToMap(POINT, { leaveManual: false });
        expect(canRevertMapPlace()).toBe(true);
        await revertMapPlace();
        expect(save).toHaveBeenLastCalledWith({ weather: WeatherType.Automatic, location: LILLE, autoInclude: [] });
        expect(get(appliedPlaceStore)).toBeUndefined();
        expect(canRevertMapPlace()).toBe(false);
    });

    it("offers nothing once someone else moved the map elsewhere, nor to a player who may not edit it", async () => {
        confirmedByTheServer();
        await applyPlaceToMap(POINT, { leaveManual: false });
        mapEditorActivated.set(false);
        expect(canRevertMapPlace()).toBe(false);
        mapEditorActivated.set(true);
        map.settings.weatherLocation = { name: "Oslo", latitude: 59.91, longitude: 10.75 };
        expect(canRevertMapPlace()).toBe(false);
    });
});
