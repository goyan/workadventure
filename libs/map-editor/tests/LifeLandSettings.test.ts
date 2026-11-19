import { describe, expect, it } from "vitest";
import { LifeSettings, UpdateWAMSettingCommand } from "../src";
import type { WAMFileFormat } from "../src";

const emptyWam = (): WAMFileFormat => ({
    version: "2.1.0",
    mapUrl: "map.tmj",
    areas: [],
    entityCollections: [],
    entities: {},
});
const water = { enabled: true, reproductionDelay: 30, maxLifespan: 600, maxSpeed: 2, huntInterval: 20 };
const send = (wam: WAMFileFormat, land: Record<string, unknown>): Promise<void> =>
    new UpdateWAMSettingCommand(wam, {
        message: { $case: "updateLifeSettingMessage", updateLifeSettingMessage: { ...water, ...land } },
    }).execute();

describe("the settings of the life of the land", () => {
    it("are absent from a map that never had them, and read when it has", () => {
        expect(LifeSettings.parse({}).landEnabled).toBeUndefined();
        expect(LifeSettings.parse({ landEnabled: true, landHuntInterval: 40 })).toMatchObject({
            landEnabled: true,
            landHuntInterval: 40,
        });
        // A value out of its bounds is dropped, not the whole settings of the life.
        expect(LifeSettings.parse({ enabled: true, landHuntInterval: 1 })).toMatchObject({ enabled: true });
        expect(LifeSettings.parse({ landHuntInterval: 1 }).landHuntInterval).toBeUndefined();
    });

    it("are written to the map by the settings command, within their bounds", async () => {
        const wam = emptyWam();
        await send(wam, {
            landEnabled: true,
            antelopeReproductionDelay: 5,
            antelopeMaxLifespan: 500,
            landHuntInterval: 99999,
            landPredatorReproductionDelay: 200,
            landPredatorMaxLifespan: 1000,
        });
        expect(wam.settings?.life).toMatchObject({
            landEnabled: true,
            antelopeReproductionDelay: 10,
            antelopeMaxLifespan: 500,
            landHuntInterval: 3600,
            landPredatorReproductionDelay: 200,
            landPredatorMaxLifespan: 1000,
        });
    });

    it("are kept as the map has them when an older client sends none", async () => {
        const wam = emptyWam();
        await send(wam, { landEnabled: true, landHuntInterval: 40 });
        await send(wam, {});
        expect(wam.settings?.life).toMatchObject({ enabled: true, landEnabled: true, landHuntInterval: 40 });
        expect(wam.settings?.life?.antelopeMaxLifespan).toBeUndefined();
        await send(wam, { landEnabled: false });
        expect(wam.settings?.life?.landEnabled).toBe(false);
    });
});
