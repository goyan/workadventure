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
                downpour: label("Downpour"),
                wholeMap: label("Whole map"),
                downpourSizeLabel: label("Size of the downpour"),
                downpourArmedHelp: label("Hold the click on the map · Esc to cancel"),
            },
        },
    });
    return { default: LL, LL };
});

import CatastrophePanel from "../../../../src/front/Components/Catastrophe/CatastrophePanel.svelte";
import {
    armedCatastropheStore,
    downpourWholeMapStore,
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

    it("arms the downpour, shows its size from 1 to 16 tiles, and hides it for the whole map", () => {
        render();
        target.querySelector<HTMLElement>('[data-testid="catastrophe-downpour"]')?.click();
        flushSync();
        expect(get(armedCatastropheStore)).toBe("downpour");
        expect(target.textContent).toContain("Hold the click on the map · Esc to cancel");
        const slider = target.querySelector<HTMLInputElement>('[data-testid="catastrophe-downpour-size"]');
        expect(slider?.min).toBe("1");
        expect(slider?.max).toBe("16");
        expect(target.querySelector('[data-testid="catastrophe-meteor-size"]')).toBeNull();

        const wholeMap = target.querySelector<HTMLInputElement>('[data-testid="catastrophe-downpour-whole-map"]');
        wholeMap?.click();
        flushSync();
        expect(get(downpourWholeMapStore)).toBe(true);
        expect(target.querySelector('[data-testid="catastrophe-downpour-size"]')).toBeNull();
        downpourWholeMapStore.set(false);
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
