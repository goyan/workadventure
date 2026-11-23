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
                cold: label("Cold snap"),
                coldSizeLabel: label("Size of the cold snap"),
                coldCelsiusLabel: label("Temperature of the cold snap"),
                coldCelsius: ({ celsius }: { celsius: number }) => `${celsius} °C`,
                coldArmedHelp: label("Hold the click: the air freezes under the pointer"),
                ball: label("Ball"),
                ballSizeLabel: label("Size of the ball: its diameter"),
                ballArmedHelp: label("Hold the click: a solid ball, half in the water under the pointer"),
                chip: label("Disasters"),
                chipArmed: ({ name, size }: { name: string; size: string }) => `${name} · ${size}`,
                chipHint: label("Disasters: pick one"),
                infoLabel: label("How to throw it"),
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
    coldCelsiusStore,
    coldRadiusTilesStore,
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

function render(compact = false): void {
    target = document.createElement("div");
    document.body.append(target);
    component = mount(CatastrophePanel, { target, props: { compact } });
    flushSync();
}

/** Renders the chip and opens its panel, as a click on the chip does. */
function renderOpen(): void {
    render();
    chip()?.click();
    flushSync();
}

function chip(): HTMLButtonElement | null {
    return target.querySelector<HTMLButtonElement>('[data-testid="catastrophe-chip"]');
}

function popover(): HTMLElement | null {
    return target.querySelector('[data-testid="catastrophe-chip-popover"]');
}

function help(): HTMLElement | null {
    return target.querySelector('[data-testid="catastrophe-info-text"]');
}

function pressOutside(): void {
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    flushSync();
}

