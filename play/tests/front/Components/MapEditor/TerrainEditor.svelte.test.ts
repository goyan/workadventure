import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { get } from "svelte/store";

const { executeUpdateTerrain, executeUpdateWAMSettings, mapSettings } = vi.hoisted(() => ({
    executeUpdateTerrain: vi.fn(() => Promise.resolve()),
    executeUpdateWAMSettings: vi.fn(() => Promise.resolve()),
    mapSettings: {
        maxDepthTiles: 2,
        runoff: 10,
        evaporation: 0.2,
        speed: 60,
        absorption: 5,
        current: 1,
        maxSurface: 18,
        indoorDrain: 300,
        inertia: false,
        waves: { roughness: 1, damping: 0.02, breaking: 1, momentum: 1 },
        precision: 3,
        updates: 1,
        flowPace: 1,
        impactReach: 2.5,
        meadow: { enabled: true, growMinutes: 10, thirstMinutes: 20, moistureHold: 1 },
        life: {
            enabled: false,
            reproductionDelay: 120,
            maxLifespan: 900,
            maxSpeed: 1.5,
            huntInterval: 60,
            dolphinReproductionDelay: 300,
            dolphinMaxLifespan: 3600,
            drinkInterval: 120,
        },
    },
}));
vi.mock("../../../../src/front/Phaser/Game/MapEditor/Commands/Facades", () => ({
    executeUpdateTerrain,
    executeUpdateWAMSettings,
}));
vi.mock("../../../../src/front/Phaser/Game/Terrain/TerrainMapSettings", () => ({
    readTerrainMapSettings: () => ({ ...mapSettings }),
}));
vi.mock("../../../../src/i18n/i18n-svelte", async (importOriginal) => {
    const { readable } = await import("svelte/store");
    // Any translation renders as its key.
    const translations = (path: string[]): unknown =>
        new Proxy(() => undefined, {
            get: (_target, name) => translations([...path, String(name)]),
            apply: () => path.join("."),
        });
    const LL = readable(translations([]));
    return { ...(await importOriginal<Record<string, unknown>>()), LL, default: LL };
});

const { default: TerrainEditor } = await import("../../../../src/front/Components/MapEditor/TerrainEditor.svelte");
const { DEFAULT_TERRAIN_BRUSH, terrainBlockedStore, terrainBrushStore, terrainWaterStatsStore } =
    await import("../../../../src/front/Stores/TerrainEditorStore");

// In the document: a checkbox outside of it does not change when clicked.
const target = document.body.appendChild(document.createElement("div"));
let component: ReturnType<typeof mount> | undefined;

function render(): void {
    flushSync(() => {
        component = mount(TerrainEditor, { target });
    });
}
const byTestId = <T extends HTMLElement>(id: string): T => {
    const element = target.querySelector<T>(`[data-testid="${id}"]`);
    if (!element) throw new Error(`No element ${id}`);
    return element;
};
const setRange = (id: string, value: number): void => {
    const input = byTestId(id).querySelector<HTMLInputElement>('input[type="range"]');
    if (!input) throw new Error(`No slider in ${id}`);
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();
};

afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted);
    terrainBrushStore.set(DEFAULT_TERRAIN_BRUSH);
    terrainBlockedStore.set(false);
    executeUpdateTerrain.mockClear();
    executeUpdateWAMSettings.mockClear();
});

describe("TerrainEditor layout", () => {
    // Seen on a laptop screen: the panel is taller than the screen, its last settings could not be reached.
    it("scrolls when it is taller than the room the editor leaves it", () => {
        render();
        const panel = byTestId("terrain-editor");
        expect(panel.classList.contains("overflow-y-auto")).toBe(true);
        expect(panel.classList.contains("min-h-0")).toBe(true);
        expect(panel.classList.contains("flex-1")).toBe(true);
    });
});

describe("TerrainEditor real values", () => {
    it("says under each setting of the map what it is worth in reality", () => {
        render();
        for (const [id, key] of [
            ["terrain-max-depth", "maxDepth"],
            ["terrain-runoff", "runoff"],
            ["terrain-evaporation", "evaporation"],
            ["terrain-absorption", "absorption"],
            ["terrain-speed", "speed"],
            ["terrain-current", "current"],
            ["terrain-max-surface", "maxSurface"],
            ["terrain-indoor-drain", "indoorDrain"],
            ["terrain-inertia", "inertia"],
        ]) {
            expect(byTestId(id).textContent).toContain(`mapEditor.terrain.real.${key}`);
        }
    });
});

