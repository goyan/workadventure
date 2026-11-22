import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { get, readable } from "svelte/store";

vi.mock("../../../../src/i18n/i18n-svelte", () => {
    const label = (text: string) => () => text;
    const LL = readable({
        actionbar: {
            catastrophe: {
                label: label("Disaster"),
                meteor: label("Comet"),
                fireball: label("Meteor"),
                armedHelp: label("Click on the map · Esc to cancel"),
                idleHelp: label("Pick a disaster"),
                size: ({ tiles }: { tiles: number }) => `${tiles} tiles`,
                sizeLabel: label("Size: radius of the crater, in tiles"),
                tabs: { catastrophes: label("Disasters"), weather: label("Weather") },
                downpour: label("Downpour"),
                fire: label("Fire"),
                fireSizeLabel: label("Size of the fire"),
                wholeMap: label("Whole map"),
                downpourSizeLabel: label("Size of the downpour"),
                downpourArmedHelp: label("Hold the click on the map · Esc to cancel"),
                drain: label("Drain"),
                drainSizeLabel: label("Size of the drain"),
                ball: label("Ball"),
                ballSizeLabel: label("Size of the ball: its diameter"),
                ballArmedHelp: label("Hold the click: a solid ball, half in the water under the pointer"),
            },
        },
    });
    return { default: LL, LL };
});

vi.mock("../../../../src/front/Components/Catastrophe/WeatherTab.svelte", async () => ({
    default: ((await import("./WeatherTabStub.svelte")) as { default: unknown }).default,
}));

import CatastrophePanel from "../../../../src/front/Components/Catastrophe/CatastrophePanel.svelte";
import {
    armedCatastropheStore,
    ballDiameterTilesStore,
    fireRadiusTilesStore,
    downpourWholeMapStore,
    drainRadiusTilesStore,
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
        expect(target.textContent).toContain("Comet");
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

    it("arms the fireball, named Meteor, with the size and the help of the comet", () => {
        render();
        const fireball = target.querySelector<HTMLButtonElement>('[data-testid="catastrophe-fireball"]');
        expect(fireball?.textContent).toContain("Meteor");
        expect(fireball?.getAttribute("aria-pressed")).toBe("false");
        fireball?.click();
        flushSync();
        expect(fireball?.getAttribute("aria-pressed")).toBe("true");
        expect(tile()?.getAttribute("aria-pressed")).toBe("false");
        expect(get(armedCatastropheStore)).toBe("fireball");
        expect(target.querySelector('[data-testid="catastrophe-meteor-size"]')).not.toBeNull();
        expect(target.textContent).toContain("Click on the map · Esc to cancel");
    });

    it("chooses the size of the comet and of the meteor, from 1 to 8 tiles", () => {
        render();
        const slider = target.querySelector<HTMLInputElement>('[data-testid="catastrophe-meteor-size"]');
        expect(slider?.min).toBe("1");
        expect(slider?.max).toBe("8");
        expect(target.textContent).toContain("4 tiles");
        if (!slider) throw new Error("no slider");
        slider.value = "7";
        slider.dispatchEvent(new Event("input", { bubbles: true }));
        flushSync();
        expect(get(meteorRadiusTilesStore)).toBe(7);
        expect(target.textContent).toContain("7 tiles");
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

    it("arms the drain, and chooses the size of its disc from 1 to 16 tiles, with the help of a held click", () => {
        render();
        const drain = target.querySelector<HTMLButtonElement>('[data-testid="catastrophe-drain"]');
        drain?.click();
        flushSync();
        expect(drain?.getAttribute("aria-pressed")).toBe("true");
        expect(get(armedCatastropheStore)).toBe("drain");
        const slider = target.querySelector<HTMLInputElement>('[data-testid="catastrophe-drain-size"]');
        expect(slider?.min).toBe("1");
        expect(slider?.max).toBe("16");
        expect(target.textContent).toContain("3 tiles");
        if (!slider) throw new Error("no slider");
        slider.value = "10";
        slider.dispatchEvent(new Event("input", { bubbles: true }));
        flushSync();
        expect(get(drainRadiusTilesStore)).toBe(10);
        expect(target.textContent).toContain("10 tiles");
        drainRadiusTilesStore.set(3);
        expect(target.textContent).toContain("Hold the click on the map");
    });

    it("arms the ball, and chooses its diameter from 1 to 16 tiles, with a help that says where its centre is", () => {
        render();
        const ball = target.querySelector<HTMLButtonElement>('[data-testid="catastrophe-ball"]');
        expect(ball?.textContent).toContain("Ball");
        ball?.click();
        flushSync();
        expect(ball?.getAttribute("aria-pressed")).toBe("true");
        expect(get(armedCatastropheStore)).toBe("ball");
        const slider = target.querySelector<HTMLInputElement>('[data-testid="catastrophe-ball-size"]');
        expect(slider?.min).toBe("1");
        expect(slider?.max).toBe("16");
        expect(slider?.getAttribute("aria-label")).toBe("Size of the ball: its diameter");
        expect(target.textContent).toContain("4 tiles");
        if (!slider) throw new Error("no slider");
        slider.value = "9";
        slider.dispatchEvent(new Event("input", { bubbles: true }));
        flushSync();
        expect(get(ballDiameterTilesStore)).toBe(9);
        expect(target.textContent).toContain("9 tiles");
        ballDiameterTilesStore.set(4);
        expect(target.textContent).toContain("Hold the click: a solid ball, half in the water under the pointer");
        expect(target.textContent).not.toContain("Hold the click on the map");
    });

    it("arms the fire, and chooses the size of its patch from 1 to 8 tiles", () => {
        render();
        const fire = target.querySelector<HTMLButtonElement>('[data-testid="catastrophe-fire"]');
        fire?.click();
        flushSync();
        expect(fire?.getAttribute("aria-pressed")).toBe("true");
        expect(get(armedCatastropheStore)).toBe("fire");
        const slider = target.querySelector<HTMLInputElement>('[data-testid="catastrophe-fire-size"]');
        expect(slider?.min).toBe("1");
        expect(slider?.max).toBe("8");
        expect(target.textContent).toContain("2 tiles");
        if (!slider) throw new Error("no slider");
        slider.value = "6";
        slider.dispatchEvent(new Event("input", { bubbles: true }));
        flushSync();
        expect(get(fireRadiusTilesStore)).toBe(6);
        fireRadiusTilesStore.set(2);
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

    it("is not rendered when the panel is closed, and stays usable while the editor is open", () => {
        render();
        catastrophePanelStore.set(false);
        flushSync();
        expect(tile()).toBeNull();
        catastrophePanelStore.set(true);
        mapEditorModeStore.switchMode(true);
        flushSync();
        tile()?.click();
        flushSync();
        expect(get(armedCatastropheStore)).toBe("meteor");
    });
});
