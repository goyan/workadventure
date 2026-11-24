import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import type { DashboardRain } from "../../../../src/front/Phaser/Game/Terrain/DashboardRain";

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

const { default: TerrainWaterDashboard } =
    await import("../../../../src/front/Components/MapEditor/TerrainWaterDashboard.svelte");
const { terrainWaterStatsStore } = await import("../../../../src/front/Stores/TerrainEditorStore");

const target = document.body.appendChild(document.createElement("div"));
let component: ReturnType<typeof mount> | undefined;
const render = (rain?: DashboardRain): void => {
    flushSync(() => {
        component = mount(TerrainWaterDashboard, { target, props: { evaporation: 0.2, absorption: 5, rain } });
    });
};
const row = (name: string): HTMLElement => {
    const element = target.querySelector<HTMLElement>(`[data-testid="water-row-${name}"]`);
    if (!element) throw new Error(`No row ${name}`);
    return element;
};
const barWidth = (name: string): number =>
    Number.parseFloat(row(name).querySelector<HTMLElement>('[data-testid="water-bar"]')?.style.width ?? "0");

afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted);
    terrainWaterStatsStore.set(undefined);
});

describe("TerrainWaterDashboard", () => {
    it("says it waits while the server has told nothing", () => {
        render();
        expect(target.textContent).toContain("mapEditor.terrain.dashboard.waiting");
        expect(target.querySelector('[data-testid="water-row-rain"]')).toBeNull();
    });

    it("shows each flow in cubic metres an hour, with its own unit beside, and a bar to compare them", () => {
        render();
        terrainWaterStatsStore.set({
            rain: 12,
            sources: 48,
            sinks: 24,
            evaporation: 0,
            absorption: 6,
            lost: 0,
            stock: 1234.5,
            wetArea: 300,
            rainRate: 2,
        });
        flushSync();
        expect(row("rain").textContent).toContain("12 m³/h");
        expect(row("rain").textContent).toContain("2 mm/h");
        expect(row("sources").textContent).toContain("48 m³/h");
        expect(row("sinks").textContent).toContain("24 m³/h");
        // The settings of the map, beside what they take.
        expect(row("evaporation").textContent).toContain("0.2 mm/h");
        expect(row("absorption").textContent).toContain("5 mm/h");
        expect(row("absorption").textContent).toContain("6 m³/h");
        // The largest flow fills its bar; the others in proportion.
        expect(barWidth("sources")).toBe(100);
        expect(barWidth("rain")).toBe(25);
        expect(barWidth("sinks")).toBe(50);
        expect(barWidth("evaporation")).toBe(0);
        expect(row("stock").textContent).toContain("1 235 m³");
        expect(row("stock").textContent).toContain("300 m²");
    });

    it("tells whether the water of the map rises or falls, and by how much", () => {
        render();
        const stats = {
            rain: 0,
            sources: 0,
            sinks: 0,
            evaporation: 0,
            absorption: 0,
            lost: 0,
            stock: 10,
            wetArea: 5,
            rainRate: 0,
        };
        terrainWaterStatsStore.set({ ...stats, sources: 50, sinks: 20 });
        flushSync();
        expect(row("balance").textContent).toContain("+30 m³/h");
        expect(row("balance").textContent).toContain("mapEditor.terrain.dashboard.rising");
        terrainWaterStatsStore.set({ ...stats, sources: 5, sinks: 20, lost: 3 });
        flushSync();
        expect(row("balance").textContent).toContain("−18 m³/h");
        expect(row("balance").textContent).toContain("mapEditor.terrain.dashboard.falling");
        terrainWaterStatsStore.set(stats);
        flushSync();
        expect(row("balance").textContent).toContain("mapEditor.terrain.dashboard.steady");
    });

    it("keeps small flows readable", () => {
        render();
        terrainWaterStatsStore.set({
            rain: 0.0594,
            sources: 0,
            sinks: 0,
            evaporation: 0.004,
            absorption: 0,
            lost: 0,
            stock: 0.25,
            wetArea: 2.7,
            rainRate: 2,
        });
        flushSync();
        expect(row("rain").textContent).toContain("0.059 m³/h");
        expect(row("evaporation").textContent).toContain("0.004 m³/h");
        expect(row("stock").textContent).toContain("0.25 m³");
    });

    describe("the rain of the map", () => {
        const stats = {
            rain: 0,
            sources: 0,
            sinks: 0,
            evaporation: 0,
            absorption: 0,
            lost: 0,
            stock: 0,
            wetArea: 0,
            rainRate: 0,
        };
        const notes = (): string =>
            target.querySelector('[data-testid="water-rain-notes"]')?.textContent?.replace(/\s+/g, " ").trim() ?? "";

        it("names the place of the map whose rain it counts", () => {
            render({ place: "Lille", manual: false, mapSnows: false });
            terrainWaterStatsStore.set(stats);
            flushSync();
            expect(row("rain").textContent).toContain("mapEditor.terrain.dashboard.rainAt");
            expect(notes()).toBe("");
        });

        it("says the map rain only, without a place", () => {
            render({ manual: false, mapSnows: false });
            terrainWaterStatsStore.set(stats);
            flushSync();
            expect(row("rain").textContent).toContain("mapEditor.terrain.dashboard.rain");
            expect(row("rain").textContent).not.toContain("rainAt");
        });

        it("tells conditions set by hand", () => {
            render({ place: "Lille", manual: true, mapSnows: false });
            terrainWaterStatsStore.set(stats);
            flushSync();
            expect(row("rain").textContent).toContain("mapEditor.terrain.dashboard.rainAt");
            expect(target.querySelector('[data-testid="water-rain-note"]')?.textContent).toContain(
                "mapEditor.terrain.dashboard.manualAir",
            );
        });

        it("tells the rain of the player's own city, which brings no water, and the snow lying on the map", () => {
            render({ place: "Lille", manual: false, mapSnows: true, own: { city: "Hong Kong", snow: false } });
            terrainWaterStatsStore.set(stats);
            flushSync();
            expect(notes()).toContain("mapEditor.terrain.dashboard.snowLies");
            expect(notes()).toContain("mapEditor.terrain.dashboard.ownRain");
            expect(notes()).not.toContain("ownSnow");
        });

        it("tells the snow of the player's own city", () => {
            render({ manual: false, mapSnows: false, own: { city: "Oslo", snow: true } });
            terrainWaterStatsStore.set(stats);
            flushSync();
            expect(notes()).toContain("mapEditor.terrain.dashboard.ownSnow");
            expect(notes()).not.toContain("snowLies");
        });
    });
});