describe("TerrainEditor", () => {
    it("switches between digging and raising", () => {
        render();
        expect(get(terrainBrushStore).mode).toBe("dig");
        byTestId("terrain-mode-raise").click();
        expect(get(terrainBrushStore).mode).toBe("raise");
        byTestId("terrain-mode-dig").click();
        expect(get(terrainBrushStore).mode).toBe("dig");
    });

    it("saves the settings of the meadow of the map", () => {
        render();
        setRange("terrain-meadow-grow", 25);
        expect(executeUpdateWAMSettings).toHaveBeenLastCalledWith({
            $case: "updateMeadowSettingMessage",
            updateMeadowSettingMessage: { enabled: true, growMinutes: 25, thirstMinutes: 20, moistureHold: 1 },
        });
    });

    it("turns the inertia of the water of the map on and off", () => {
        render();
        byTestId("terrain-inertia").querySelector("input")?.click();
        flushSync();
        expect(executeUpdateWAMSettings).toHaveBeenLastCalledWith({
            $case: "updateWaterSettingMessage",
            updateWaterSettingMessage: expect.objectContaining({ inertia: true }),
        });
        byTestId("terrain-inertia").querySelector("input")?.click();
        flushSync();
        expect(executeUpdateWAMSettings).toHaveBeenLastCalledWith({
            $case: "updateWaterSettingMessage",
            updateWaterSettingMessage: expect.objectContaining({ inertia: false }),
        });
    });

    it("keeps the detail of a setting folded under its one-line hint", () => {
        render();
        byTestId("terrain-inertia").querySelector("input")?.click();
        flushSync();
        const folded = byTestId("terrain-wave-roughness").querySelector("details");
        expect(folded?.open).toBe(false);
        expect(folded?.querySelector("summary")?.textContent).toContain("mapEditor.terrain.more");
        expect(folded?.textContent).toContain("mapEditor.terrain.waves.roughnessDetail");
        // The hint itself stays in sight.
        expect(byTestId("terrain-wave-roughness").querySelector("p")?.textContent).toContain(
            "mapEditor.terrain.waves.roughnessHint",
        );
        for (const id of ["terrain-water-realistic", "terrain-inertia", "terrain-flow-pace", "terrain-updates"]) {
            expect(byTestId(id).querySelector("details")).not.toBeNull();
        }
    });

    it("sets every setting of the water back to its realistic value with one button", () => {
        render();
        setRange("terrain-runoff", 50);
        byTestId("terrain-water-realistic").querySelector("button")?.click();
        flushSync();
        expect(executeUpdateWAMSettings).toHaveBeenLastCalledWith({
            $case: "updateWaterSettingMessage",
            updateWaterSettingMessage: {
                runoff: 10,
                evaporation: 0.2,
                speed: 1,
                absorption: 5,
                current: 1,
                maxSurface: 256,
                indoorDrain: 300,
                inertia: true,
                waveRoughness: 1,
                waveDamping: 0.02,
                waveBreaking: 1,
                waveMomentum: 1,
                precision: 3,
                updates: 5,
                flowPace: 1,
                impactReach: 2.5,
            },
        });
        // The sliders follow, those of the waves now shown.
        expect(byTestId("terrain-speed").querySelector<HTMLInputElement>('input[type="range"]')?.value).toBe("1");
        expect(target.querySelector('[data-testid="terrain-wave-roughness"]')).not.toBeNull();
    });

    it("sets how often the players are told the water, and how finely the water with inertia is computed", () => {
        render();
        expect(target.querySelector('[data-testid="terrain-precision"]')).toBeNull();
        setRange("terrain-updates", 10);
        expect(executeUpdateWAMSettings).toHaveBeenLastCalledWith({
            $case: "updateWaterSettingMessage",
            updateWaterSettingMessage: expect.objectContaining({ updates: 10 }),
        });
        byTestId("terrain-inertia").querySelector("input")?.click();
        flushSync();
        setRange("terrain-precision", 8);
        expect(executeUpdateWAMSettings).toHaveBeenLastCalledWith({
            $case: "updateWaterSettingMessage",
            updateWaterSettingMessage: expect.objectContaining({ updates: 10, precision: 8 }),
        });
        setRange("terrain-flow-pace", 0.5);
        expect(executeUpdateWAMSettings).toHaveBeenLastCalledWith({
            $case: "updateWaterSettingMessage",
            updateWaterSettingMessage: expect.objectContaining({ flowPace: 0.5 }),
        });
    });

    it("says when the busy server computes the water less finely than the map asks, and tells it less often", () => {
        render();
        byTestId("terrain-inertia").querySelector("input")?.click();
        flushSync();
        expect(target.querySelector('[data-testid="terrain-precision-eased"]')).toBeNull();
        expect(target.querySelector('[data-testid="terrain-updates-eased"]')).toBeNull();
        const stats = { rain: 0, sources: 0, sinks: 0, evaporation: 0, absorption: 0, lost: 0, stock: 0, wetArea: 0 };
        terrainWaterStatsStore.set({ ...stats, rainRate: 0, easedPrecision: 2, easedUpdates: 1 });
        flushSync();
        expect(byTestId("terrain-precision-eased").textContent).toContain("precisionEased");
        expect(byTestId("terrain-updates-eased").textContent).toContain("updatesEased");
        terrainWaterStatsStore.set({ ...stats, rainRate: 0 });
        flushSync();
        expect(target.querySelector('[data-testid="terrain-precision-eased"]')).toBeNull();
        terrainWaterStatsStore.set(undefined);
    });

    it("sets how far the blast of a meteor drives the water away, with or without the water with inertia", () => {
        render();
        setRange("terrain-impact-reach", 4);
        expect(executeUpdateWAMSettings).toHaveBeenLastCalledWith({
            $case: "updateWaterSettingMessage",
            updateWaterSettingMessage: expect.objectContaining({ impactReach: 4 }),
        });
    });

    it("sets the waves of the water with inertia, shown only for it", () => {
        render();
        expect(target.querySelector('[data-testid="terrain-wave-roughness"]')).toBeNull();
        byTestId("terrain-inertia").querySelector("input")?.click();
        flushSync();
        // Turning the inertia on sends the waves the map had.
        expect(executeUpdateWAMSettings).toHaveBeenLastCalledWith({
            $case: "updateWaterSettingMessage",
            updateWaterSettingMessage: expect.objectContaining({
                inertia: true,
                waveRoughness: 1,
                waveDamping: 0.02,
                waveBreaking: 1,
                waveMomentum: 1,
            }),
        });
        setRange("terrain-wave-roughness", 3);
        setRange("terrain-wave-damping", 0.1);
        setRange("terrain-wave-breaking", 0);
        setRange("terrain-wave-momentum", 0.5);
        expect(executeUpdateWAMSettings).toHaveBeenLastCalledWith({
            $case: "updateWaterSettingMessage",
            updateWaterSettingMessage: expect.objectContaining({
                waveRoughness: 3,
                waveDamping: 0.1,
                waveBreaking: 0,
                waveMomentum: 0.5,
            }),
        });
    });

    it("chooses the soil the brush paints", () => {
        render();
        byTestId("terrain-mode-soil").click();
        expect(get(terrainBrushStore).mode).toBe("soil");
        flushSync();
        byTestId("terrain-soil-rock").click();
        expect(get(terrainBrushStore).soil).toBe(5);
        byTestId("terrain-soil-none").click();
        expect(get(terrainBrushStore).soil).toBe(0);
    });

    it("sets the diameter of the brush, the force following it while it is automatic", () => {
        render();
        setRange("terrain-diameter", 8);
        expect(get(terrainBrushStore)).toMatchObject({ diameterTiles: 8, forcePx: undefined });
        // An eighth of 8 tiles: 32 px.
        expect(byTestId("terrain-force").textContent).toContain("32");
    });

    it("keeps a chosen force when the diameter changes, and gives it up when set back to automatic", () => {
        render();
        byTestId("terrain-force-auto").querySelector("input")?.click();
        flushSync();
        setRange("terrain-force", 6);
        expect(get(terrainBrushStore).forcePx).toBe(6);
        setRange("terrain-diameter", 10);
        expect(get(terrainBrushStore)).toMatchObject({ diameterTiles: 10, forcePx: 6 });
        byTestId("terrain-force-auto").querySelector("input")?.click();
        flushSync();
        expect(get(terrainBrushStore).forcePx).toBeUndefined();
    });

    it("saves the maximum depth and the pace of the water in the map", () => {
        render();
        setRange("terrain-max-depth", 5);
        expect(executeUpdateTerrain).toHaveBeenCalledWith(new Map(), 5);
        setRange("terrain-runoff", 20);
        expect(executeUpdateWAMSettings).toHaveBeenLastCalledWith({
            $case: "updateWaterSettingMessage",
            updateWaterSettingMessage: {
                runoff: 20,
                evaporation: 0.2,
                speed: 60,
                absorption: 5,
                current: 1,
                maxSurface: 18,
                indoorDrain: 300,
                inertia: false,
                updates: 1,
                impactReach: 2.5,
            },
        });
        setRange("terrain-evaporation", 1);
        expect(executeUpdateWAMSettings).toHaveBeenLastCalledWith({
            $case: "updateWaterSettingMessage",
            updateWaterSettingMessage: {
                runoff: 20,
                evaporation: 1,
                speed: 60,
                absorption: 5,
                current: 1,
                maxSurface: 18,
                indoorDrain: 300,
                inertia: false,
                updates: 1,
                impactReach: 2.5,
            },
        });
        setRange("terrain-speed", 300);
        expect(executeUpdateWAMSettings).toHaveBeenLastCalledWith({
            $case: "updateWaterSettingMessage",
            updateWaterSettingMessage: {
                runoff: 20,
                evaporation: 1,
                speed: 300,
                absorption: 5,
                current: 1,
                maxSurface: 18,
                indoorDrain: 300,
                inertia: false,
                updates: 1,
                impactReach: 2.5,
            },
        });
        setRange("terrain-absorption", 20);
        expect(executeUpdateWAMSettings).toHaveBeenLastCalledWith({
            $case: "updateWaterSettingMessage",
            updateWaterSettingMessage: {
                runoff: 20,
                evaporation: 1,
                speed: 300,
                absorption: 20,
                current: 1,
                maxSurface: 18,
                indoorDrain: 300,
                inertia: false,
                updates: 1,
                impactReach: 2.5,
            },
        });
    });

    it("saves how high the water of the map may stand, from 18 to 256 px", () => {
        render();
        const slider = byTestId("terrain-max-surface").querySelector<HTMLInputElement>('input[type="range"]');
        expect(slider?.min).toBe("18");
        expect(slider?.max).toBe("256");
        setRange("terrain-max-surface", 120);
        expect(executeUpdateWAMSettings).toHaveBeenLastCalledWith({
            $case: "updateWaterSettingMessage",
            updateWaterSettingMessage: {
                runoff: 10,
                evaporation: 0.2,
                speed: 60,
                absorption: 5,
                current: 1,
                maxSurface: 120,
                indoorDrain: 300,
                inertia: false,
                updates: 1,
                impactReach: 2.5,
            },
        });
    });

    it("saves the strength of the current, from none to twice as strong", () => {
        render();
        const slider = byTestId("terrain-current").querySelector<HTMLInputElement>('input[type="range"]');
        expect(Number(slider?.min)).toBe(0);
        expect(Number(slider?.max)).toBe(2);
        setRange("terrain-current", 0);
        expect(executeUpdateWAMSettings).toHaveBeenLastCalledWith({
            $case: "updateWaterSettingMessage",
            updateWaterSettingMessage: {
                runoff: 10,
                evaporation: 0.2,
                speed: 60,
                absorption: 5,
                current: 0,
                maxSurface: 18,
                indoorDrain: 300,
                inertia: false,
                updates: 1,
                impactReach: 2.5,
            },
        });
    });

    it("saves how fast the floors of the rooms drain, from none to 10000 mm/h", () => {
        render();
        const slider = byTestId("terrain-indoor-drain").querySelector<HTMLInputElement>('input[type="range"]');
        expect(Number(slider?.min)).toBe(0);
        expect(Number(slider?.max)).toBe(10000);
        setRange("terrain-indoor-drain", 0);
        expect(executeUpdateWAMSettings).toHaveBeenLastCalledWith({
            $case: "updateWaterSettingMessage",
            updateWaterSettingMessage: {
                runoff: 10,
                evaporation: 0.2,
                speed: 60,
                absorption: 5,
                current: 1,
                maxSurface: 18,
                indoorDrain: 0,
                inertia: false,
                updates: 1,
                impactReach: 2.5,
            },
        });
    });

    it("says why nothing happens over ground that may not be dug", () => {
        render();
        expect(target.querySelector('[data-testid="terrain-blocked"]')).toBeNull();
        terrainBlockedStore.set(true);
        flushSync();
        expect(byTestId("terrain-blocked").textContent).toContain("mapEditor.terrain.blocked");
    });
});
