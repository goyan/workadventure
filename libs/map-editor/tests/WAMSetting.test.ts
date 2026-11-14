import { describe, expect, it } from "vitest";
import { UpdateWAMSettingCommand, WeatherType, WAMFileFormat as WamSchema, type WAMFileFormat } from "../src";

describe("WAM Setting", () => {
    const defaultWamFile: WAMFileFormat = {
        version: "1.0.0",
        mapUrl: "testMapUrl",
        entities: {},
        areas: [],
        entityCollections: [],
    };
    const dataToModify = {
        enabled: true,
        title: "testTitle",
        rights: ["testRights"],
        scope: "testScope",
        audienceVideoFeedbackActivated: false,
        recording: {
            enabled: true,
            rights: ["testRecordingRights"],
        },
    };
    it("stores shared weather without changing other map settings and rejects unknown weather", async () => {
        const wam: WAMFileFormat = { ...defaultWamFile, settings: { recording: { enableSounds: true } } };
        const setWeather = (weather: string): Promise<void> =>
            new UpdateWAMSettingCommand(wam, {
                message: {
                    $case: "updateWeatherSettingMessage",
                    updateWeatherSettingMessage: { weather, autoInclude: [] },
                },
            }).execute();
        await setWeather(WeatherType.Automatic);
        expect(WamSchema.parse(wam).settings?.weather).toBe(WeatherType.Automatic);
        await setWeather(WeatherType.Storm);
        expect(wam.settings).toEqual({ recording: { enableSounds: true }, weather: WeatherType.Storm });
        expect(WamSchema.parse(wam).settings?.weather).toBe(WeatherType.Storm);
        await expect(Promise.resolve().then(() => setWeather("invalid-weather"))).rejects.toThrow();
        expect(wam.settings?.weather).toBe(WeatherType.Storm);
        expect(WamSchema.parse({ ...wam, settings: { weather: "invalid" } }).settings?.weather).toBeUndefined();
    });

    it("accepts fog as map weather", () => {
        expect(WamSchema.parse({ ...defaultWamFile, settings: { weather: "fog" } }).settings?.weather).toBe("fog");
    });

    it("reads the auto weather settings, and drops broken ones", () => {
        expect(
            WamSchema.parse({ ...defaultWamFile, settings: { weatherAuto: { frequency: "calm", include: ["rain"] } } })
                .settings?.weatherAuto,
        ).toEqual({ frequency: "calm", include: ["rain"] });
        expect(
            WamSchema.parse({ ...defaultWamFile, settings: { weatherAuto: { frequency: "loud" } } }).settings
                ?.weatherAuto,
        ).toBeUndefined();
    });

    it("stores the auto settings sent with the weather", async () => {
        const wam: WAMFileFormat = { ...defaultWamFile };
        await new UpdateWAMSettingCommand(wam, {
            message: {
                $case: "updateWeatherSettingMessage",
                updateWeatherSettingMessage: {
                    weather: "automatic",
                    autoFrequency: "stormy",
                    autoInclude: ["rain", "fog"],
                },
            },
        }).execute();
        expect(wam.settings?.weatherAuto).toEqual({ frequency: "stormy", include: ["rain", "fog"] });
    });

    it("stores the place of the map sent with the weather, and keeps it when none or a broken one is sent", async () => {
        const wam: WAMFileFormat = { ...defaultWamFile };
        const send = (location?: { name: string; latitude: number; longitude: number }): Promise<void> =>
            new UpdateWAMSettingCommand(wam, {
                message: {
                    $case: "updateWeatherSettingMessage",
                    updateWeatherSettingMessage: { weather: "real", autoInclude: [], location },
                },
            }).execute();
        await send({ name: "Lyon, Auvergne-Rhône-Alpes, France", latitude: 45.74906, longitude: 4.84789 });
        expect(wam.settings?.weather).toBe(WeatherType.Real);
        const lyon = { name: "Lyon, Auvergne-Rhône-Alpes, France", latitude: 45.74906, longitude: 4.84789 };
        expect(wam.settings?.weatherLocation).toEqual(lyon);
        await send();
        expect(wam.settings?.weatherLocation).toEqual(lyon);
        await send({ name: "Nowhere", latitude: 123, longitude: 4 });
        expect(wam.settings?.weatherLocation).toEqual(lyon);
        expect(WamSchema.parse(wam).settings?.weatherLocation).toEqual(lyon);
    });

    it("goes back to the default place when asked to, whatever place is sent with it", async () => {
        const lyon = { name: "Lyon, Auvergne-Rhône-Alpes, France", latitude: 45.74906, longitude: 4.84789 };
        const wam: WAMFileFormat = {
            ...defaultWamFile,
            settings: { weather: WeatherType.Real, weatherLocation: lyon },
        };
        await new UpdateWAMSettingCommand(wam, {
            message: {
                $case: "updateWeatherSettingMessage",
                updateWeatherSettingMessage: { weather: "real", autoInclude: [], clearLocation: true, location: lyon },
            },
        }).execute();
        expect(wam.settings?.weatherLocation).toBeUndefined();
        expect(wam.settings?.weather).toBe(WeatherType.Real);
    });

    it("drops a broken place of the map when reading it", () => {
        expect(
            WamSchema.parse({
                ...defaultWamFile,
                settings: { weatherLocation: { name: "", latitude: 0, longitude: 500 } },
            }).settings?.weatherLocation,
        ).toBeUndefined();
    });

    it("keeps the auto settings when an older client sends only the weather", async () => {
        const wam: WAMFileFormat = {
            ...defaultWamFile,
            settings: { weather: WeatherType.Automatic, weatherAuto: { frequency: "calm", include: ["snow"] } },
        };
        await new UpdateWAMSettingCommand(wam, {
            message: {
                $case: "updateWeatherSettingMessage",
                updateWeatherSettingMessage: { weather: "clear", autoInclude: [] },
            },
        }).execute();
        expect(wam.settings?.weather).toBe("clear");
        expect(wam.settings?.weatherAuto).toEqual({ frequency: "calm", include: ["snow"] });
    });

    it("should change WAM file loaded when WAMSettingCommand received", async () => {
        const wamFile: WAMFileFormat = { ...defaultWamFile };
        const command = new UpdateWAMSettingCommand(
            wamFile,
            {
                message: {
                    $case: "updateMegaphoneSettingMessage",
                    updateMegaphoneSettingMessage: { settings: dataToModify },
                },
            },
            "test-uuid",
        );
        await command.execute();
        expect(wamFile?.settings?.megaphone).toEqual(dataToModify);
    });

    it("should update recording settings when recording command received", async () => {
        const wamFile: WAMFileFormat = { ...defaultWamFile };
        const recordingData = {
            enableSounds: true,
            rights: ["tag-a", "tag-b"],
        };
        const command = new UpdateWAMSettingCommand(
            wamFile,
            {
                message: {
                    $case: "updateRecordingSettingMessage",
                    updateRecordingSettingMessage: { settings: recordingData },
                },
            },
            "test-recording-uuid",
        );
        await command.execute();
        expect(wamFile?.settings?.recording).toEqual(recordingData);
    });

    it("adjusts a library object for the map, then restores it, leaving the other adjustments alone", async () => {
        const wamFile: WAMFileFormat = {
            ...defaultWamFile,
            settings: { prefabOverrides: { lamp: { layer: "overhead" } } },
        };
        const pool = { layer: "floor", water: [{ x: 4, y: 4, width: 40, height: 20 }] };
        const adjust = (override: unknown) =>
            new UpdateWAMSettingCommand(
                wamFile,
                {
                    message: {
                        $case: "updatePrefabOverrideSettingMessage",
                        updatePrefabOverrideSettingMessage: { prefabId: "pool", override },
                    },
                },
                "test-uuid",
            ).execute();

        await adjust(pool);
        expect(wamFile.settings?.prefabOverrides).toEqual({ lamp: { layer: "overhead" }, pool });

        await adjust(undefined);
        expect(wamFile.settings?.prefabOverrides).toEqual({ lamp: { layer: "overhead" } });

        await expect(Promise.resolve().then(() => adjust({ layer: "ceiling" }))).rejects.toThrow();
    });
});
