import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { get, readable } from "svelte/store";

vi.mock("../../../../src/i18n/i18n-svelte", () => {
    const label = (text: string) => () => text;
    const LL = readable({
        actionbar: {
            catastrophe: {
                label: label("Disaster"),
                meteor: label("Meteor"),
                armedHelp: label("Click on the map · Esc to cancel"),
                idleHelp: label("Pick a disaster"),
                size: ({ tiles }: { tiles: number }) => `${tiles} tiles`,
                sizeLabel: label("Size of the meteor: radius of its crater, in tiles"),
                tabs: { catastrophes: label("Disasters"), weather: label("Weather") },
            },
        },
    });
    return { default: LL, LL };
});

vi.mock("../../../../src/front/Components/Catastrophe/WeatherTab.svelte", async () => ({
    default: (await import("./WeatherTabStub.svelte")).default,
}));

import CatastrophePanel from "../../../../src/front/Components/Catastrophe/CatastrophePanel.svelte";
import {
    armedCatastropheStore,
    meteorRadiusTilesStore,
    catastrophePanelStore,
    disarmCatastrophe,
} from "../../../../src/front/Stores/CatastropheStore";
import { mapEditorModeStore } from "../../../../src/front/Stores/MapEditorStore";

let target: HTMLElement;
let component: ReturnType<typeof mount> | undefined;

function render(): void {
    target = document.createElement("div");
    document.body.append(target);
    component = mount(CatastrophePanel, { target });
    flushSync();
}

function tile(): HTMLElement | null {
    return target.querySelector('[data-testid="catastrophe-meteor"]');
}

beforeEach(() => {
    mapEditorModeStore.switchMode(false);
    catastrophePanelStore.set(true);
    disarmCatastrophe();
});

afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted);
    target.remove();
    catastrophePanelStore.set(false);
});

describe("CatastrophePanel", () => {
    it("shows the meteor tile and the idle help", () => {
        render();
        expect(tile()?.getAttribute("aria-pressed")).toBe("false");
        expect(target.textContent).toContain("Meteor");
        expect(target.textContent).toContain("Pick a disaster");
    });

    it("arms the meteor on click and shows the armed help", () => {
        render();
        tile()?.click();
        flushSync();
        expect(tile()?.getAttribute("aria-pressed")).toBe("true");
        expect(get(armedCatastropheStore)).toBe("meteor");
        expect(target.textContent).toContain("Click on the map · Esc to cancel");
    });

    it("chooses the size of the meteor, from 2 to 24 tiles", () => {
        render();
        const slider = target.querySelector<HTMLInputElement>('[data-testid="catastrophe-meteor-size"]');
        expect(slider?.min).toBe("2");
        expect(slider?.max).toBe("24");
        expect(target.textContent).toContain("4 tiles");
        if (!slider) throw new Error("no slider");
        slider.value = "12";
        slider.dispatchEvent(new Event("input", { bubbles: true }));
        flushSync();
        expect(get(meteorRadiusTilesStore)).toBe(12);
        expect(target.textContent).toContain("12 tiles");
        meteorRadiusTilesStore.set(4);
    });

    it("has a weather tab, and nothing stays armed behind it", () => {
        render();
        tile()?.click();
        flushSync();
        target.querySelector<HTMLButtonElement>('[data-testid="catastrophe-tab-weather"]')?.click();
        flushSync();
        expect(get(armedCatastropheStore)).toBeUndefined();
        expect(target.querySelector('[data-testid="weather-tab-stub"]')).not.toBeNull();
        expect(tile()).toBeNull();
        target.querySelector<HTMLButtonElement>('[data-testid="catastrophe-tab-catastrophes"]')?.click();
        flushSync();
        expect(tile()).not.toBeNull();
    });

    it("disarms on Escape", () => {
        render();
        tile()?.click();
        flushSync();
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        flushSync();
        expect(get(armedCatastropheStore)).toBeUndefined();
        expect(tile()?.getAttribute("aria-pressed")).toBe("false");
    });

    it("is not rendered when the panel is closed or the editor is open", () => {
        render();
        catastrophePanelStore.set(false);
        flushSync();
        expect(tile()).toBeNull();
        catastrophePanelStore.set(true);
        mapEditorModeStore.switchMode(true);
        flushSync();
        expect(tile()).toBeNull();
    });
});
