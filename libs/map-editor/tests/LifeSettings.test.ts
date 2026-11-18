import { describe, expect, it } from "vitest";
import { DEFAULT_LIFE_SETTINGS, LifeSettings, UpdateWAMSettingCommand, WAMFileFormat } from "../src";

const emptyWam = (): WAMFileFormat =>
    WAMFileFormat.parse({ version: "2.1.0", mapUrl: "map.tmj", entities: {}, areas: [], entityCollections: [] });

describe("LifeSettings", () => {
    it("gives a map that says nothing the defaults, life off", () => {
        expect(LifeSettings.parse({})).toEqual(DEFAULT_LIFE_SETTINGS);
        expect(DEFAULT_LIFE_SETTINGS).toEqual({
            enabled: false,
            reproductionDelay: 120,
            maxLifespan: 900,
            maxSpeed: 1.5,
            huntInterval: 60,
            dolphinReproductionDelay: 300,
            dolphinMaxLifespan: 3600,
        });
    });

    it("refuses a speed beyond six tiles a second", () => {
        expect(LifeSettings.safeParse({ maxSpeed: 99 }).success).toBe(false);
    });

    it("is written to the map by the settings command", async () => {
        const wam = emptyWam();
        await new UpdateWAMSettingCommand(wam, {
            message: {
                $case: "updateLifeSettingMessage",
                updateLifeSettingMessage: {
                    enabled: true,
                    reproductionDelay: 30,
                    maxLifespan: 600,
                    maxSpeed: 2,
                    huntInterval: 20,
                },
            },
        }).execute();
        // An older client sends no dolphin settings: those of the map (here the defaults) are kept.
        expect(wam.settings?.life).toEqual({
            enabled: true,
            reproductionDelay: 30,
            maxLifespan: 600,
            maxSpeed: 2,
            huntInterval: 20,
            dolphinReproductionDelay: 300,
            dolphinMaxLifespan: 3600,
        });
        await new UpdateWAMSettingCommand(wam, {
            message: {
                $case: "updateLifeSettingMessage",
                updateLifeSettingMessage: {
                    enabled: true,
                    reproductionDelay: 30,
                    maxLifespan: 600,
                    maxSpeed: 2,
                    huntInterval: 20,
                    dolphinReproductionDelay: 5,
                    dolphinMaxLifespan: 900,
                },
            },
        }).execute();
        expect(wam.settings?.life).toMatchObject({ dolphinReproductionDelay: 30, dolphinMaxLifespan: 900 });
    });

    it("brings values out of bounds back to the bounds", async () => {
        const wam = emptyWam();
        await new UpdateWAMSettingCommand(wam, {
            message: {
                $case: "updateLifeSettingMessage",
                updateLifeSettingMessage: {
                    enabled: true,
                    reproductionDelay: 1,
                    maxLifespan: 1e9,
                    maxSpeed: Number.NaN,
                    huntInterval: -5,
                },
            },
        }).execute();
        expect(wam.settings?.life).toEqual({
            enabled: true,
            reproductionDelay: 10,
            maxLifespan: 86400,
            maxSpeed: 1.5,
            huntInterval: 5,
            dolphinReproductionDelay: 300,
            dolphinMaxLifespan: 3600,
        });
    });
});
