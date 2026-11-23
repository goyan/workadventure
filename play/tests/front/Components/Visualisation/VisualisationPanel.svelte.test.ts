import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { get, readable } from "svelte/store";

vi.mock("../../../../src/i18n/i18n-svelte", () => {
    const label = (text: string) => () => text;
    const LL = readable({
        actionbar: {
            visualisation: {
                label: label("Visualisation"),
                waterFlow: label("Water flows"),
                onHelp: label("Shown on the map"),
                offHelp: label("Choose what to show"),
                speed: label("Speed"),
                rising: label("Rising"),
                falling: label("Falling"),
                trend: label("Over a few seconds"),
                masses: label("On each body of water"),
                realTime: label("Per real minute"),
                totals: ({ stock, area }: { stock: string; area: string }) => `${stock} m3, ${area} m2`,
                noWater: label("No water told yet"),
                estimated: label("Estimated"),
                measured: ({ slowest }: { slowest: string }) => `Measured, told from ${slowest} m/s`,
                weather: { button: label("Weather explained") },
            },
        },
    });
    return { default: LL, LL };
});

vi.mock("../../../../src/front/Components/Visualisation/WeatherBoardLive.svelte", async () => {
    const mod = (await import("./WeatherBoardLiveStub.svelte")) as { default: unknown };
    return { default: mod.default };
});

vi.mock("../../../../src/front/Components/Visualisation/WeatherPipette.svelte", async () => {
    const mod = (await import("./WeatherPipetteStub.svelte")) as { default: unknown };
    return { default: mod.default };
});

import VisualisationPanel from "../../../../src/front/Components/Visualisation/VisualisationPanel.svelte";
import { explainCell } from "../../../../src/front/Phaser/Game/Weather/CellExplained";
import type { CellInput } from "../../../../src/front/Phaser/Game/Weather/CellExplained";
import { terrainWaterStatsStore } from "../../../../src/front/Stores/TerrainEditorStore";
import {
    visualisationPanelStore,
    waterFlowMeasuredStore,
    waterFlowOverlayStore,
    weatherExplainedStore,
    weatherPipetteCellStore,
    weatherPipetteStore,
} from "../../../../src/front/Stores/VisualisationStore";

const DRY_CELL: CellInput = {
    city: undefined,
    ground: "map",
    outdoor: true,
    reading: { ground: 0 },
    depthPx: 0,
    deep: false,
    current: undefined,
    hold: "none",
    kept: undefined,
    own: { snowMm: 0, frost: 0 },
    weather: undefined,
    snowing: false,
    times: 1,
    soilFrost: 0,
    sunElevation: undefined,
};

let target: HTMLElement;
let component: ReturnType<typeof mount> | undefined;
const find = (id: string): HTMLElement | null => target.querySelector<HTMLElement>(`[data-testid="${id}"]`);

beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
    component = mount(VisualisationPanel, { target });
    flushSync();
});

afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted);
    target.remove();
    visualisationPanelStore.set(false);
    waterFlowOverlayStore.set(false);
    weatherExplainedStore.set(false);
    terrainWaterStatsStore.set(undefined);
});

describe("VisualisationPanel", () => {
    it("shows nothing until the panel is opened, nor with nothing shown on the map", () => {
        waterFlowOverlayStore.set(true);
        flushSync();
        expect(find("visualisation-water-flow-legend")).toBeNull();
        visualisationPanelStore.set(true);
        waterFlowOverlayStore.set(false);
        flushSync();
        expect(find("visualisation-water-flow-legend")).toBeNull();
        expect(find("weather-board-live")).toBeNull();
    });

    it("shows the legend of the flows of the water while they are drawn", () => {
        visualisationPanelStore.set(true);
        waterFlowOverlayStore.set(true);
        flushSync();
        expect(find("visualisation-water-flow-legend")?.textContent).toContain("Speed");
        expect(find("visualisation-water-flow-legend")?.textContent).toContain("Over a few seconds");
        expect(find("visualisation-water-flow-legend")?.textContent).toContain("Per real minute");
        waterFlowOverlayStore.set(false);
        flushSync();
        expect(find("visualisation-water-flow-legend")).toBeNull();
    });

    it("keeps the flows drawn when the panel is closed", () => {
        visualisationPanelStore.set(true);
        waterFlowOverlayStore.set(true);
        flushSync();
        visualisationPanelStore.set(false);
        flushSync();
        expect(find("visualisation-water-flow-legend")).toBeNull();
        expect(get(waterFlowOverlayStore)).toBe(true);
    });

    it("says whether the speeds are those of the server or guessed from the slope", () => {
        visualisationPanelStore.set(true);
        waterFlowOverlayStore.set(true);
        flushSync();
        expect(find("visualisation-water-speeds")?.textContent).toContain("Estimated");
        waterFlowMeasuredStore.set(true);
        flushSync();
        expect(find("visualisation-water-speeds")?.textContent).toContain("Measured");
        // The server tells the speed of the water from a centimetre a second: slower, no arrow.
        expect(find("visualisation-water-speeds")?.textContent).toMatch(/told from 0[.,]01 m\/s/);
        waterFlowMeasuredStore.set(false);
    });

    it("tells the water of the whole map once the server said it", () => {
        visualisationPanelStore.set(true);
        waterFlowOverlayStore.set(true);
        flushSync();
        expect(find("visualisation-water-none")).not.toBeNull();
        terrainWaterStatsStore.set({
            rain: 0,
            sources: 0,
            sinks: 0,
            evaporation: 0,
            absorption: 0,
            lost: 0,
            stock: 1234,
            wetArea: 567,
            rainRate: 0,
        });
        flushSync();
        const totals = find("visualisation-water-totals")?.textContent ?? "";
        // Whatever the thousands separator of the place the test runs in.
        expect(totals.replace(/[^0-9m]/g, "")).toBe("1234m3567m2");
    });

    it("shows the weather board while it is open, and does not mount it while closed", () => {
        visualisationPanelStore.set(true);
        flushSync();
        expect(find("weather-board-live")).toBeNull();
        weatherExplainedStore.set(true);
        flushSync();
        expect(find("weather-board-live")).not.toBeNull();
        weatherExplainedStore.set(false);
        flushSync();
        expect(find("weather-board-live")).toBeNull();
    });

    it("hides the weather board with the panel", () => {
        visualisationPanelStore.set(true);
        weatherExplainedStore.set(true);
        flushSync();
        expect(find("weather-board-live")).not.toBeNull();
        visualisationPanelStore.set(false);
        flushSync();
        expect(find("weather-board-live")).toBeNull();
    });

    it("shows the pipette only while it is on, with the cell the game read under the pointer", () => {
        visualisationPanelStore.set(true);
        flushSync();
        expect(find("weather-pipette")).toBeNull();
        weatherPipetteStore.set(true);
        flushSync();
        expect(find("weather-pipette")?.getAttribute("data-cell")).toBe("none");
        weatherPipetteCellStore.set(explainCell(DRY_CELL));
        flushSync();
        expect(find("weather-pipette")?.getAttribute("data-cell")).toBe("read");
        weatherPipetteStore.set(false);
        flushSync();
        expect(find("weather-pipette")).toBeNull();
        weatherPipetteCellStore.set(undefined);
    });
});
