import { describe, expect, it } from "vitest";
import { UpdateWAMSettingCommand } from "../src/Commands/WAM/UpdateWAMSettingCommand";
import { CELL_LITRES_PER_PX } from "../src/Terrain/WaterGrid";
import { stepInputOf } from "../src/Terrain/WaterInputs";
import { DEFAULT_WATER_SETTINGS, REALISTIC_WATER_SETTINGS, WaterSettings } from "../src/types";
import type { WAMFileFormat } from "../src/types";

/** What the sources of a step pour, in cubic metres. */
const pouredM3 = (input: ReturnType<typeof stepInputOf>): number =>
    input.flows.reduce((sum, flow) => sum + flow.px, 0) * (CELL_LITRES_PER_PX / 1000);

/** A source of 100 m³ an hour. */
const source = [{ cellX: 0, cellY: 0, litresPerMinute: (100 * 1000) / 60, radiusCells: 0 }];

describe("the speed of the water by default", () => {
    it("is that of reality: 1, as the realistic water", () => {
        expect(DEFAULT_WATER_SETTINGS.speed).toBe(1);
        expect(REALISTIC_WATER_SETTINGS.speed).toBe(DEFAULT_WATER_SETTINGS.speed);
        // The settings of a map that says nothing of the speed.
        expect(WaterSettings.parse({}).speed).toBe(1);
    });

    it("leaves a map its own speed", () => {
        expect(WaterSettings.parse({ speed: 60 }).speed).toBe(60);
        expect(WaterSettings.parse({ speed: 300 }).speed).toBe(300);
    });

    it("lets a source of 100 m³ an hour pour 100 m³ in an hour of real time, 6000 on a map 60 times faster", () => {
        // A map without water settings.
        expect(pouredM3(stepInputOf(undefined, 0, source, 3600))).toBeCloseTo(100, 6);
        expect(pouredM3(stepInputOf(WaterSettings.parse({}), 0, source, 3600))).toBeCloseTo(100, 6);
        expect(pouredM3(stepInputOf(WaterSettings.parse({ speed: 60 }), 0, source, 3600))).toBeCloseTo(6000, 6);
    });

    it("is what the panel of the water writes for a map that had none, from a client that sends no speed", async () => {
        const wam: WAMFileFormat = {
            version: "1.0.0",
            mapUrl: "map.tmj",
            entities: {},
            areas: [],
            entityCollections: [],
            settings: {},
        };
        await new UpdateWAMSettingCommand(wam, {
            message: { $case: "updateWaterSettingMessage", updateWaterSettingMessage: { runoff: 4, evaporation: 0.5 } },
        }).execute();
        expect(wam.settings?.water?.speed).toBe(1);
        // A map set at 60 keeps it when the panel touches another setting.
        await new UpdateWAMSettingCommand(wam, {
            message: {
                $case: "updateWaterSettingMessage",
                updateWaterSettingMessage: { runoff: 4, evaporation: 0.5, speed: 60 },
            },
        }).execute();
        await new UpdateWAMSettingCommand(wam, {
            message: { $case: "updateWaterSettingMessage", updateWaterSettingMessage: { runoff: 2, evaporation: 0.5 } },
        }).execute();
        expect(wam.settings?.water?.speed).toBe(60);
    });
});
