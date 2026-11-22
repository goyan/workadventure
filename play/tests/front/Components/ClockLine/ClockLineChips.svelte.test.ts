import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { get } from "svelte/store";
import { loadLocale } from "../../../../src/i18n/i18n-util.sync";
import { setLocale } from "../../../../src/i18n/i18n-svelte";

vi.mock("../../../../src/front/Components/Catastrophe/WeatherTab.svelte", async () => ({
    default: ((await import("../Catastrophe/WeatherTabStub.svelte")) as { default: unknown }).default,
}));

import ClockLineChips from "../../../../src/front/Components/ClockLine/ClockLineChips.svelte";
import {
    armedCatastropheStore,
    catastrophePanelStore,
    toggleArmedCatastrophe,
} from "../../../../src/front/Stores/CatastropheStore";
import { visualisationPanelStore } from "../../../../src/front/Stores/VisualisationStore";

let target: HTMLElement;
let component: ReturnType<typeof mount> | undefined;
const find = (id: string): HTMLElement | null => target.querySelector<HTMLElement>(`[data-testid="${id}"]`);

beforeAll(() => {
    loadLocale("fr-FR");
    setLocale("fr-FR");
});

function render(): void {
    // As on the clock line: the chips are its last item.
    target = document.createElement("div");
    target.dataset.testid = "clock-line";
    document.body.append(target);
    component = mount(ClockLineChips, { target });
    flushSync();
}

afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted);
    target.remove();
    catastrophePanelStore.set(false);
    visualisationPanelStore.set(false);
});

describe("ClockLineChips", () => {
    it("takes no room while neither panel is shown from the apps menu", () => {
        render();
        expect(find("clock-line-chips")?.classList.contains("hidden")).toBe(true);
        expect(find("catastrophe-chip")).toBeNull();
        expect(find("visualisation-chip")).toBeNull();
    });

    it("opens the panel of the first chip shown from the apps menu, as of the next one", () => {
        render();
        catastrophePanelStore.set(true);
        flushSync();
        expect(find("clock-line-chips")?.classList.contains("hidden")).toBe(false);
        expect(find("catastrophe-chip-popover")).not.toBeNull();
        visualisationPanelStore.set(true);
        flushSync();
        expect(find("visualisation-chip-popover")).not.toBeNull();
    });

    it("opens the panel of the visualisation shown first from the apps menu", () => {
        render();
        visualisationPanelStore.set(true);
        flushSync();
        expect(find("visualisation-chip-popover")).not.toBeNull();
    });

    it("takes Escape once: it disarms the disaster, the visualisation panel staying open", () => {
        render();
        catastrophePanelStore.set(true);
        flushSync();
        toggleArmedCatastrophe("ball");
        visualisationPanelStore.set(true);
        flushSync();
        expect(find("visualisation-chip-popover")).not.toBeNull();
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
        flushSync();
        expect(get(armedCatastropheStore)).toBeUndefined();
        expect(find("visualisation-chip-popover")).not.toBeNull();
    });

    it("shows each chip on the same condition as the row it replaces: its entry of the apps menu", () => {
        render();
        catastrophePanelStore.set(true);
        flushSync();
        expect(find("catastrophe-chip")).not.toBeNull();
        expect(find("visualisation-chip")).toBeNull();
        visualisationPanelStore.set(true);
        flushSync();
        expect(find("visualisation-chip")).not.toBeNull();
        catastrophePanelStore.set(false);
        flushSync();
        expect(find("catastrophe-chip")).toBeNull();
        expect(find("visualisation-chip")).not.toBeNull();
    });

    it("keeps the labels of the chips while it has not measured the line short of room", () => {
        catastrophePanelStore.set(true);
        render();
        expect(find("clock-line-chips")?.dataset.fold).toBe("labels");
        expect(find("catastrophe-chip-label")?.textContent).toBe("Catastrophes");
    });
});
