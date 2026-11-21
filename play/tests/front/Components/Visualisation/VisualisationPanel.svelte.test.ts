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
                masses: label("On each body of water"),
                totals: ({ stock, area }: { stock: string; area: string }) => `${stock} m3, ${area} m2`,
                noWater: label("No water told yet"),
                estimated: label("Estimated"),
                measured: label("Measured"),
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

import VisualisationPanel from "../../../../src/front/Components/Visualisation/VisualisationPanel.svelte";
import { terrainWaterStatsStore } from "../../../../src/front/Stores/TerrainEditorStore";
import {
    visualisationPanelStore,
    waterFlowMeasuredStore,
    waterFlowOverlayStore,
    weatherExplainedStore,
} from "../../../../src/front/Stores/VisualisationStore";

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
    it("shows nothing until the panel is opened", () => {
        expect(find("visualisation-widget")).toBeNull();
        visualisationPanelStore.set(true);
        flushSync();
        expect(find("visualisation-water-flow")?.getAttribute("aria-pressed")).toBe("false");
        expect(find("visualisation-water-flow-legend")).toBeNull();
    });

    it("turns the flows of the water on and off, with their legend", () => {
        visualisationPanelStore.set(true);
        flushSync();
        find("visualisation-water-flow")?.click();
        flushSync();
        expect(get(waterFlowOverlayStore)).toBe(true);
        expect(find("visualisation-water-flow")?.getAttribute("aria-pressed")).toBe("true");
        expect(find("visualisation-water-flow-legend")?.textContent).toContain("Speed");
        find("visualisation-water-flow")?.click();
        flushSync();
        expect(get(waterFlowOverlayStore)).toBe(false);
        expect(find("visualisation-water-flow-legend")).toBeNull();
    });

    it("keeps the flows drawn when the panel is closed", () => {
        visualisationPanelStore.set(true);
        waterFlowOverlayStore.set(true);
        flushSync();
        visualisationPanelStore.set(false);
        flushSync();
        expect(find("visualisation-widget")).toBeNull();
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

    it("opens and closes the weather board, which is not mounted while closed", () => {
        visualisationPanelStore.set(true);
        flushSync();
        expect(find("weather-board-live")).toBeNull();
        expect(find("visualisation-weather-explained")?.getAttribute("aria-pressed")).toBe("false");
        find("visualisation-weather-explained")?.click();
        flushSync();
        expect(get(weatherExplainedStore)).toBe(true);
        expect(find("visualisation-weather-explained")?.getAttribute("aria-pressed")).toBe("true");
        expect(find("weather-board-live")).not.toBeNull();
        // The flows of the water are another thing to show: untouched.
        expect(get(waterFlowOverlayStore)).toBe(false);
        find("visualisation-weather-explained")?.click();
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
});
