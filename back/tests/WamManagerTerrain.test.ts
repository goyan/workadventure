import { heightAt } from "@workadventure/map-editor";
import type { WAMFileFormat } from "@workadventure/map-editor";
import type { EditMapCommandMessage } from "@workadventure/messages";
import { describe, expect, it } from "vitest";
import { WamManager } from "../src/Model/Services/WamManager";

const emptyWam = (): WAMFileFormat => ({
    version: "2.1.0",
    mapUrl: "map.tmj",
    entities: {},
    areas: [],
    entityCollections: [],
});

const dig = (id: string, cells: { x: number; y: number; height: number }[]): EditMapCommandMessage => ({
    id,
    editMapMessage: { message: { $case: "modifyTerrainMessage", modifyTerrainMessage: { cells, soils: [] } } },
});

describe("WamManager relief", () => {
    it("keeps the relief of the room up to date with the commands of the map storage", async () => {
        const manager = new WamManager(emptyWam());
        await manager.applyCommand(dig("one", [{ x: 3, y: 4, height: -24 }]));
        expect(heightAt(manager.getWam().terrain, 3, 4)).toBe(-24);
        expect(manager.getWam().lastCommandId).toBe("one");
        await manager.applyCommand(dig("two", [{ x: 3, y: 4, height: 0 }]));
        expect(heightAt(manager.getWam().terrain, 3, 4)).toBe(0);
    });

    it("keeps the water settings of the room up to date", async () => {
        const manager = new WamManager(emptyWam());
        await manager.applyCommand({
            id: "water",
            editMapMessage: {
                message: {
                    $case: "updateWAMSettingsMessage",
                    updateWAMSettingsMessage: {
                        message: {
                            $case: "updateWaterSettingMessage",
                            updateWaterSettingMessage: { runoff: 3, evaporation: 1 },
                        },
                    },
                },
            },
        });
        expect(manager.getWam().settings?.water).toEqual({
            runoff: 3,
            evaporation: 1,
            // A map that never set its speed goes as in reality.
            speed: 1,
            absorption: 5,
            current: 1,
            maxSurface: 18,
            indoorDrain: 300,
        });
    });

    it("keeps the life settings of the room up to date", async () => {
        const manager = new WamManager(emptyWam());
        await manager.applyCommand({
            id: "life",
            editMapMessage: {
                message: {
                    $case: "updateWAMSettingsMessage",
                    updateWAMSettingsMessage: {
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
                    },
                },
            },
        });
        expect(manager.getWam().settings?.life).toEqual({
            enabled: true,
            reproductionDelay: 30,
            maxLifespan: 600,
            maxSpeed: 2,
            huntInterval: 20,
            dolphinReproductionDelay: 300,
            dolphinMaxLifespan: 3600,
            // Not told by the message: the default.
            drinkInterval: 120,
        });
    });

    // A broken command must not stop the room: the relief stays as it was and the next commands still apply.
    it("survives a broken relief command", async () => {
        const manager = new WamManager(emptyWam());
        const tooMany = Array.from({ length: 20001 }, (_, index) => ({ x: index, y: 0, height: -1 }));
        await expect(manager.applyCommand(dig("bad", tooMany))).rejects.toThrow();
        expect(manager.getWam().terrain).toBeUndefined();
        await manager.applyCommand(dig("good", [{ x: 0, y: 0, height: -8 }]));
        expect(heightAt(manager.getWam().terrain, 0, 0)).toBe(-8);
    });
});
