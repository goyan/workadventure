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
                chipShown: ({ count }: { count: number }) => `${count} shown`,
                chipHint: label("Visualisation: what to show"),
                infoLabel: label("What is shown"),
                weather: { button: label("Weather explained") },
            },
        },
    });
    return { default: LL, LL };
});

import VisualisationChip from "../../../../src/front/Components/Visualisation/VisualisationChip.svelte";
import {
    visualisationPanelStore,
    waterFlowOverlayStore,
    weatherExplainedStore,
} from "../../../../src/front/Stores/VisualisationStore";

let target: HTMLElement;
let component: ReturnType<typeof mount> | undefined;
const find = (id: string): HTMLElement | null => target.querySelector<HTMLElement>(`[data-testid="${id}"]`);

function render(compact = false): void {
    target = document.createElement("div");
    document.body.appendChild(target);
    component = mount(VisualisationChip, { target, props: { compact } });
    flushSync();
}

function openChip(): void {
    find("visualisation-chip")?.click();
    flushSync();
}

beforeEach(() => {
    visualisationPanelStore.set(true);
});

afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted);
    target.remove();
    visualisationPanelStore.set(false);
    waterFlowOverlayStore.set(false);
    weatherExplainedStore.set(false);
});

describe("VisualisationChip", () => {
    it("shows nothing until the apps menu shows the panel", () => {
        visualisationPanelStore.set(false);
        render();
        expect(find("visualisation-chip")).toBeNull();
    });

    it("opens its tiles in a panel under the chip, closed until then", () => {
        render();
        expect(find("visualisation-chip")?.textContent).toContain("Visualisation");
        expect(find("visualisation-water-flow")).toBeNull();
        openChip();
        expect(find("visualisation-chip")?.getAttribute("aria-expanded")).toBe("true");
        expect(find("visualisation-water-flow")?.getAttribute("aria-pressed")).toBe("false");
        expect(find("visualisation-weather-explained")?.getAttribute("aria-pressed")).toBe("false");
    });

    it("opens its panel when the apps menu shows the chip", () => {
        visualisationPanelStore.set(false);
        render();
        visualisationPanelStore.set(true);
        flushSync();
        expect(find("visualisation-water-flow")).not.toBeNull();
    });

    it("turns the flows of the water on and off, and tells them on the chip", () => {
        render();
        openChip();
        find("visualisation-water-flow")?.click();
        flushSync();
        expect(get(waterFlowOverlayStore)).toBe(true);
        expect(find("visualisation-water-flow")?.getAttribute("aria-pressed")).toBe("true");
        expect(find("visualisation-chip")?.textContent).toContain("Water flows");
        expect(find("visualisation-chip")?.getAttribute("data-active")).toBe("true");
        find("visualisation-water-flow")?.click();
        flushSync();
        expect(get(waterFlowOverlayStore)).toBe(false);
        expect(find("visualisation-chip")?.getAttribute("data-active")).toBe("false");
    });

    it("opens the weather board, the flows untouched, and counts what is shown", () => {
        render();
        openChip();
        find("visualisation-weather-explained")?.click();
        flushSync();
        expect(get(weatherExplainedStore)).toBe(true);
        expect(get(waterFlowOverlayStore)).toBe(false);
        expect(find("visualisation-chip")?.textContent).toContain("Weather explained");
        find("visualisation-water-flow")?.click();
        flushSync();
        expect(find("visualisation-chip")?.textContent).toContain("2 shown");
    });

    it("closes on Escape, the focus back on the chip, and on a press elsewhere, what is shown staying", () => {
        render();
        openChip();
        find("visualisation-water-flow")?.click();
        flushSync();
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        flushSync();
        expect(find("visualisation-chip-popover")).toBeNull();
        expect(document.activeElement).toBe(find("visualisation-chip"));
        expect(get(waterFlowOverlayStore)).toBe(true);
        openChip();
        document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
        flushSync();
        expect(find("visualisation-chip-popover")).toBeNull();
        expect(get(waterFlowOverlayStore)).toBe(true);
    });

    it("tells what to do behind an i, and what is shown once something is", () => {
        render();
        openChip();
        expect(find("visualisation-info")?.getAttribute("aria-label")).toBe("What is shown");
        expect(find("visualisation-info-text")?.textContent).toContain("Choose what to show");
        find("visualisation-water-flow")?.click();
        flushSync();
        expect(find("visualisation-info-text")?.textContent).toContain("Shown on the map");
    });

    it("draws only its icon when the line is short of room, named for assistive technologies", () => {
        render(true);
        expect(find("visualisation-chip")?.getAttribute("aria-label")).toBe("Visualisation");
        expect(find("visualisation-chip-label")).toBeNull();
    });
});
