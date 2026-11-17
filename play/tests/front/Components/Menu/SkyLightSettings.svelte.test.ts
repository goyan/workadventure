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
                    advanced: label("Advanced settings"),
                    casters: {
                        title: label("What casts a shadow"),
                        walls: label("Walls"),
                        objects: label("Objects"),
                        trees: label("Trees"),
                        details: label("Details"),
                        avatars: label("Avatars"),
                        animals: label("Animals"),
                        shape: { label: label("Shape"), oval: label("Oval"), realistic: label("True shape") },
                    },
                },
            },
        },
    });
    return { LL, default: LL };
});

const {
    moonLightShownStore,
    moonPhaseCurveStore,
    skyShadowCategoriesStore,
    skyShadowCategoryStores,
    skyShadowShapeStores,
    sunLightShownStore,
} = await import("../../../../src/front/Stores/SkyLightStore");
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
    for (const store of Object.values(skyShadowCategoryStores)) store.set(true);
    skyShadowShapeStores.trees.set("oval");
    skyShadowShapeStores.avatars.set("realistic");
    skyShadowShapeStores.animals.set("oval");
});

describe("SkyLightSettings", () => {
    it("shows the limits of each body that is on, and the phase curve with the moon", () => {
        render();
        expect(target.querySelector('[data-testid="sky-sun-limits"]')).not.toBeNull();
        expect(target.querySelector('[data-testid="sky-moon-limits"]')).not.toBeNull();
        expect(target.querySelector('[data-testid="sky-moon-phase-curve"]')).not.toBeNull();
        expect(target.querySelectorAll('[data-testid="sky-sun-limits"] input[type="range"]')).toHaveLength(6);
    });

    it("folds the limits of each body behind its own closed « advanced settings »", () => {
        render();
        for (const body of ["sun", "moon"]) {
            const details = target.querySelector(`[data-testid="sky-${body}-limits"]`)?.closest("details");
            expect(details).not.toBeNull();
            expect(details?.open).toBe(false);
            expect(details?.querySelector("summary")?.textContent?.trim()).toBe("Advanced settings");
        }
        // The choice of the phase curve stays in sight.
        expect(target.querySelector('[data-testid="sky-moon-phase-curve"]')?.closest("details")).toBeNull();
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

    it("lists what casts a shadow, each kind with its switch, folded and closed", () => {
        render();
        const categories = target.querySelector<HTMLDetailsElement>('[data-testid="sky-shadow-categories"]');
        expect(categories?.open).toBe(false);
        expect(categories?.querySelectorAll('input[type="checkbox"]')).toHaveLength(6);
        expect(get(skyShadowCategoriesStore)).toMatchObject({
            walls: true,
            objects: true,
            trees: true,
            details: true,
            avatars: true,
            animals: true,
        });
    });

    it("offers an oval or the true shape for the trees, the avatars and the animals: ovals but for the avatars", () => {
        render();
        for (const kind of ["trees", "avatars", "animals"]) {
            expect(target.querySelector(`[data-testid="sky-shadow-${kind}-shape"]`)).not.toBeNull();
        }
        expect(get(skyShadowCategoriesStore)).toMatchObject({
            treeShape: "oval",
            avatarShape: "realistic",
            animalShape: "oval",
        });
        const trees = target.querySelector('[data-testid="sky-shadow-trees-shape"]');
        const trueShape = Array.from(trees?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []).find(
            (button) => button.textContent?.trim() === "True shape",
        );
        trueShape?.click();
        flushSync();
        expect(get(skyShadowCategoriesStore).treeShape).toBe("realistic");
    });

    it("hides the shape of a kind turned off, and the whole list with both bodies off", () => {
        skyShadowCategoryStores.trees.set(false);
        render();
        expect(target.querySelector('[data-testid="sky-shadow-trees-shape"]')).toBeNull();
        expect(target.querySelector('[data-testid="sky-shadow-avatars-shape"]')).not.toBeNull();
        sunLightShownStore.set(false);
        moonLightShownStore.set(false);
        flushSync();
        expect(target.querySelector('[data-testid="sky-shadow-categories"]')).toBeNull();
    });
});