function escape(): void {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
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
    it("shows the meteor tile and, behind its i, the idle help", () => {
        renderOpen();
        expect(tile()?.getAttribute("aria-pressed")).toBe("false");
        expect(target.textContent).toContain("Comet");
        expect(help()?.textContent).toContain("Pick a disaster");
    });

    it("arms the meteor on click and shows the armed help", () => {
        renderOpen();
        tile()?.click();
        flushSync();
        expect(tile()?.getAttribute("aria-pressed")).toBe("true");
        expect(get(armedCatastropheStore)).toBe("meteor");
        expect(help()?.textContent).toContain("Click on the map · Esc to cancel");
    });

    it("arms the fireball, named Meteor, with the size and the help of the comet", () => {
        renderOpen();
        const fireball = target.querySelector<HTMLButtonElement>('[data-testid="catastrophe-fireball"]');
        expect(fireball?.textContent).toContain("Meteor");
        expect(fireball?.getAttribute("aria-pressed")).toBe("false");
        fireball?.click();
        flushSync();
        expect(fireball?.getAttribute("aria-pressed")).toBe("true");
        expect(tile()?.getAttribute("aria-pressed")).toBe("false");
        expect(get(armedCatastropheStore)).toBe("fireball");
        expect(target.querySelector('[data-testid="catastrophe-meteor-size"]')).not.toBeNull();
        expect(help()?.textContent).toContain("Click on the map · Esc to cancel");
    });

    it("chooses the size of the comet and of the meteor, from 1 to 8 tiles", () => {
        renderOpen();
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
        renderOpen();
        target.querySelector<HTMLElement>('[data-testid="catastrophe-downpour"]')?.click();
        flushSync();
        expect(get(armedCatastropheStore)).toBe("downpour");
        expect(help()?.textContent).toContain("Hold the click on the map · Esc to cancel");
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
        renderOpen();
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
        renderOpen();
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
        expect(help()?.textContent).toContain("Hold the click on the map");
    });

    it("arms the cold snap, and chooses its size from 1 to 16 tiles and its air from -120 to -5 °C", () => {
        renderOpen();
        const cold = target.querySelector<HTMLButtonElement>('[data-testid="catastrophe-cold"]');
        expect(cold?.textContent).toContain("Cold snap");
        cold?.click();
        flushSync();
        expect(cold?.getAttribute("aria-pressed")).toBe("true");
        expect(get(armedCatastropheStore)).toBe("cold");
        const size = target.querySelector<HTMLInputElement>('[data-testid="catastrophe-cold-size"]');
        expect([size?.min, size?.max]).toEqual(["1", "16"]);
        expect(size?.getAttribute("aria-label")).toBe("Size of the cold snap");
        expect(target.textContent).toContain("3 tiles");
        const celsius = target.querySelector<HTMLInputElement>('[data-testid="catastrophe-cold-celsius"]');
        expect([celsius?.min, celsius?.max]).toEqual(["-120", "-5"]);
        expect(celsius?.getAttribute("aria-label")).toBe("Temperature of the cold snap");
        expect(target.textContent).toContain("-80 °C");
        if (!celsius || !size) throw new Error("no slider");
        celsius.value = "-40";
        celsius.dispatchEvent(new Event("input", { bubbles: true }));
        size.value = "9";
        size.dispatchEvent(new Event("input", { bubbles: true }));
        flushSync();
        expect(get(coldCelsiusStore)).toBe(-40);
        expect(get(coldRadiusTilesStore)).toBe(9);
        expect(target.textContent).toContain("-40 °C");
        expect(help()?.textContent).toContain("Hold the click: the air freezes under the pointer");
        coldCelsiusStore.set(-80);
        coldRadiusTilesStore.set(3);
    });

    it("arms the ball, and chooses its diameter from 1 to 16 tiles, with a help that says where its centre is", () => {
        renderOpen();
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
        expect(help()?.textContent).toContain("Hold the click: a solid ball, half in the water under the pointer");
        expect(help()?.textContent).not.toContain("Hold the click on the map");
    });

    it("arms the fire, and chooses the size of its patch from 1 to 8 tiles", () => {
        renderOpen();
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

    it("disarms on Escape first, the panel staying open, and closes it on the next Escape", () => {
        renderOpen();
        tile()?.click();
        flushSync();
        escape();
        expect(get(armedCatastropheStore)).toBeUndefined();
        expect(tile()?.getAttribute("aria-pressed")).toBe("false");
        expect(popover()).not.toBeNull();
        escape();
        expect(popover()).toBeNull();
        expect(chip()?.getAttribute("aria-expanded")).toBe("false");
        expect(document.activeElement).toBe(chip());
    });

    it("disarms on Escape with the panel closed", () => {
        renderOpen();
        tile()?.click();
        flushSync();
        pressOutside();
        escape();
        expect(get(armedCatastropheStore)).toBeUndefined();
    });

    it("is not rendered when the panel is closed, and stays usable while the editor is open", () => {
        render();
        catastrophePanelStore.set(false);
        flushSync();
        expect(chip()).toBeNull();
        catastrophePanelStore.set(true);
        mapEditorModeStore.switchMode(true);
        flushSync();
        tile()?.click();
        flushSync();
        expect(get(armedCatastropheStore)).toBe("meteor");
    });
    it("is a chip on the clock line, its panel closed until the chip is clicked", () => {
        render();
        expect(chip()?.textContent).toContain("Disasters");
        expect(chip()?.getAttribute("aria-expanded")).toBe("false");
        expect(tile()).toBeNull();
        chip()?.click();
        flushSync();
        expect(chip()?.getAttribute("aria-expanded")).toBe("true");
        expect(tile()).not.toBeNull();
        chip()?.click();
        flushSync();
        expect(popover()).toBeNull();
    });

    it("opens its panel when the apps menu shows the chip", () => {
        catastrophePanelStore.set(false);
        render();
        catastrophePanelStore.set(true);
        flushSync();
        expect(popover()).not.toBeNull();
        expect(tile()).not.toBeNull();
    });

    it("closes on a press elsewhere, the disaster staying armed and told on the chip", () => {
        renderOpen();
        target.querySelector<HTMLButtonElement>('[data-testid="catastrophe-ball"]')?.click();
        flushSync();
        pressOutside();
        expect(popover()).toBeNull();
        expect(get(armedCatastropheStore)).toBe("ball");
        expect(chip()?.textContent).toContain("Ball · 4 tiles");
        expect(chip()?.getAttribute("data-active")).toBe("true");
        // Clicked again, the chip opens the panel on the size of the armed disaster.
        chip()?.click();
        flushSync();
        expect(target.querySelector('[data-testid="catastrophe-ball-size"]')).not.toBeNull();
    });

    it("tells a downpour on the whole map on the chip", () => {
        renderOpen();
        target.querySelector<HTMLButtonElement>('[data-testid="catastrophe-downpour"]')?.click();
        downpourWholeMapStore.set(true);
        flushSync();
        expect(chip()?.textContent).toContain("Downpour · Whole map");
        downpourWholeMapStore.set(false);
    });

    it("keeps a press inside its panel from closing it", () => {
        renderOpen();
        tile()?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
        flushSync();
        expect(popover()).not.toBeNull();
    });

    it("draws only its icon when the line is short of room, named for assistive technologies", () => {
        render(true);
        expect(chip()?.getAttribute("aria-label")).toBe("Disasters");
        expect(target.querySelector('[data-testid="catastrophe-chip-label"]')).toBeNull();
        chip()?.click();
        flushSync();
        tile()?.click();
        flushSync();
        expect(chip()?.getAttribute("aria-label")).toBe("Comet · 4 tiles");
        expect(chip()?.textContent).toContain("4");
    });

    it("reaches every control from its panel: the tiles, the sizes, the whole map and the weather tab", () => {
        renderOpen();
        for (const id of ["meteor", "fireball", "downpour", "fire", "drain", "ball"]) {
            expect(target.querySelector(`[data-testid="catastrophe-${id}"]`)).not.toBeNull();
        }
        expect(target.querySelector('[data-testid="catastrophe-info"]')?.getAttribute("aria-label")).toBe(
            "How to throw it",
        );
        expect(target.querySelector('[data-testid="catastrophe-tab-weather"]')).not.toBeNull();
    });
});
