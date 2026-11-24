import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";

vi.mock("../../../../src/i18n/i18n-svelte", async (importOriginal) => {
    const { readable } = await import("svelte/store");
    // Any translation renders as its key and its arguments.
    const translations = (path: string[]): unknown =>
        new Proxy(() => undefined, {
            get: (_target, name) => translations([...path, String(name)]),
            apply: (_target, _this, args: unknown[]) =>
                [path.join("."), ...args.map((arg) => JSON.stringify(arg))].join(" "),
        });
    const LL = readable(translations([]));
    return { ...(await importOriginal<Record<string, unknown>>()), LL, default: LL };
});
const executeUpdateWAMSettings = vi.fn((_message: unknown) => Promise.resolve());
vi.mock("../../../../src/front/Phaser/Game/MapEditor/Commands/Facades", () => ({ executeUpdateWAMSettings }));

const { default: LifeSettings } = await import("../../../../src/front/Components/MapEditor/LifeSettings.svelte");

const target = document.body.appendChild(document.createElement("div"));
let component: ReturnType<typeof mount> | undefined;
const render = (enabled: boolean, maxLifespan = 900): void => {
    flushSync(() => {
        component = mount(LifeSettings, {
            target,
            props: {
                initial: {
                    enabled,
                    reproductionDelay: 120,
                    maxLifespan,
                    maxSpeed: 1.5,
                    huntInterval: 60,
                    dolphinReproductionDelay: 300,
                    dolphinMaxLifespan: 3600,
                    drinkInterval: 300,
                },
            },
        });
    });
};
const find = (testId: string): HTMLElement | null => target.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
const sliders = [
    "life-reproduction-delay",
    "life-max-lifespan",
    "life-max-speed",
    "life-hunt-interval",
    "life-dolphin-reproduction-delay",
    "life-dolphin-max-lifespan",
];

afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted);
    executeUpdateWAMSettings.mockClear();
});

describe("LifeSettings", () => {
    it("shows only the switch while the life of the map is off", () => {
        render(false);
        expect(find("life-enabled")).not.toBeNull();
        for (const slider of sliders) expect(find(slider)).toBeNull();
    });

    it("shows its four settings once it is on, each with the value the map holds", () => {
        render(true);
        for (const slider of sliders) expect(find(slider)).not.toBeNull();
        expect(find("life-reproduction-delay")?.textContent).toContain("2 min");
        expect(find("life-max-lifespan")?.textContent).toContain("15 min");
        expect(find("life-hunt-interval")?.textContent).toContain("1 min");
        expect(find("life-dolphin-reproduction-delay")?.textContent).toContain("5 min");
        expect(find("life-dolphin-max-lifespan")?.textContent).toContain("1 h");
    });

    it("shows the very duration the map holds, even between two steps of its slider", () => {
        render(true, 120);
        expect(find("life-max-lifespan")?.textContent).toContain("2 min");
        expect(find("life-max-lifespan")?.textContent).not.toContain("1 min 55");
    });

    it("saves the settings to the map when the switch is turned on", () => {
        render(false);
        const input = find("life-enabled")?.querySelector("input");
        if (!input) throw new Error("No switch");
        flushSync(() => input.click());
        expect(executeUpdateWAMSettings).toHaveBeenCalledWith({
            $case: "updateLifeSettingMessage",
            updateLifeSettingMessage: {
                enabled: true,
                reproductionDelay: 120,
                maxLifespan: 900,
                maxSpeed: 1.5,
                huntInterval: 60,
                dolphinReproductionDelay: 300,
                dolphinMaxLifespan: 3600,
                drinkInterval: 300,
                // The life of the land, off, with its default values.
                landEnabled: false,
                antelopeReproductionDelay: 120,
                antelopeMaxLifespan: 900,
                landHuntInterval: 60,
                landPredatorReproductionDelay: 300,
                landPredatorMaxLifespan: 3600,
                gullsEnabled: false,
                gullHuntInterval: 45,
                gullReproductionDelay: 300,
                gullMaxLifespan: 1800,
            },
        });
        for (const slider of sliders) expect(find(slider)).not.toBeNull();
    });

    it("shows how often the land animals drink, whether the life of the water is on or not", () => {
        render(false);
        expect(find("life-drink-interval")?.textContent).toContain("5 min");
    });

    it("saves the interval between two drinks moved on its slider, the life of the water left off", () => {
        render(false);
        const input = find("life-drink-interval")?.querySelector<HTMLInputElement>('input[type="range"]');
        if (!input) throw new Error("No slider");
        flushSync(() => {
            input.value = "0";
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
        });
        expect(executeUpdateWAMSettings).toHaveBeenLastCalledWith({
            $case: "updateLifeSettingMessage",
            updateLifeSettingMessage: expect.objectContaining({ enabled: false, drinkInterval: 20 }),
        });
    });

    it("saves a setting moved on its slider", () => {
        render(true);
        const input = find("life-max-speed")?.querySelector<HTMLInputElement>('input[type="range"]');
        if (!input) throw new Error("No slider");
        flushSync(() => {
            input.value = "3";
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
        });
        expect(executeUpdateWAMSettings).toHaveBeenLastCalledWith({
            $case: "updateLifeSettingMessage",
            updateLifeSettingMessage: expect.objectContaining({ enabled: true, maxSpeed: 3 }),
        });
    });

    it("turns the life of the land on by its own switch, and shows its settings then", () => {
        render(false);
        expect(find("life-land-landHuntInterval")).toBeNull();
        const input = find("life-land-enabled")?.querySelector("input");
        if (!input) throw new Error("No switch");
        flushSync(() => input.click());
        expect(executeUpdateWAMSettings).toHaveBeenLastCalledWith({
            $case: "updateLifeSettingMessage",
            updateLifeSettingMessage: expect.objectContaining({ enabled: false, landEnabled: true }) as unknown,
        });
        expect(find("life-land-landHuntInterval")?.textContent).toContain("1 min");
        expect(find("life-land-antelopeMaxLifespan")).not.toBeNull();
    });

    it("turns the gulls on by their own switch, and shows their settings then", () => {
        render(true);
        expect(find("life-air-gullHuntInterval")).toBeNull();
        const input = find("life-air-enabled")?.querySelector("input");
        if (!input) throw new Error("No switch");
        flushSync(() => input.click());
        expect(executeUpdateWAMSettings).toHaveBeenLastCalledWith({
            $case: "updateLifeSettingMessage",
            updateLifeSettingMessage: expect.objectContaining({
                enabled: true,
                gullsEnabled: true,
                gullHuntInterval: 45,
                gullReproductionDelay: 300,
                gullMaxLifespan: 1800,
            }) as unknown,
        });
        expect(find("life-air-gullHuntInterval")?.textContent).toContain("45 s");
        expect(find("life-air-gullMaxLifespan")).not.toBeNull();
    });
});
