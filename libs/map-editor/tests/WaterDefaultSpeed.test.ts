import { describe, expect, it } from "vitest";
import { UpdateWAMSettingCommand } from "../src/Commands/WAM/UpdateWAMSettingCommand";
import { CELL_LITRES_PER_PX } from "../src/Terrain/WaterGrid";
import { stepInputOf } from "../src/Terrain/WaterInputs";
import {
    DEFAULT_FLOW_PACE,
    DEFAULT_IMPACT_REACH,
    DEFAULT_WATER_PACE,
    DEFAULT_WATER_SETTINGS,
    DEFAULT_WAVE_SETTINGS,
    MIN_WATER_MAX_SURFACE,
    REALISTIC_WATER_SETTINGS,
    WaterSettings,
    waterHasInertia,
} from "../src/types";
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

describe("the water of a map that says nothing", () => {
    it("lets no flood be cut short, is told five times a second, and has inertia unless the map turned it off", () => {
        expect(DEFAULT_WATER_SETTINGS.maxSurface).toBe(256);
        expect(WaterSettings.parse({}).maxSurface).toBe(256);
        expect(DEFAULT_WATER_PACE.updates).toBe(5);
        expect(DEFAULT_WATER_SETTINGS.inertia).toBe(true);
        expect(waterHasInertia(undefined)).toBe(true);
        expect(waterHasInertia(WaterSettings.parse({}))).toBe(true);
        expect(waterHasInertia({ inertia: false })).toBe(false);
        expect(stepInputOf(undefined, 0, [], 0.1).inertia).toBe(true);
        expect(stepInputOf({ ...DEFAULT_WATER_SETTINGS, inertia: false }, 0, [], 0.1).inertia).toBeUndefined();
    });

    it("keeps a lower ceiling a map set, from 18 px", () => {
        expect(MIN_WATER_MAX_SURFACE).toBe(18);
        expect(WaterSettings.parse({ maxSurface: 18 }).maxSurface).toBe(18);
        expect(WaterSettings.parse({ maxSurface: 40 }).maxSurface).toBe(40);
        expect(WaterSettings.safeParse({ maxSurface: 10 }).success).toBe(false);
    });

    it("is the realistic water: one list, the other made of it", () => {
        expect(REALISTIC_WATER_SETTINGS).toEqual({
            ...DEFAULT_WATER_SETTINGS,
            waves: DEFAULT_WAVE_SETTINGS,
            precision: DEFAULT_WATER_PACE.precision,
            updates: DEFAULT_WATER_PACE.updates,
            flowPace: DEFAULT_FLOW_PACE,
            impactReach: DEFAULT_IMPACT_REACH,
        });
    });
});
