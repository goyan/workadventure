import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { get, readable } from "svelte/store";

vi.mock("../../../../src/i18n/i18n-svelte", () => {
    const label = (text: string) => () => text;
    const LL = readable({
        menu: {
            settings: {
                skyLight: {
                    sun: label("Sun"),
                    moon: label("Moon"),
                    phaseCurve: { label: label("Curve"), linear: label("Linear"), realistic: label("Realistic") },
                    intensityMin: label("Intensity min"),
                    intensityMax: label("Intensity max"),
                    colorMin: label("Colour min"),
                    colorMax: label("Colour max"),
                    shadowMin: label("Shadow min"),
                    shadowMax: label("Shadow max"),
                    tiles: label("tiles"),
                },
            },
        },
    });
    return { LL, default: LL };
});

const { moonLightShownStore, moonPhaseCurveStore, sunLightShownStore } =
    await import("../../../../src/front/Stores/SkyLightStore");
const { default: SkyLightSettings } = await import("../../../../src/front/Components/Menu/SkyLightSettings.svelte");

let component: ReturnType<typeof mount> | undefined;
let target: HTMLElement;

function render(): void {
    target = document.createElement("div");
    document.body.append(target);
    component = mount(SkyLightSettings, { target });
    flushSync();
}

afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted);
    target?.remove();
    sunLightShownStore.set(true);
    moonLightShownStore.set(true);
    moonPhaseCurveStore.set("realistic");
});

describe("SkyLightSettings", () => {
    it("shows the limits of each body that is on, and the phase curve with the moon", () => {
        render();
        expect(target.querySelector('[data-testid="sky-sun-limits"]')).not.toBeNull();
        expect(target.querySelector('[data-testid="sky-moon-limits"]')).not.toBeNull();
        expect(target.querySelector('[data-testid="sky-moon-phase-curve"]')).not.toBeNull();
        expect(target.querySelectorAll('[data-testid="sky-sun-limits"] input[type="range"]')).toHaveLength(6);
    });

    it("hides the settings of a body turned off, and keeps the other's", () => {
        moonLightShownStore.set(false);
        render();
        expect(target.querySelector('[data-testid="sky-moon-limits"]')).toBeNull();
        expect(target.querySelector('[data-testid="sky-moon-phase-curve"]')).toBeNull();
        expect(target.querySelector('[data-testid="sky-sun-limits"]')).not.toBeNull();
    });

    it("chooses the linear curve", () => {
        render();
        const linear = Array.from(target.querySelectorAll<HTMLButtonElement>('[role="radio"]')).find(
            (button) => button.textContent?.trim() === "Linear",
        );
        linear?.click();
        flushSync();
        expect(get(moonPhaseCurveStore)).toBe("linear");
    });
});
